package repository

import (
	"context"
	"time"

	"github.com/sata-ai/backend/internal/model"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type NotificationRepo struct {
	col *mongo.Collection
}

func NewNotificationRepo(db *mongo.Database) *NotificationRepo {
	return &NotificationRepo{col: db.Collection("notifications")}
}

func (r *NotificationRepo) Create(ctx context.Context, n *model.Notification) error {
	n.ID = primitive.NewObjectID()
	if n.Timestamp.IsZero() {
		n.Timestamp = time.Now()
	}
	_, err := r.col.InsertOne(ctx, n)
	return err
}

func (r *NotificationRepo) List(ctx context.Context, page, limit int) ([]model.Notification, int64, error) {
	total, _ := r.col.CountDocuments(ctx, bson.M{})
	skip := (page - 1) * limit
	opts := options.Find().SetSkip(int64(skip)).SetLimit(int64(limit)).SetSort(bson.D{{Key: "timestamp", Value: -1}})
	cur, err := r.col.Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cur.Close(ctx)
	var results []model.Notification
	if err := cur.All(ctx, &results); err != nil {
		return nil, 0, err
	}
	return results, total, nil
}

func (r *NotificationRepo) MarkRead(ctx context.Context, id primitive.ObjectID) error {
	_, err := r.col.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"is_read": true}})
	return err
}

func (r *NotificationRepo) MarkAllRead(ctx context.Context) error {
	_, err := r.col.UpdateMany(ctx, bson.M{"is_read": false}, bson.M{"$set": bson.M{"is_read": true}})
	return err
}
