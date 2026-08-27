package repository

import (
	"context"

	"github.com/sata-ai/backend/internal/model"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type DNSInfoRepo struct {
	col *mongo.Collection
}

func NewDNSInfoRepo(db *mongo.Database) *DNSInfoRepo {
	return &DNSInfoRepo{col: db.Collection("dns_info")}
}

func (r *DNSInfoRepo) List(ctx context.Context, filter bson.M, page, limit int) ([]model.DNSInfo, int64, error) {
	total, _ := r.col.CountDocuments(ctx, filter)
	skip := (page - 1) * limit
	opts := options.Find().SetSkip(int64(skip)).SetLimit(int64(limit)).SetSort(bson.D{{Key: "domain", Value: 1}})
	cur, err := r.col.Find(ctx, filter, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cur.Close(ctx)
	var results []model.DNSInfo
	if err := cur.All(ctx, &results); err != nil {
		return nil, 0, err
	}
	return results, total, nil
}

func (r *DNSInfoRepo) GetByDomain(ctx context.Context, domain string) (*model.DNSInfo, error) {
	var result model.DNSInfo
	if err := r.col.FindOne(ctx, bson.M{"domain": domain}).Decode(&result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (r *DNSInfoRepo) DistinctGroups(ctx context.Context) ([]string, error) {
	vals, err := r.col.Distinct(ctx, "group", bson.M{})
	if err != nil {
		return nil, err
	}
	var groups []string
	for _, v := range vals {
		if s, ok := v.(string); ok && s != "" {
			groups = append(groups, s)
		}
	}
	return groups, nil
}

func (r *DNSInfoRepo) DistinctTypes(ctx context.Context) ([]string, error) {
	vals, err := r.col.Distinct(ctx, "type", bson.M{})
	if err != nil {
		return nil, err
	}
	var types []string
	for _, v := range vals {
		if s, ok := v.(string); ok && s != "" {
			types = append(types, s)
		}
	}
	return types, nil
}
