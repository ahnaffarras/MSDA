package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/mongo"
)

// Health memeriksa konektivitas MongoDB dan Redis. Publik (tanpa autentikasi) dan
// sengaja hanya mengembalikan "ok"/"down" — tanpa pesan error — agar tidak membocorkan
// detail infrastruktur.
func Health(db *mongo.Database, rdb *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()

		mongoStatus, redisStatus := "ok", "ok"
		if err := db.Client().Ping(ctx, nil); err != nil {
			mongoStatus = "down"
		}
		if rdb == nil || rdb.Ping(ctx).Err() != nil {
			redisStatus = "down"
		}

		code, status := http.StatusOK, "ok"
		if mongoStatus != "ok" || redisStatus != "ok" {
			code, status = http.StatusServiceUnavailable, "degraded"
		}
		c.JSON(code, gin.H{"status": status, "service": "msda-backend", "mongo": mongoStatus, "redis": redisStatus})
	}
}
