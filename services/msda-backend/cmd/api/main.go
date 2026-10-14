package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"github.com/msda/backend/internal/handler"
	"github.com/msda/backend/internal/middleware"
	"github.com/msda/backend/internal/ws"
	"github.com/msda/backend/pkg/mongodb"
	"github.com/msda/backend/pkg/redis"

	"github.com/gin-gonic/gin"
)

func main() {
	// Load .env
	if err := godotenv.Load(); err != nil {
		log.Println("[WARN] .env not found, using system environment variables")
	}

	// Connect MongoDB
	mongoClient, err := mongodb.Connect(os.Getenv("MONGODB_URI"))
	if err != nil {
		log.Fatalf("[FATAL] MongoDB connect: %v", err)
	}
	defer mongoClient.Disconnect(context.Background())
	dbName := getEnv("MONGODB_DB", "")
	if dbName == "" {
		dbName = getEnv("MSDA_DB", "msda")
	}
	db := mongoClient.Database(dbName)

	// Connect Redis
	rdb := redis.Connect(os.Getenv("REDIS_URL"))

	// WebSocket hub
	hub := ws.NewHub()
	go hub.Run()

	// Gin engine
	if getEnv("APP_ENV", "development") == "production" {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(middleware.Logger())
	r.Use(middleware.CORS())

	// Register all routes
	handler.RegisterRoutes(r, db, rdb, hub)

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "msda-backend"})
	})

	// WebSocket endpoint
	r.GET("/ws/dashboard", func(c *gin.Context) {
		ws.ServeWS(hub, c.Writer, c.Request)
	})

	port := getEnv("PORT", "8080")
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	log.Printf("[INFO] MSDA Backend running on :%s", port)

	// Graceful shutdown
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[FATAL] listen: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("[INFO] Shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
