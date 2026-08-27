package repository

import (
	"context"

	"github.com/sata-ai/backend/internal/model"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

type AdminRepo struct {
	col *mongo.Collection
}

func NewAdminRepo(db *mongo.Database) *AdminRepo {
	return &AdminRepo{col: db.Collection("admins")}
}

func (r *AdminRepo) FindByUsername(ctx context.Context, username string) (*model.Admin, error) {
	var result model.Admin
	if err := r.col.FindOne(ctx, bson.M{"username": username}).Decode(&result); err != nil {
		return nil, err
	}
	return &result, nil
}
