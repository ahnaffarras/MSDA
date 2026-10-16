package repository

import (
	"context"
	"time"

	"github.com/msda/backend/internal/model"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// AccessLogCollection adalah koleksi log akses DNS per client.
// Ditulis oleh n8n (node "Mongodb Insert: ip_access_dns") dan dibaca juga oleh dashboard.
const AccessLogCollection = "ip_access_dns"

type ClientAccessRepo struct {
	col *mongo.Collection
}

func NewClientAccessRepo(db *mongo.Database) *ClientAccessRepo {
	return &ClientAccessRepo{col: db.Collection(AccessLogCollection)}
}

func (r *ClientAccessRepo) List(ctx context.Context, filter bson.M, page, limit int) ([]model.ClientAccessDNS, int64, error) {
	total, _ := r.col.CountDocuments(ctx, filter)
	skip := (page - 1) * limit
	opts := options.Find().SetSkip(int64(skip)).SetLimit(int64(limit)).SetSort(bson.D{{Key: "timestamp", Value: -1}})
	cur, err := r.col.Find(ctx, filter, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cur.Close(ctx)
	var results []model.ClientAccessDNS
	if err := cur.All(ctx, &results); err != nil {
		return nil, 0, err
	}
	return results, total, nil
}

func (r *ClientAccessRepo) GetByID(ctx context.Context, id primitive.ObjectID) (*model.ClientAccessDNS, error) {
	var result model.ClientAccessDNS
	if err := r.col.FindOne(ctx, bson.M{"_id": id}).Decode(&result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (r *ClientAccessRepo) Stats(ctx context.Context, from, to time.Time) (*model.ClientAccessStats, error) {
	match := TimeRange(from, to)

	// Per day
	perDayPipe := mongo.Pipeline{
		{{"$match", match}},
		{{"$group", bson.M{
			"_id":   bson.M{"$dateToString": bson.M{"format": "%Y-%m-%d", "date": bson.M{"$toDate": "$timestamp"}}},
			"count": bson.M{"$sum": 1},
		}}},
		{{"$sort", bson.D{{Key: "_id", Value: 1}}}},
	}
	// Per type
	perTypePipe := mongo.Pipeline{
		{{"$match", match}},
		{{"$group", bson.M{"_id": "$type", "count": bson.M{"$sum": 1}}}},
		{{"$sort", bson.D{{Key: "count", Value: -1}}}},
	}
	// Per AP
	perAPPipe := mongo.Pipeline{
		{{"$match", match}},
		{{"$group", bson.M{
			"_id":      bson.M{"label": "$ap_info.label", "ip": "$ap_info.ip"},
			"count":    bson.M{"$sum": 1},
		}}},
		{{"$sort", bson.D{{Key: "count", Value: -1}}}},
	}

	var stats model.ClientAccessStats

	// Execute pipelines
	if cur, err := r.col.Aggregate(ctx, perDayPipe); err == nil {
		defer cur.Close(ctx)
		for cur.Next(ctx) {
			var row struct {
				ID    string `bson:"_id"`
				Count int64  `bson:"count"`
			}
			cur.Decode(&row)
			stats.PerDay = append(stats.PerDay, model.AccessStatDay{Date: row.ID, Count: row.Count})
		}
	}

	if cur, err := r.col.Aggregate(ctx, perTypePipe); err == nil {
		defer cur.Close(ctx)
		for cur.Next(ctx) {
			var row struct {
				ID    string `bson:"_id"`
				Count int64  `bson:"count"`
			}
			cur.Decode(&row)
			stats.PerType = append(stats.PerType, model.AccessStatType{Type: row.ID, Count: row.Count})
		}
	}

	if cur, err := r.col.Aggregate(ctx, perAPPipe); err == nil {
		defer cur.Close(ctx)
		for cur.Next(ctx) {
			var row struct {
				ID struct {
					Label string `bson:"label"`
					IP    string `bson:"ip"`
				} `bson:"_id"`
				Count int64 `bson:"count"`
			}
			cur.Decode(&row)
			stats.PerAP = append(stats.PerAP, model.AccessStatAP{APLabel: row.ID.Label, APIP: row.ID.IP, Count: row.Count})
		}
	}

	return &stats, nil
}

func (r *ClientAccessRepo) Summary(ctx context.Context, from, to time.Time) (*model.DashboardSummary, error) {
	match := TimeRange(from, to)

	totalQueries, _ := r.col.CountDocuments(ctx, match)

	// Unique domains
	domainVals, _ := r.col.Distinct(ctx, "domain", match)
	uniqueDomains := int64(len(domainVals))

	// Blacklist hits
	blacklistMatch := TimeRange(from, to)
	blacklistMatch["action"] = "blocked"
	blacklistHits, _ := r.col.CountDocuments(ctx, blacklistMatch)

	// Blacklist clients
	clientVals, _ := r.col.Distinct(ctx, "client_ip", blacklistMatch)
	blacklistClients := int64(len(clientVals))

	return &model.DashboardSummary{
		TotalQueries:     totalQueries,
		UniqueDomains:    uniqueDomains,
		BlacklistHits:    blacklistHits,
		BlacklistClients: blacklistClients,
	}, nil
}

func (r *ClientAccessRepo) LabGrid(ctx context.Context, from time.Time) ([]model.LabGridAP, error) {
	pipe := mongo.Pipeline{
		{{"$match", TimeRange(from, time.Now().UTC().Add(time.Minute))}},
		{{"$sort", bson.D{{Key: "timestamp", Value: -1}}}},
		{{"$group", bson.M{
			"_id":        bson.M{"client_ip": "$client_ip", "ap_ip": "$ap_info.ip", "ap_label": "$ap_info.label"},
			"last_domain": bson.M{"$first": "$domain"},
			"last_action": bson.M{"$first": "$action"},
			"last_enforced": bson.M{"$first": "$enforced"},
			"last_seen":   bson.M{"$first": "$timestamp"},
			"type":        bson.M{"$first": "$type"},
		}}},
		{{"$group", bson.M{
			"_id":     bson.M{"ap_ip": "$_id.ap_ip", "ap_label": "$_id.ap_label"},
			"clients": bson.M{"$push": bson.M{
				"client_ip":   "$_id.client_ip",
				"last_domain": "$last_domain",
				"last_action": "$last_action",
				"last_enforced": "$last_enforced",
				"last_seen":   "$last_seen",
				"type":        "$type",
			}},
		}}},
	}

	cur, err := r.col.Aggregate(ctx, pipe)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var rows []struct {
		ID struct {
			APIP    string `bson:"ap_ip"`
			APLabel string `bson:"ap_label"`
		} `bson:"_id"`
		Clients []model.LabClient `bson:"clients"`
	}
	if err := cur.All(ctx, &rows); err != nil {
		return nil, err
	}

	result := make([]model.LabGridAP, 0, len(rows))
	for _, row := range rows {
		for i := range row.Clients {
			c := &row.Clients[i]
			c.RiskLevel = RiskLevel(c.Type, c.LastAction)
		}
		result = append(result, model.LabGridAP{
			APIP:    row.ID.APIP,
			APLabel: row.ID.APLabel,
			Clients: row.Clients,
		})
	}
	return result, nil
}

func (r *ClientAccessRepo) TopDomains(ctx context.Context, from, to time.Time, domainType string, limit int) ([]model.TopDomain, error) {
	match := TimeRange(from, to)
	if domainType != "" {
		match["type"] = domainType
	}
	pipe := mongo.Pipeline{
		{{"$match", match}},
		{{"$group", bson.M{
			"_id":   bson.M{"domain": "$domain", "group": "$group", "type": "$type"},
			"count": bson.M{"$sum": 1},
		}}},
		{{"$sort", bson.D{{Key: "count", Value: -1}}}},
		{{"$limit", int64(limit)}},
	}
	cur, err := r.col.Aggregate(ctx, pipe)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var rows []struct {
		ID struct {
			Domain string `bson:"domain"`
			Group  string `bson:"group"`
			Type   string `bson:"type"`
		} `bson:"_id"`
		Count int64 `bson:"count"`
	}
	cur.All(ctx, &rows)
	result := make([]model.TopDomain, 0, len(rows))
	for _, row := range rows {
		result = append(result, model.TopDomain{Domain: row.ID.Domain, Group: row.ID.Group, Type: row.ID.Type, Count: row.Count})
	}
	return result, nil
}

func (r *ClientAccessRepo) TopClients(ctx context.Context, from, to time.Time, limit int) ([]model.TopClient, error) {
	match := TimeRange(from, to)
	match["action"] = "blocked"
	pipe := mongo.Pipeline{
		{{"$match", match}},
		{{"$group", bson.M{
			"_id":      bson.M{"client_ip": "$client_ip", "ap_label": "$ap_info.label"},
			"count":    bson.M{"$sum": 1},
		}}},
		{{"$sort", bson.D{{Key: "count", Value: -1}}}},
		{{"$limit", int64(limit)}},
	}
	cur, err := r.col.Aggregate(ctx, pipe)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var rows []struct {
		ID struct {
			ClientIP string `bson:"client_ip"`
			APLabel  string `bson:"ap_label"`
		} `bson:"_id"`
		Count int64 `bson:"count"`
	}
	cur.All(ctx, &rows)
	result := make([]model.TopClient, 0, len(rows))
	for _, row := range rows {
		result = append(result, model.TopClient{ClientIP: row.ID.ClientIP, APLabel: row.ID.APLabel, BlacklistHits: row.Count})
	}
	return result, nil
}

// TimeRange membuat filter rentang waktu yang cocok untuk field `timestamp`
// bertipe BSON Date maupun string ISO-8601 (format JS: 2026-08-27T05:34:55.293Z).
// Perbandingan string ISO sama urutannya dengan urutan waktu, dan MongoDB hanya
// membandingkan antar-tipe yang sama, jadi kedua cabang $or tidak saling mengganggu.
func TimeRange(from, to time.Time) bson.M {
	const isoMs = "2006-01-02T15:04:05.000Z"
	return bson.M{"$or": []bson.M{
		{"timestamp": bson.M{"$gte": from, "$lte": to}},
		{"timestamp": bson.M{"$gte": from.UTC().Format(isoMs), "$lte": to.UTC().Format(isoMs)}},
	}}
}

// RiskLevel menurunkan tingkat risiko dari kategori domain + aksi.
// Aturannya sama dengan dashboard (lib/domain-risk.ts dan lib/query.ts).
func RiskLevel(domainType, action string) string {
	if action == "blocked" {
		return "flag"
	}
	switch domainType {
	case "gambling", "adult", "malware", "phishing", "crypto_miner":
		return "flag"
	case "social_media", "streaming", "gaming":
		return "watch"
	}
	return "safe"
}
