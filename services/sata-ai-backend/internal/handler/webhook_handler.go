package handler

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/sata-ai/backend/internal/model"
	"github.com/sata-ai/backend/internal/repository"
	"github.com/sata-ai/backend/internal/ws"
)

type WebhookHandler struct {
	repo *repository.NotificationRepo
	hub  *ws.Hub
}

func NewWebhookHandler(repo *repository.NotificationRepo, hub *ws.Hub) *WebhookHandler {
	return &WebhookHandler{repo: repo, hub: hub}
}

func (h *WebhookHandler) Receive(c *gin.Context) {
	var payload model.WebhookPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Respond immediately — process async
	c.JSON(http.StatusOK, gin.H{"received": true})

	go func() {
		ctx := c.Request.Context()

		// Save to notification history
		notif := &model.Notification{
			TypeSend:  payload.TypeSend,
			Data:      payload.Data,
			IsRead:    false,
			Timestamp: payload.Timestamp,
		}
		if err := h.repo.Create(ctx, notif); err != nil {
			log.Printf("[Webhook] failed to save notification: %v", err)
		}

		// Broadcast to all connected dashboard clients via WebSocket
		h.hub.Broadcast(payload.TypeSend, payload.Data)
		log.Printf("[Webhook] broadcast event=%s to WS clients", payload.TypeSend)
	}()
}
