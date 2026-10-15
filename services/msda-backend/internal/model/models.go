package model

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// ── Pagination ───────────────────────────────────────────────────────────────

type Meta struct {
	Page       int   `json:"page"`
	Limit      int   `json:"limit"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"total_pages"`
}

type ListResponse[T any] struct {
	Data []T  `json:"data"`
	Meta Meta `json:"meta"`
}

type DataResponse[T any] struct {
	Data T `json:"data"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

// ── DNS Info ─────────────────────────────────────────────────────────────────

type IPScan struct {
	IP   string `bson:"ip"   json:"ip"`
	Type string `bson:"type" json:"type"`
	Geo  string `bson:"geo"  json:"geo"`
}

type InfoApp struct {
	Platform           []string `bson:"platform"             json:"platform"`
	CompanyResponsible string   `bson:"company_responsible"  json:"company_responsible"`
	Owner              string   `bson:"owner"                json:"owner"`
}

type HostISP struct {
	City   string `bson:"city"   json:"city"`
	Region string `bson:"region" json:"region"`
	Org    string `bson:"org"    json:"org"`
	ASN    string `bson:"asn"    json:"asn"`
}

type DNSInfo struct {
	ID           primitive.ObjectID `bson:"_id,omitempty"    json:"id"`
	Domain       string             `bson:"domain"           json:"domain"`
	Group        string             `bson:"group"            json:"group"`
	Type         string             `bson:"type"             json:"type"`
	InfoApp      InfoApp            `bson:"info_app"         json:"info_app"`
	IPScan       []IPScan           `bson:"ip_scan"          json:"ip_scan"`
	PTRHostname  string             `bson:"ptr_hostname"     json:"ptr_hostname"`
	HostISP      HostISP            `bson:"host_isp"         json:"host_isp"`
	LastVerified FlexTime           `bson:"last_verified"    json:"last_verified"`
	Timestamp    FlexTime           `bson:"timestamp"        json:"timestamp"`
}

// ── DNS Blacklist ─────────────────────────────────────────────────────────────

type DNSBlacklist struct {
	ID           primitive.ObjectID `bson:"_id,omitempty"    json:"id"`
	BlockedLevel string             `bson:"blocked_level"    json:"blocked_level"` // "domain" | "group"
	Domain       string             `bson:"domain,omitempty" json:"domain,omitempty"`
	Group        string             `bson:"group,omitempty"  json:"group,omitempty"`
	Type         string             `bson:"type"             json:"type"` // gambling|adult|malware|phishing|crypto_miner|social_media|streaming|gaming|testing|custom
	IsActive     bool               `bson:"is_active"        json:"is_active"`
	CreatedAt    FlexTime           `bson:"created_at"       json:"created_at"`
	UpdatedAt    FlexTime           `bson:"updated_at"       json:"updated_at"`
}

type BlacklistRequest struct {
	BlockedLevel string `json:"blocked_level" binding:"required,oneof=domain group"`
	Domain       string `json:"domain"`
	Group        string `json:"group"`
	Type         string `json:"type" binding:"required,oneof=gambling adult malware phishing crypto_miner social_media streaming gaming testing custom"`
	IsActive     *bool  `json:"is_active"`
}

// ── Client Access DNS ─────────────────────────────────────────────────────────

type APInfo struct {
	Label string `bson:"label" json:"label"`
	IP    string `bson:"ip"    json:"ip"`
}

type ClientAccessDNS struct {
	ID          primitive.ObjectID `bson:"_id,omitempty"   json:"id"`
	Timestamp   FlexTime           `bson:"timestamp"       json:"timestamp"`
	Domain      string             `bson:"domain"          json:"domain"`
	Group       string             `bson:"group"           json:"group"`
	Type        string             `bson:"type"            json:"type"`
	Action      string             `bson:"action"          json:"action"` // "allowed" | "blocked"
	ClientIP    string             `bson:"client_ip"       json:"client_ip"`
	APInfo      APInfo             `bson:"ap_info"         json:"ap_info"`
	AccessCount int                `bson:"access_count"    json:"access_count"`
}

// ── Notification ──────────────────────────────────────────────────────────────

type NotificationClient struct {
	IP          string `bson:"ip"           json:"ip"`
	AccessCount int    `bson:"access_count" json:"access_count"`
	APInfo      APInfo `bson:"ap_info"      json:"ap_info"`
}

type NotificationData struct {
	Domain []string             `bson:"domain" json:"domain"`
	Group  string               `bson:"group"  json:"group"`
	Type   string               `bson:"type"   json:"type"`
	Client []NotificationClient `bson:"client" json:"client"`
}

// Nilai severity dan status notifikasi. Dokumen lama (sebelum B1) tidak punya
// kedua field ini; gunakan Notification.Normalize() untuk mengisi defaultnya.
const (
	SeverityInfo     = "info"
	SeverityWarning  = "warning"
	SeverityCritical = "critical"

	StatusNew          = "new"
	StatusAcknowledged = "acknowledged"
	StatusResolved     = "resolved"
)

type Notification struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	TypeSend  string             `bson:"type_send"     json:"type_send"` // "blacklist_alert" | "batch_summary" | "anomaly_alert" | "system_alert"
	Data      NotificationData   `bson:"data"          json:"data"`
	IsRead    bool               `bson:"is_read"       json:"is_read"`
	Timestamp time.Time          `bson:"timestamp"     json:"timestamp"`

	// ── Ditambahkan di B1 (semua opsional / kompatibel mundur) ──
	Severity   string     `bson:"severity,omitempty"    json:"severity"`            // info | warning | critical (default warning)
	DedupKey   string     `bson:"dedup_key,omitempty"   json:"dedup_key,omitempty"` // diisi n8n untuk mengelompokkan alert sejenis
	Status     string     `bson:"status,omitempty"      json:"status"`              // new | acknowledged | resolved (default new)
	AckBy      string     `bson:"ack_by,omitempty"      json:"ack_by,omitempty"`    // pengguna dashboard yang terakhir mengubah status
	AckAt      *time.Time `bson:"ack_at,omitempty"      json:"ack_at,omitempty"`
	ResolvedAt *time.Time `bson:"resolved_at,omitempty" json:"resolved_at,omitempty"`
	Note       string     `bson:"note,omitempty"        json:"note,omitempty"`
}

// Normalize mengisi severity/status default untuk dokumen lama.
// Dokumen lama yang is_read=true dianggap sudah acknowledged.
func (n *Notification) Normalize() {
	if n.Severity == "" {
		n.Severity = SeverityWarning
	}
	if n.Status == "" {
		if n.IsRead {
			n.Status = StatusAcknowledged
		} else {
			n.Status = StatusNew
		}
	}
}

// ── Webhook Payload (dari n8n) ────────────────────────────────────────────────

// WebhookPayload adalah kontrak POST /api/v1/webhooks/n8n. Field severity dan
// dedup_key opsional: payload lama tanpa keduanya tetap diterima.
type WebhookPayload struct {
	TypeSend  string           `json:"type_send" binding:"required,oneof=blacklist_alert batch_summary anomaly_alert system_alert"`
	Data      NotificationData `json:"data"`
	Timestamp time.Time        `json:"timestamp"`
	Severity  string           `json:"severity"  binding:"omitempty,oneof=info warning critical"`
	DedupKey  string           `json:"dedup_key" binding:"omitempty,max=200"`
}

// NotificationStatusRequest: body PATCH /notifications/:id/status
type NotificationStatusRequest struct {
	Status string `json:"status" binding:"required,oneof=new acknowledged resolved"`
	Note   string `json:"note"   binding:"max=500"`
}

// NotificationBulkStatusRequest: body POST /notifications/bulk-status
type NotificationBulkStatusRequest struct {
	IDs    []string `json:"ids"    binding:"required,min=1,max=200"`
	Status string   `json:"status" binding:"required,oneof=new acknowledged resolved"`
	Note   string   `json:"note"   binding:"max=500"`
}

// ── Dashboard Summary ─────────────────────────────────────────────────────────

type DashboardSummary struct {
	TotalQueries     int64  `json:"total_queries"`
	UniqueDomains    int64  `json:"unique_domains"`
	NewDomains       int64  `json:"new_domains"`
	BlacklistHits    int64  `json:"blacklist_hits"`
	BlacklistClients int64  `json:"blacklist_clients"`
	CachedResponses  int64  `json:"cached_responses"`
	Range            string `json:"range"`
}

// ── Lab Grid ──────────────────────────────────────────────────────────────────

type LabClient struct {
	ClientIP   string   `bson:"client_ip"   json:"client_ip"`
	LastDomain string   `bson:"last_domain" json:"last_domain"`
	LastAction string   `bson:"last_action" json:"last_action"`
	LastSeen   FlexTime `bson:"last_seen"   json:"last_seen"`
	Type       string   `bson:"type"        json:"type"`
	RiskLevel  string   `bson:"-"           json:"risk_level"` // safe | watch | flag, dihitung di repo
}

type LabGridAP struct {
	APLabel string      `json:"ap_label"`
	APIP    string      `json:"ap_ip"`
	Clients []LabClient `json:"clients"`
}

// ── Access Point ──────────────────────────────────────────────────────────────

type AccessPoint struct {
	Label         string `json:"label"`
	IP            string `json:"ip"`
	ActiveClients int    `json:"active_clients"`
}

// ── Top Domain / Client ───────────────────────────────────────────────────────

type TopDomain struct {
	Domain string `json:"domain"`
	Group  string `json:"group"`
	Type   string `json:"type"`
	Count  int64  `json:"count"`
}

type TopClient struct {
	ClientIP      string `json:"client_ip"`
	APLabel       string `json:"ap_label"`
	BlacklistHits int64  `json:"blacklist_hits"`
}

// ── Client Access Stats ───────────────────────────────────────────────────────

type AccessStatDay struct {
	Date  string `json:"date"`
	Count int64  `json:"count"`
}

type AccessStatType struct {
	Type  string `json:"type"`
	Count int64  `json:"count"`
}

type AccessStatAP struct {
	APLabel string `json:"ap_label"`
	APIP    string `json:"ap_ip"`
	Count   int64  `json:"count"`
}

type ClientAccessStats struct {
	PerDay  []AccessStatDay  `json:"per_day"`
	PerType []AccessStatType `json:"per_type"`
	PerAP   []AccessStatAP   `json:"per_ap"`
}

// ── WebSocket Event ───────────────────────────────────────────────────────────

type WSEvent struct {
	Event     string      `json:"event"`
	Data      interface{} `json:"data"`
	Timestamp time.Time   `json:"timestamp"`
}
