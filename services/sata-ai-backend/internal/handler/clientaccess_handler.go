package handler

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sata-ai/backend/internal/repository"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

type ClientAccessHandler struct {
	repo *repository.ClientAccessRepo
}

func NewClientAccessHandler(repo *repository.ClientAccessRepo) *ClientAccessHandler {
	return &ClientAccessHandler{repo: repo}
}

func (h *ClientAccessHandler) List(c *gin.Context) {
	page, _  := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if page < 1  { page = 1 }
	if limit < 1 || limit > 200 { limit = 20 }

	filter := bson.M{}
	if v := c.Query("domain");    v != "" { filter["domain"]       = bson.M{"$regex": v, "$options": "i"} }
	if v := c.Query("client_ip"); v != "" { filter["client_ip"]    = v }
	if v := c.Query("group");     v != "" { filter["group"]        = v }
	if v := c.Query("action");    v != "" { filter["action"]       = v }
	if v := c.Query("ap_ip");     v != "" { filter["ap_info.ip"]   = v }

	if from := c.Query("from"); from != "" {
		if t, err := time.Parse(time.RFC3339, from); err == nil {
			if filter["timestamp"] == nil { filter["timestamp"] = bson.M{} }
			filter["timestamp"].(bson.M)["$gte"] = t
		}
	}
	if to := c.Query("to"); to != "" {
		if t, err := time.Parse(time.RFC3339, to); err == nil {
			if filter["timestamp"] == nil { filter["timestamp"] = bson.M{} }
			filter["timestamp"].(bson.M)["$lte"] = t
		}
	}

	items, total, err := h.repo.List(c.Request.Context(), filter, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	totalPages := int(total)/limit
	if int(total)%limit != 0 { totalPages++ }

	c.JSON(http.StatusOK, gin.H{
		"data": items,
		"meta": gin.H{"page": page, "limit": limit, "total": total, "total_pages": totalPages},
	})
}

func (h *ClientAccessHandler) GetByID(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	item, err := h.repo.GetByID(c.Request.Context(), id)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": item})
}

func (h *ClientAccessHandler) Stats(c *gin.Context) {
	rangeStr := c.DefaultQuery("range", "7d")
	from, to := parseRange(rangeStr)

	stats, err := h.repo.Stats(c.Request.Context(), from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": stats})
}

func (h *ClientAccessHandler) Export(c *gin.Context) {
	rangeStr := c.DefaultQuery("range", "today")
	from, to := parseRange(rangeStr)

	filter := bson.M{"timestamp": bson.M{"$gte": from, "$lte": to}}
	items, _, err := h.repo.List(c.Request.Context(), filter, 1, 5000)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	filename := fmt.Sprintf("sata-access-log-%s.csv", time.Now().Format("20060102"))
	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Header("Content-Type", "text/csv")

	w := csv.NewWriter(c.Writer)
	w.Write([]string{"timestamp", "domain", "group", "type", "action", "client_ip", "ap_label", "ap_ip", "access_count"})
	for _, item := range items {
		w.Write([]string{
			item.Timestamp.Format(time.RFC3339),
			item.Domain,
			item.Group,
			item.Type,
			item.Action,
			item.ClientIP,
			item.APInfo.Label,
			item.APInfo.IP,
			strconv.Itoa(item.AccessCount),
		})
	}
	w.Flush()
}
