package repository

import (
	"context"
	"errors"
	"regexp"
	"time"

	"github.com/msda/backend/internal/model"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// ErrNotFound dikembalikan bila dokumen yang dituju tidak ada.
var ErrNotFound = errors.New("not found")

type NotificationRepo struct {
	col *mongo.Collection
}

func NewNotificationRepo(db *mongo.Database) *NotificationRepo {
	return &NotificationRepo{col: db.Collection("notifications")}
}

// EnsureIndexes membuat index yang dipakai filter/hitung notifikasi. Aman dipanggil
// berulang (idempotent). Gagal membuat index tidak boleh menghentikan backend.
func (r *NotificationRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.col.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "timestamp", Value: -1}}},
		{Keys: bson.D{{Key: "status", Value: 1}, {Key: "timestamp", Value: -1}}},
		{Keys: bson.D{{Key: "severity", Value: 1}, {Key: "timestamp", Value: -1}}},
		{Keys: bson.D{{Key: "is_read", Value: 1}, {Key: "timestamp", Value: -1}}},
		{Keys: bson.D{{Key: "dedup_key", Value: 1}}, Options: options.Index().SetSparse(true)},
	})
	return err
}

// NotificationFilter: semua field opsional.
type NotificationFilter struct {
	Status   string // new | acknowledged | resolved
	Severity string // info | warning | critical
	TypeSend string
	From     *time.Time
	To       *time.Time
	Q        string // cari di domain, grup, atau IP klien
}

// newStatusFilter: status "new" termasuk dokumen lama yang belum dibaca.
func newStatusFilter() bson.M {
	return bson.M{"$or": []bson.M{
		{"status": model.StatusNew},
		{"status": bson.M{"$exists": false}, "is_read": false},
	}}
}

func (f NotificationFilter) toBSON() bson.M {
	and := []bson.M{}

	switch f.Status {
	case model.StatusNew:
		and = append(and, newStatusFilter())
	case model.StatusAcknowledged:
		and = append(and, bson.M{"$or": []bson.M{
			{"status": model.StatusAcknowledged},
			{"status": bson.M{"$exists": false}, "is_read": true},
		}})
	case model.StatusResolved:
		and = append(and, bson.M{"status": model.StatusResolved})
	}

	switch f.Severity {
	case "":
	case model.SeverityWarning:
		// warning adalah default, jadi dokumen lama tanpa severity ikut terhitung
		and = append(and, bson.M{"$or": []bson.M{
			{"severity": model.SeverityWarning},
			{"severity": bson.M{"$exists": false}},
		}})
	default:
		and = append(and, bson.M{"severity": f.Severity})
	}

	if f.TypeSend != "" {
		and = append(and, bson.M{"type_send": f.TypeSend})
	}

	if f.From != nil || f.To != nil {
		ts := bson.M{}
		if f.From != nil {
			ts["$gte"] = *f.From
		}
		if f.To != nil {
			ts["$lte"] = *f.To
		}
		and = append(and, bson.M{"timestamp": ts})
	}

	if f.Q != "" {
		// QuoteMeta: input pengguna diperlakukan sebagai teks biasa, bukan regex
		rx := primitive.Regex{Pattern: regexp.QuoteMeta(f.Q), Options: "i"}
		and = append(and, bson.M{"$or": []bson.M{
			{"data.domain": rx},
			{"data.group": rx},
			{"data.client.ip": rx},
		}})
	}

	if len(and) == 0 {
		return bson.M{}
	}
	return bson.M{"$and": and}
}

func (r *NotificationRepo) Create(ctx context.Context, n *model.Notification) error {
	n.ID = primitive.NewObjectID()
	if n.Timestamp.IsZero() {
		n.Timestamp = time.Now()
	}
	if n.Severity == "" {
		n.Severity = model.SeverityWarning
	}
	if n.Status == "" {
		n.Status = model.StatusNew
	}
	_, err := r.col.InsertOne(ctx, n)
	return err
}

func (r *NotificationRepo) List(ctx context.Context, f NotificationFilter, page, limit int) ([]model.Notification, int64, error) {
	filter := f.toBSON()
	total, err := r.col.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, err
	}
	skip := (page - 1) * limit
	opts := options.Find().
		SetSkip(int64(skip)).
		SetLimit(int64(limit)).
		SetSort(bson.D{{Key: "timestamp", Value: -1}, {Key: "_id", Value: -1}})
	cur, err := r.col.Find(ctx, filter, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cur.Close(ctx)
	results := []model.Notification{}
	if err := cur.All(ctx, &results); err != nil {
		return nil, 0, err
	}
	for i := range results {
		results[i].Normalize()
	}
	return results, total, nil
}

// Counts ringkasan untuk badge di sidebar.
type Counts struct {
	Unread   int64      `json:"unread"`
	Critical int64      `json:"critical"`
	LatestID string     `json:"latest_id"`
	LatestAt *time.Time `json:"latest_at"`
}

func (r *NotificationRepo) Counts(ctx context.Context) (Counts, error) {
	var out Counts
	var err error
	if out.Unread, err = r.col.CountDocuments(ctx, newStatusFilter()); err != nil {
		return out, err
	}
	crit := bson.M{"$and": []bson.M{newStatusFilter(), {"severity": model.SeverityCritical}}}
	if out.Critical, err = r.col.CountDocuments(ctx, crit); err != nil {
		return out, err
	}
	var latest model.Notification
	err = r.col.FindOne(ctx, bson.M{}, options.FindOne().SetSort(bson.D{{Key: "timestamp", Value: -1}, {Key: "_id", Value: -1}})).Decode(&latest)
	if err == nil {
		out.LatestID = latest.ID.Hex()
		t := latest.Timestamp
		out.LatestAt = &t
	} else if !errors.Is(err, mongo.ErrNoDocuments) {
		return out, err
	}
	return out, nil
}

// statusUpdate membangun dokumen update untuk perubahan status.
func statusUpdate(status, note, actor string, now time.Time) bson.M {
	set := bson.M{"status": status}
	unset := bson.M{}
	update := bson.M{}

	switch status {
	case model.StatusNew:
		set["is_read"] = false
		unset["ack_by"] = ""
		unset["ack_at"] = ""
		unset["resolved_at"] = ""
	case model.StatusAcknowledged:
		set["is_read"] = true
		set["ack_by"] = actor
		set["ack_at"] = now
		unset["resolved_at"] = ""
	case model.StatusResolved:
		set["is_read"] = true
		set["ack_by"] = actor
		set["resolved_at"] = now
		// $min: mengisi ack_at bila belum ada, dan mempertahankan waktu acknowledge yang lebih awal
		update["$min"] = bson.M{"ack_at": now}
	}
	if note != "" {
		set["note"] = note
	}
	update["$set"] = set
	if len(unset) > 0 {
		update["$unset"] = unset
	}
	return update
}

// SetStatus mengubah status satu notifikasi. ErrNotFound bila id tidak ada.
func (r *NotificationRepo) SetStatus(ctx context.Context, id primitive.ObjectID, status, note, actor string) error {
	res, err := r.col.UpdateOne(ctx, bson.M{"_id": id}, statusUpdate(status, note, actor, time.Now()))
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return ErrNotFound
	}
	return nil
}

// BulkSetStatus mengubah status banyak notifikasi sekaligus; mengembalikan jumlah yang cocok.
func (r *NotificationRepo) BulkSetStatus(ctx context.Context, ids []primitive.ObjectID, status, note, actor string) (int64, error) {
	res, err := r.col.UpdateMany(ctx, bson.M{"_id": bson.M{"$in": ids}}, statusUpdate(status, note, actor, time.Now()))
	if err != nil {
		return 0, err
	}
	return res.MatchedCount, nil
}

// MarkRead (kompatibilitas): menandai satu notifikasi "new" menjadi acknowledged.
func (r *NotificationRepo) MarkRead(ctx context.Context, id primitive.ObjectID, actor string) error {
	filter := bson.M{"$and": []bson.M{{"_id": id}, newStatusFilter()}}
	_, err := r.col.UpdateOne(ctx, filter, statusUpdate(model.StatusAcknowledged, "", actor, time.Now()))
	return err
}

// MarkAllRead (kompatibilitas): semua notifikasi "new" menjadi acknowledged.
func (r *NotificationRepo) MarkAllRead(ctx context.Context, actor string) error {
	_, err := r.col.UpdateMany(ctx, newStatusFilter(), statusUpdate(model.StatusAcknowledged, "", actor, time.Now()))
	return err
}
