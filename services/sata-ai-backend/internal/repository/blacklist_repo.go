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

type BlacklistRepo struct {
	col *mongo.Collection
}

func NewBlacklistRepo(db *mongo.Database) *BlacklistRepo {
	return &BlacklistRepo{col: db.Collection("dns_blacklist")}
}

func (r *BlacklistRepo) List(ctx context.Context, filter bson.M, page, limit int) ([]model.DNSBlacklist, int64, error) {
	total, _ := r.col.CountDocuments(ctx, filter)
	skip := (page - 1) * limit
	opts := options.Find().SetSkip(int64(skip)).SetLimit(int64(limit)).SetSort(bson.D{{Key: "created_at", Value: -1}})
	cur, err := r.col.Find(ctx, filter, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cur.Close(ctx)
	var results []model.DNSBlacklist
	if err := cur.All(ctx, &results); err != nil {
		return nil, 0, err
	}
	return results, total, nil
}

func (r *BlacklistRepo) GetByID(ctx context.Context, id primitive.ObjectID) (*model.DNSBlacklist, error) {
	var result model.DNSBlacklist
	if err := r.col.FindOne(ctx, bson.M{"_id": id}).Decode(&result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (r *BlacklistRepo) Create(ctx context.Context, entry *model.DNSBlacklist) (*model.DNSBlacklist, error) {
	entry.ID = primitive.NewObjectID()
	entry.CreatedAt = time.Now()
	entry.UpdatedAt = time.Now()
	_, err := r.col.InsertOne(ctx, entry)
	if err != nil {
		return nil, err
	}
	return entry, nil
}

func (r *BlacklistRepo) Update(ctx context.Context, id primitive.ObjectID, update bson.M) (*model.DNSBlacklist, error) {
	update["updated_at"] = time.Now()
	_, err := r.col.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": update})
	if err != nil {
		return nil, err
	}
	return r.GetByID(ctx, id)
}

func (r *BlacklistRepo) Delete(ctx context.Context, id primitive.ObjectID) error {
	_, err := r.col.DeleteOne(ctx, bson.M{"_id": id})
	return err
}

func (r *BlacklistRepo) ToggleActive(ctx context.Context, id primitive.ObjectID) (*model.DNSBlacklist, error) {
	entry, err := r.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return r.Update(ctx, id, bson.M{"is_active": !entry.IsActive})
}
