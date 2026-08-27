package redis

import (
	"context"
	"log"

	"github.com/redis/go-redis/v9"
)

func Connect(url string) *redis.Client {
	if url == "" {
		url = "redis://localhost:6379"
	}

	opts, err := redis.ParseURL(url)
	if err != nil {
		log.Printf("[WARN] Redis URL parse error: %v, using defaults", err)
		opts = &redis.Options{Addr: "localhost:6379"}
	}

	rdb := redis.NewClient(opts)

	ctx := context.Background()
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Printf("[WARN] Redis ping failed: %v (continuing without Redis)", err)
	} else {
		log.Println("[INFO] Redis connected")
	}

	return rdb
}
