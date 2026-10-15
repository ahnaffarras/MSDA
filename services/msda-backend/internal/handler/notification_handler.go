package handler

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/msda/backend/internal/middleware"
	"github.com/msda/backend/internal/model"
	"github.com/msda/backend/internal/repository"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type NotificationHandler struct {
	repo *repository.NotificationRepo
}

func NewNotificationHandler(repo *repository.NotificationRepo) *NotificationHandler {
	return &NotificationHandler{repo: repo}
}

var (
	validStatuses   = map[string]bool{model.StatusNew: true, model.StatusAcknowledged: true, model.StatusResolved: true}
	validSeverities = map[string]bool{model.SeverityInfo: true, model.SeverityWarning: true, model.SeverityCritical: true}
	validTypeSends  = map[string]bool{"blacklist_alert": true, "batch_summary": true, "anomaly_alert": true, "system_alert": true}
)

// parseTimeParam menerima RFC3339 atau YYYY-MM-DD. Untuk tanggal saja pada batas
// atas ("to"), dipakai akhir hari tersebut (UTC) supaya hari itu ikut tercakup.
func parseTimeParam(v string, endOfDay bool) (*time.Time, bool) {
	if v == "" {
		return nil, true
	}
	if t, err := time.Parse(time.RFC3339, v); err == nil {
		return &t, true
	}
	if t, err := time.Parse("2006-01-02", v); err == nil {
		if endOfDay {
			t = t.Add(24*time.Hour - time.Millisecond)
		}
		return &t, true
	}
	return nil, false
}

func parseNotificationFilter(c *gin.Context) (repository.NotificationFilter, string) {
	var f repository.NotificationFilter

	f.Status = c.Query("status")
	if f.Status != "" && !validStatuses[f.Status] {
		return f, "invalid status (use new, acknowledged or resolved)"
	}
	f.Severity = c.Query("severity")
	if f.Severity != "" && !validSeverities[f.Severity] {
		return f, "invalid severity (use info, warning or critical)"
	}
	f.TypeSend = c.Query("type_send")
	if f.TypeSend != "" && !validTypeSends[f.TypeSend] {
		return f, "invalid type_send"
	}

	var ok bool
	if f.From, ok = parseTimeParam(c.Query("from"), false); !ok {
		return f, "invalid from (use RFC3339 or YYYY-MM-DD)"
	}
	if f.To, ok = parseTimeParam(c.Query("to"), true); !ok {
		return f, "invalid to (use RFC3339 or YYYY-MM-DD)"
	}

	f.Q = strings.TrimSpace(c.Query("q"))
	if len(f.Q) > 100 {
		f.Q = f.Q[:100]
	}
	return f, ""
}

// GET /notifications?page=&limit=&status=&severity=&type_send=&from=&to=&q=
func (h *NotificationHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}

	f, msg := parseNotificationFilter(c)
	if msg != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	items, total, err := h.repo.List(c.Request.Context(), f, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load notifications"})
		return
	}
	totalPages := int(total) / limit
	if int(total)%limit != 0 {
		totalPages++
	}

	c.JSON(http.StatusOK, gin.H{
		"data": items,
		"meta": gin.H{"page": page, "limit": limit, "total": total, "total_pages": totalPages},
	})
}

// GET /notifications/unread-count
func (h *NotificationHandler) UnreadCount(c *gin.Context) {
	counts, err := h.repo.Counts(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count notifications"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": counts})
}

// PATCH /notifications/:id/status   body: {"status": "...", "note": "..."}
func (h *NotificationHandler) SetStatus(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var req model.NotificationStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	note := strings.TrimSpace(req.Note)
	if err := h.repo.SetStatus(c.Request.Context(), id, req.Status, note, middleware.ActorFrom(c)); err != nil {
		if err == repository.ErrNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "notification not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update notification"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"updated": true, "status": req.Status}})
}

// POST /notifications/bulk-status   body: {"ids": [...], "status": "...", "note": "..."}
func (h *NotificationHandler) BulkSetStatus(c *gin.Context) {
	var req model.NotificationBulkStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	ids := make([]primitive.ObjectID, 0, len(req.IDs))
	for _, raw := range req.IDs {
		id, err := primitive.ObjectIDFromHex(raw)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id in list"})
			return
		}
		ids = append(ids, id)
	}
	n, err := h.repo.BulkSetStatus(c.Request.Context(), ids, req.Status, strings.TrimSpace(req.Note), middleware.ActorFrom(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update notifications"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"updated": n, "status": req.Status}})
}

// PATCH /notifications/:id/read  (kompatibilitas: new → acknowledged)
func (h *NotificationHandler) MarkRead(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := h.repo.MarkRead(c.Request.Context(), id, middleware.ActorFrom(c)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update notification"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"updated": true}})
}

// PATCH /notifications/read-all  (kompatibilitas: semua "new" → acknowledged)
func (h *NotificationHandler) ReadAll(c *gin.Context) {
	if err := h.repo.MarkAllRead(c.Request.Context(), middleware.ActorFrom(c)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update notifications"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"updated": true}})
}
