package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/msda/backend/internal/middleware"
	"github.com/msda/backend/internal/repository"
	"github.com/msda/backend/internal/ws"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/mongo"
)

// RegisterRoutes memasang semua rute /api/v1.
//
// Model keamanan:
//   - GET /health ............. publik (hanya "ok"/"down").
//   - POST /webhooks/n8n ...... butuh X-MSDA-Token (dikirim n8n).
//   - Semua rute lain ......... butuh X-Internal-Token (hanya dikirim server Next.js
//     setelah memverifikasi sesi login dashboard). Backend tidak punya login sendiri.
func RegisterRoutes(r *gin.Engine, db *mongo.Database, rdb *redis.Client, hub *ws.Hub) {
	// Repos
	blacklistRepo := repository.NewBlacklistRepo(db)
	dnsInfoRepo := repository.NewDNSInfoRepo(db)
	clientRepo := repository.NewClientAccessRepo(db)
	notifRepo := repository.NewNotificationRepo(db)

	// Handlers
	dashH := NewDashboardHandler(clientRepo)
	dnsH := NewDNSInfoHandler(dnsInfoRepo)
	blH := NewBlacklistHandler(blacklistRepo)
	caH := NewClientAccessHandler(clientRepo)
	apH := NewAccessPointHandler(clientRepo)
	webhookH := NewWebhookHandler(notifRepo, hub)
	notifH := NewNotificationHandler(notifRepo)

	v1 := r.Group("/api/v1")

	// ── Publik ─────────────────────────────────────────────────────────
	v1.GET("/health", Health(db, rdb))

	// ── Webhook (dari n8n, token sendiri) ──────────────────────────────
	v1.POST("/webhooks/n8n", middleware.RequireWebhookToken(), webhookH.Receive)

	// ── Terlindungi (hanya lewat proxy dashboard) ──────────────────────
	api := v1.Group("", middleware.RequireInternalToken(), middleware.Actor())

	dash := api.Group("/dashboard")
	{
		dash.GET("/summary", dashH.Summary)
		dash.GET("/lab-grid", dashH.LabGrid)
		dash.GET("/top-domains", dashH.TopDomains)
		dash.GET("/top-clients", dashH.TopClients)
	}

	dns := api.Group("/dns-info")
	{
		dns.GET("", dnsH.List)
		dns.GET("/groups", dnsH.Groups)
		dns.GET("/types", dnsH.Types)
		dns.GET("/:domain", dnsH.Detail)
	}

	bl := api.Group("/blacklist")
	{
		bl.GET("", blH.List)
		bl.GET("/:id", blH.GetByID)
		bl.POST("", blH.Create)
		bl.PUT("/:id", blH.Update)
		bl.PATCH("/:id/toggle-active", blH.ToggleActive)
		bl.DELETE("/:id", blH.Delete)
	}

	ca := api.Group("/client-access")
	{
		ca.GET("", caH.List)
		ca.GET("/stats", caH.Stats)
		ca.GET("/export", caH.Export)
		ca.GET("/:id", caH.GetByID)
	}

	ap := api.Group("/access-points")
	{
		ap.GET("", apH.List)
		ap.GET("/:ap_ip/clients", apH.Clients)
	}

	notif := api.Group("/notifications")
	{
		notif.GET("", notifH.List)
		notif.GET("/unread-count", notifH.UnreadCount)
		notif.POST("/bulk-status", notifH.BulkSetStatus)
		notif.PATCH("/read-all", notifH.ReadAll)
		notif.PATCH("/:id/read", notifH.MarkRead)
		notif.PATCH("/:id/status", notifH.SetStatus)
	}
}
