package repository

import (
	"context"
	"time"

	"github.com/msda/backend/internal/adguard"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// AdguardRepo mengimplementasikan adguard.Store di atas MongoDB.
type AdguardRepo struct {
	bl, info, allow, state, access *mongo.Collection
}

func NewAdguardRepo(db *mongo.Database) *AdguardRepo {
	return &AdguardRepo{
		bl: db.Collection("dns_blacklist"), info: db.Collection("dns_info"),
		allow: db.Collection("dns_allowlist"), state: db.Collection("adguard_sync_state"),
		access: db.Collection("ip_access_dns"),
	}
}

var _ adguard.Store = (*AdguardRepo)(nil)

func str(m bson.M, k string) string { s, _ := m[k].(string); return s }

func (r *AdguardRepo) EnforceEntries(ctx context.Context) ([]adguard.Entry, error) {
	// Ambil semua entri (bukan hanya enforce) agar entri yang baru diubah ke "alert"
	// ikut dibersihkan status enforce_*-nya lewat Outcome not_enforce.
	cur, err := r.bl.Find(ctx, bson.M{}, options.Find().SetLimit(50000))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var out []adguard.Entry
	for cur.Next(ctx) {
		var m bson.M
		if err := cur.Decode(&m); err != nil {
			return nil, err
		}
		id, _ := m["_id"].(primitive.ObjectID)
		e := adguard.Entry{
			ID: id.Hex(), BlockedLevel: str(m, "blocked_level"), Domain: str(m, "domain"),
			Group: str(m, "group"), BlockMode: str(m, "block_mode"),
			IsActive: true, // entri lama tanpa is_active dianggap aktif
		}
		if v, ok := m["is_active"].(bool); ok {
			e.IsActive = v
		}
		if v, ok := m["include_subdomains"].(bool); ok {
			e.IncludeSubdomains = &v
		}
		if t, ok := m["expires_at"].(primitive.DateTime); ok {
			tt := t.Time()
			e.ExpiresAt = &tt
		}
		out = append(out, e)
	}
	return out, cur.Err()
}

func (r *AdguardRepo) GroupDomains(ctx context.Context, groups []string) (map[string][]string, error) {
	res := map[string][]string{}
	if len(groups) == 0 {
		return res, nil
	}
	cur, err := r.info.Find(ctx, bson.M{"group": bson.M{"$in": groups}},
		options.Find().SetProjection(bson.M{"domain": 1, "group": 1}).SetLimit(100000))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	for cur.Next(ctx) {
		var m bson.M
		if cur.Decode(&m) == nil {
			if d, g := str(m, "domain"), str(m, "group"); d != "" {
				res[g] = append(res[g], d)
			}
		}
	}
	return res, cur.Err()
}

func (r *AdguardRepo) Allowlist(ctx context.Context) ([]string, error) {
	cur, err := r.allow.Find(ctx, bson.M{}, options.Find().SetProjection(bson.M{"domain": 1}).SetLimit(20000))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var out []string
	for cur.Next(ctx) {
		var m bson.M
		if cur.Decode(&m) == nil {
			if d := str(m, "domain"); d != "" {
				out = append(out, d)
			}
		}
	}
	return out, cur.Err()
}

func (r *AdguardRepo) ApplyStatus(ctx context.Context, ups []adguard.StatusUpdate, at time.Time) error {
	var models []mongo.WriteModel
	for _, u := range ups {
		id, err := primitive.ObjectIDFromHex(u.EntryID)
		if err != nil {
			continue
		}
		if u.Status == "" {
			// non-enforce / tidak berlaku: hapus field enforce_* (hanya bila ada)
			models = append(models, mongo.NewUpdateOneModel().
				SetFilter(bson.M{"_id": id, "enforce_status": bson.M{"$exists": true}}).
				SetUpdate(bson.M{"$unset": bson.M{"enforce_status": "", "enforce_synced_at": "", "enforce_error": ""}}))
			continue
		}
		set := bson.M{"enforce_status": u.Status}
		unset := bson.M{}
		if u.Status == "synced" {
			set["enforce_synced_at"] = at
			unset["enforce_error"] = ""
		} else {
			set["enforce_error"] = u.Error
		}
		upd := bson.M{"$set": set}
		if len(unset) > 0 {
			upd["$unset"] = unset
		}
		// Hemat: lewati dokumen yang sudah berstatus sama & tanpa perubahan error.
		filter := bson.M{"_id": id}
		if u.Status == "synced" {
			filter["enforce_status"] = bson.M{"$ne": "synced"}
		} else {
			filter["$or"] = bson.A{bson.M{"enforce_status": bson.M{"$ne": u.Status}}, bson.M{"enforce_error": bson.M{"$ne": u.Error}}}
		}
		models = append(models, mongo.NewUpdateOneModel().SetFilter(filter).SetUpdate(upd))
	}
	if len(models) == 0 {
		return nil
	}
	_, err := r.bl.BulkWrite(ctx, models, options.BulkWrite().SetOrdered(false))
	return err
}

func (r *AdguardRepo) GetState(ctx context.Context) (*adguard.SyncState, error) {
	var st adguard.SyncState
	err := r.state.FindOne(ctx, bson.M{"_id": "main"}).Decode(&st)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &st, nil
}

func (r *AdguardRepo) SaveState(ctx context.Context, st *adguard.SyncState) error {
	_, err := r.state.ReplaceOne(ctx, bson.M{"_id": "main"}, st, options.Replace().SetUpsert(true))
	return err
}

func (r *AdguardRepo) EnforcedSince(ctx context.Context, since time.Time) (int64, error) {
	cur, err := r.access.Aggregate(ctx, bson.A{
		bson.M{"$match": bson.M{"enforced": true, "timestamp": bson.M{"$gte": since}}},
		bson.M{"$group": bson.M{"_id": nil, "n": bson.M{"$sum": bson.M{"$ifNull": bson.A{"$access_count", 1}}}}},
	})
	if err != nil {
		return 0, err
	}
	defer cur.Close(ctx)
	var rows []struct {
		N int64 `bson:"n"`
	}
	if err := cur.All(ctx, &rows); err != nil || len(rows) == 0 {
		return 0, err
	}
	return rows[0].N, nil
}

func (r *AdguardRepo) TopEnforced(ctx context.Context, since time.Time, limit int) ([]adguard.DomainCount, error) {
	cur, err := r.access.Aggregate(ctx, bson.A{
		bson.M{"$match": bson.M{"enforced": true, "timestamp": bson.M{"$gte": since}}},
		bson.M{"$group": bson.M{"_id": "$domain", "n": bson.M{"$sum": bson.M{"$ifNull": bson.A{"$access_count", 1}}}}},
		bson.M{"$sort": bson.M{"n": -1}},
		bson.M{"$limit": limit},
	})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var rows []struct {
		ID string `bson:"_id"`
		N  int64  `bson:"n"`
	}
	if err := cur.All(ctx, &rows); err != nil {
		return nil, err
	}
	out := make([]adguard.DomainCount, 0, len(rows))
	for _, x := range rows {
		out = append(out, adguard.DomainCount{Domain: x.ID, Count: x.N})
	}
	return out, nil
}
