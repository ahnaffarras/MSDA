package handler

import (
	"context"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/msda/backend/internal/adguard"
	"github.com/msda/backend/internal/middleware"
)

// AdguardHandler melayani /api/v1/adguard/* dan webhook adguard-status.
// Saat fitur nonaktif semua endpoint menjawab 200 {"enabled": false} (bukan 404).
type AdguardHandler struct {
	svc *adguard.Service
}

func NewAdguardHandler(svc *adguard.Service) *AdguardHandler { return &AdguardHandler{svc: svc} }

var disabledJSON = gin.H{"enabled": false}

func (h *AdguardHandler) guard(c *gin.Context) bool {
	if !h.svc.Enabled() {
		c.JSON(http.StatusOK, disabledJSON)
		return false
	}
	return true
}

func (h *AdguardHandler) Status(c *gin.Context) {
	c.JSON(http.StatusOK, h.svc.Status(c.Request.Context(), time.Now()))
}

// WebhookStatus: status ringkas untuk n8n (dijaga X-MSDA-Token di routes).
func (h *AdguardHandler) WebhookStatus(c *gin.Context) {
	v := h.svc.Status(c.Request.Context(), time.Now())
	c.JSON(http.StatusOK, gin.H{
		"enabled": v.Enabled, "healthy": v.Healthy, "problems": v.Problems,
		"protection": v.Protection, "rule_count": v.RuleCount, "last_sync_at": v.LastSyncAt,
		"sync_status": v.SyncStatus, "version": v.Version,
	})
}

func (h *AdguardHandler) Sync(c *gin.Context) {
	if !h.guard(c) {
		return
	}
	// Lepas dari pembatalan request: dashboard mungkin memutus koneksi lebih dulu, sinkronisasi tetap selesai.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(c.Request.Context()), 60*time.Second)
	defer cancel()
	rep, err := h.svc.Syncer.Sync(ctx, c.Query("force") == "true")
	if err != nil {
		log.Printf("[AdGuard] manual sync by %q failed: %v", middleware.ActorFrom(c), err)
		// 202: perubahan tersimpan di Mongo; ticker akan mencoba lagi.
		c.JSON(http.StatusAccepted, gin.H{"enabled": true, "ok": false, "error": "sync failed; will retry automatically"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"enabled": true, "ok": true, "report": rep})
}

func (h *AdguardHandler) Protection(c *gin.Context) {
	if !h.guard(c) {
		return
	}
	var req struct {
		Enabled *bool `json:"enabled" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "enabled (boolean) is required"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	if err := h.svc.API.SetProtection(ctx, *req.Enabled); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "AdGuard Home could not be reached"})
		return
	}
	log.Printf("[AdGuard] protection set to %v by %q", *req.Enabled, middleware.ActorFrom(c))
	c.JSON(http.StatusOK, gin.H{"enabled": true, "protection": *req.Enabled})
}

func (h *AdguardHandler) Check(c *gin.Context) {
	if !h.guard(c) {
		return
	}
	v, err := h.svc.Check(c.Request.Context(), c.Query("domain"))
	switch {
	case errors.Is(err, adguard.ErrEmpty), errors.Is(err, adguard.ErrInvalid), errors.Is(err, adguard.ErrPublicSuffix):
		c.JSON(http.StatusBadRequest, gin.H{"enabled": true, "error": err.Error()})
	case err != nil:
		c.JSON(http.StatusBadGateway, gin.H{"enabled": true, "error": "AdGuard Home could not be reached"})
	default:
		c.JSON(http.StatusOK, gin.H{"enabled": true, "data": v})
	}
}

func (h *AdguardHandler) Stats(c *gin.Context) {
	v, err := h.svc.Stats(c.Request.Context(), time.Now())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load stats"})
		return
	}
	c.JSON(http.StatusOK, v)
}
