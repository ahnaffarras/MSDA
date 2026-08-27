package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sata-ai/backend/internal/model"
	"github.com/sata-ai/backend/internal/repository"
	"go.mongodb.org/mongo-driver/bson"
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

	filter := bson.M{
		"ap_info.ip":  apIP,
		"timestamp":   bson.M{"$gte": from},
	}

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
				LastSeen:   item.Timestamp,
				RiskLevel:  item.Type,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{"data": clients})
}
