package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/msda/backend/internal/model"
	"github.com/msda/backend/internal/repository"
)

type AccessPointHandler struct {
	repo *repository.ClientAccessRepo
}

func NewAccessPointHandler(repo *repository.ClientAccessRepo) *AccessPointHandler {
	return &AccessPointHandler{repo: repo}
}

func (h *AccessPointHandler) List(c *gin.Context) {
	from := time.Now().UTC().Add(-8 * time.Hour)

	grid, err := h.repo.LabGrid(c.Request.Context(), from)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	aps := make([]model.AccessPoint, 0, len(grid))
	for _, g := range grid {
		aps = append(aps, model.AccessPoint{
			Label:         g.APLabel,
			IP:            g.APIP,
			ActiveClients: len(g.Clients),
		})
	}
	c.JSON(http.StatusOK, gin.H{"data": aps})
}

func (h *AccessPointHandler) Clients(c *gin.Context) {
	apIP := c.Param("ap_ip")
	from := time.Now().UTC().Add(-8 * time.Hour)

	filter := repository.TimeRange(from, time.Now().UTC().Add(time.Minute))
	filter["ap_info.ip"] = apIP

	items, _, err := h.repo.List(c.Request.Context(), filter, 1, 200)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Deduplicate — latest event per client_ip
	seen := map[string]bool{}
	var clients []model.LabClient
	for _, item := range items {
		if !seen[item.ClientIP] {
			seen[item.ClientIP] = true
			clients = append(clients, model.LabClient{
				ClientIP:   item.ClientIP,
				LastDomain: item.Domain,
				LastAction: item.Action,
				LastEnforced: item.Enforced,
				LastSeen:   item.Timestamp,
				RiskLevel:  repository.RiskLevel(item.Type, item.Action),
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{"data": clients})
}
