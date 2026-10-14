package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/msda/backend/internal/repository"
)

type DashboardHandler struct {
	repo *repository.ClientAccessRepo
}

func NewDashboardHandler(repo *repository.ClientAccessRepo) *DashboardHandler {
	return &DashboardHandler{repo: repo}
}

func parseRange(rangeStr string) (time.Time, time.Time) {
	now := time.Now().UTC()
	switch rangeStr {
	case "7d":
		return now.Add(-7 * 24 * time.Hour), now
	case "30d":
		return now.Add(-30 * 24 * time.Hour), now
	default: // "today"
		y, m, d := now.Date()
		from := time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
		return from, now
	}
}

func (h *DashboardHandler) Summary(c *gin.Context) {
	rangeStr := c.DefaultQuery("range", "today")
	from, to := parseRange(rangeStr)

	summary, err := h.repo.Summary(c.Request.Context(), from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	summary.Range = rangeStr
	c.JSON(http.StatusOK, gin.H{"data": summary})
}

func (h *DashboardHandler) LabGrid(c *gin.Context) {
	// Default: aktifitas dalam 8 jam terakhir
	hours, _ := strconv.Atoi(c.DefaultQuery("hours", "8"))
	from := time.Now().UTC().Add(-time.Duration(hours) * time.Hour)

	grid, err := h.repo.LabGrid(c.Request.Context(), from)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": grid})
}

func (h *DashboardHandler) TopDomains(c *gin.Context) {
	rangeStr := c.DefaultQuery("range", "today")
	from, to := parseRange(rangeStr)
	domainType := c.Query("type")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))

	domains, err := h.repo.TopDomains(c.Request.Context(), from, to, domainType, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": domains})
}

func (h *DashboardHandler) TopClients(c *gin.Context) {
	rangeStr := c.DefaultQuery("range", "today")
	from, to := parseRange(rangeStr)
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))

	clients, err := h.repo.TopClients(c.Request.Context(), from, to, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": clients})
}
