package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/sata-ai/backend/internal/middleware"
	"github.com/sata-ai/backend/internal/repository"
	"github.com/sata-ai/backend/internal/ws"
	"go.mongodb.org/mongo-driver/mongo"
)

func RegisterRoutes(r *gin.Engine, db *mongo.Database, rdb *redis.Client, hub *ws.Hub) {
	// Repos
	adminRepo    := repository.NewAdminRepo(db)
	blacklistRepo := repository.NewBlacklistRepo(db)
	dnsInfoRepo  := repository.NewDNSInfoRepo(db)
	clientRepo   := repository.NewClientAccessRepo(db)
	notifRepo    := repository.NewNotificationRepo(db)

	// Handlers
	authH    := NewAuthHandler(adminRepo)
	dashH    := NewDashboardHandler(clientRepo)
	dnsH     := NewDNSInfoHandler(dnsInfoRepo)
	blH      := NewBlacklistHandler(blacklistRepo)
	caH      := NewClientAccessHandler(clientRepo)
	apH      := NewAccessPointHandler(clientRepo)
	webhookH := NewWebhookHandler(notifRepo, hub)
	notifH   := NewNotificationHandler(notifRepo)

	v1 := r.Group("/api/v1")

	// ── Auth (public) ──────────────────────────────────────────────────
	auth := v1.Group("/auth")
	{
		auth.POST("/login", authH.Login)
		auth.POST("/logout", authH.Logout)
		auth.GET("/me", middleware.RequireAuth(), authH.Me)
	}

	// ── Dashboard (public read) ────────────────────────────────────────
	dash := v1.Group("/dashboard")
	{
		dash.GET("/summary", dashH.Summary)
		dash.GET("/lab-grid", dashH.LabGrid)
		dash.GET("/top-domains", dashH.TopDomains)
		dash.GET("/top-clients", dashH.TopClients)
	}

	// ── DNS Info (public read) ─────────────────────────────────────────
	dns := v1.Group("/dns-info")
	{
		dns.GET("", dnsH.List)
		dns.GET("/groups", dnsH.Groups)
		dns.GET("/types", dnsH.Types)
		dns.GET("/:domain", dnsH.Detail)
	}

	// ── Blacklist (admin CRUD) ─────────────────────────────────────────
	bl := v1.Group("/blacklist", middleware.RequireAuth())
	{
		bl.GET("", blH.List)
		bl.GET("/:id", blH.GetByID)
		bl.POST("", blH.Create)
		bl.PUT("/:id", blH.Update)
		bl.PATCH("/:id/toggle-active", blH.ToggleActive)
		bl.DELETE("/:id", blH.Delete)
	}

	// ── Client Access (public read) ────────────────────────────────────
	ca := v1.Group("/client-access")
	{
		ca.GET("", caH.List)
		ca.GET("/stats", caH.Stats)
		ca.GET("/export", caH.Export)
		ca.GET("/:id", caH.GetByID)
	}

	// ── Access Points (public read) ────────────────────────────────────
	ap := v1.Group("/access-points")
	{
		ap.GET("", apH.List)
		ap.GET("/:ap_ip/clients", apH.Clients)
	}

	// ── Webhook (from n8n) ─────────────────────────────────────────────
	v1.POST("/webhooks/n8n", middleware.RequireWebhookToken(), webhookH.Receive)

	// ── Notifications ──────────────────────────────────────────────────
	notif := v1.Group("/notifications")
	{
		notif.GET("", notifH.List)
		notif.PATCH("/read-all", notifH.ReadAll)
		notif.PATCH("/:id/read", notifH.MarkRead)
	}

	_ = rdb // available for future caching layer
}
