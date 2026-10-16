package adguard

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
)

// SyncState adalah dokumen tunggal `adguard_sync_state` (_id: "main").
type SyncState struct {
	LastHash   string    `bson:"last_hash"    json:"last_hash"`
	LastSyncAt time.Time `bson:"last_sync_at" json:"last_sync_at"`
	RuleCount  int       `bson:"rule_count"   json:"rule_count"`
	Status     string    `bson:"status"       json:"status"` // ok | error
	Error      string    `bson:"error,omitempty" json:"error,omitempty"`
	AGHVersion string    `bson:"agh_version,omitempty" json:"agh_version,omitempty"`
}

// StatusUpdate memberi tahu Store status sinkronisasi satu entri blocklist.
type StatusUpdate struct {
	EntryID string
	Status  string // synced | pending | error
	Error   string
}

// Store adalah akses ke MongoDB (diimplementasikan di internal/repository).
type Store interface {
	// EnforceEntries: seluruh entri dns_blacklist (field yang dibutuhkan Entry).
	// Boleh hanya yang berpotensi relevan (block_mode = enforce).
	EnforceEntries(ctx context.Context) ([]Entry, error)
	// GroupDomains: peta group → domain dari dns_info.
	GroupDomains(ctx context.Context, groups []string) (map[string][]string, error)
	// Allowlist: domain dari dns_allowlist (koleksi boleh belum ada).
	Allowlist(ctx context.Context) ([]string, error)
	// ApplyStatus menulis enforce_status/enforce_synced_at/enforce_error; harus hemat
	// (hanya dokumen yang berubah) dan menghapus field enforce_* pada entri non-enforce.
	ApplyStatus(ctx context.Context, updates []StatusUpdate, at time.Time) error
	GetState(ctx context.Context) (*SyncState, error)
	SaveState(ctx context.Context, st *SyncState) error
	// EnforcedSince menjumlahkan access_count ip_access_dns dengan enforced=true sejak t.
	EnforcedSince(ctx context.Context, since time.Time) (int64, error)
	// TopEnforced: domain teratas yang diblokir sejak t.
	TopEnforced(ctx context.Context, since time.Time, limit int) ([]DomainCount, error)
}

// DomainCount dipakai statistik domain teratas.
type DomainCount struct {
	Domain string `json:"domain"`
	Count  int64  `json:"count"`
}

// SyncReport adalah ringkasan satu eksekusi Sync.
type SyncReport struct {
	Changed      bool     `json:"changed"`
	RuleCount    int      `json:"rule_count"`
	Hash         string   `json:"hash"`
	Skipped      int      `json:"skipped_entries"`
	Warnings     []string `json:"warnings,omitempty"`
	DurationMs   int64    `json:"duration_ms"`
	BlockingMode string   `json:"blocking_mode,omitempty"`
}

// Syncer merekonsiliasi aturan AGH dengan MongoDB. Aman dipanggil bersamaan:
// satu eksekusi pada satu waktu (mutex).
type Syncer struct {
	API        API
	Store      Store
	Builder    *Builder
	WantedMode string // blocking mode yang diharapkan (hanya dilaporkan, tidak dipaksa)
	Now        func() time.Time
	mu         sync.Mutex
}

// ruleSet menormalisasi daftar aturan untuk perbandingan (abaikan kosong/komentar, urutan).
func ruleSet(rules []string) string {
	out := make([]string, 0, len(rules))
	for _, r := range rules {
		r = strings.TrimSpace(r)
		if r == "" || strings.HasPrefix(r, "!") || strings.HasPrefix(r, "#") {
			continue
		}
		out = append(out, r)
	}
	sort.Strings(out)
	return strings.Join(out, "\n")
}

// Sync menghitung aturan dari Mongo, membandingkannya dengan keadaan AGH, dan
// hanya memanggil set_rules bila berbeda (atau force). Kegagalan tidak panik:
// dikembalikan sebagai error dan dicatat di adguard_sync_state (status "error").
func (s *Syncer) Sync(ctx context.Context, force bool) (*SyncReport, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	start := s.now()
	rep := &SyncReport{}

	entries, err := s.Store.EnforceEntries(ctx)
	if err != nil {
		return nil, s.fail(ctx, "", fmt.Errorf("load blocklist: %w", err))
	}
	var groups []string
	seen := map[string]bool{}
	for _, e := range entries {
		if e.BlockedLevel == "group" && e.Group != "" && !seen[e.Group] {
			seen[e.Group] = true
			groups = append(groups, e.Group)
		}
	}
	gd, err := s.Store.GroupDomains(ctx, groups)
	if err != nil {
		return nil, s.fail(ctx, "", fmt.Errorf("load groups: %w", err))
	}
	allow, err := s.Store.Allowlist(ctx)
	if err != nil {
		return nil, s.fail(ctx, "", fmt.Errorf("load allowlist: %w", err))
	}

	res := s.Builder.Build(entries, gd, allow, s.now())
	rep.RuleCount, rep.Hash = len(res.Rules), res.Hash

	st, err := s.API.Status(ctx)
	if err != nil {
		// AGH tidak terjangkau: tandai entri pending, simpan error, coba lagi nanti.
		s.markPending(ctx, res, "AdGuard Home is unreachable")
		return nil, s.fail(ctx, "", fmt.Errorf("adguard status: %w", err))
	}

	prev, _ := s.Store.GetState(ctx)
	current, err := s.API.GetRules(ctx)
	if err != nil {
		s.markPending(ctx, res, "Could not read rules from AdGuard Home")
		return nil, s.fail(ctx, st.Version, fmt.Errorf("adguard get rules: %w", err))
	}
	inSync := ruleSet(current) == ruleSet(res.Rules)
	unchangedHash := prev != nil && prev.LastHash == res.Hash && prev.Status == "ok"

	if force || !inSync || !unchangedHash {
		if !inSync || force {
			if err := s.API.SetRules(ctx, res.Rules); err != nil {
				s.markPending(ctx, res, "Failed to push rules to AdGuard Home")
				return nil, s.fail(ctx, st.Version, fmt.Errorf("adguard set_rules: %w", err))
			}
			rep.Changed = true
			if err := s.API.CacheClear(ctx); err != nil {
				rep.Warnings = append(rep.Warnings, "cache_clear failed: "+err.Error())
			}
		}
	}

	if s.WantedMode != "" {
		if m, err := s.API.BlockingMode(ctx); err == nil {
			rep.BlockingMode = m
			if m != s.WantedMode {
				rep.Warnings = append(rep.Warnings, fmt.Sprintf("AdGuard blocking_mode is %q, expected %q", m, s.WantedMode))
			}
		}
	}

	// Status per entri.
	now := s.now()
	var ups []StatusUpdate
	for _, o := range res.Outcomes {
		switch {
		case o.Reason == ReasonNotEnforce || o.Reason == ReasonInactive || o.Reason == ReasonExpired:
			ups = append(ups, StatusUpdate{EntryID: o.EntryID}) // Status "" = hapus field enforce_*
		case o.Included:
			ups = append(ups, StatusUpdate{EntryID: o.EntryID, Status: "synced"})
		default:
			rep.Skipped++
			ups = append(ups, StatusUpdate{EntryID: o.EntryID, Status: "error", Error: reasonText(o.Reason)})
		}
	}
	if err := s.Store.ApplyStatus(ctx, ups, now); err != nil {
		rep.Warnings = append(rep.Warnings, "update entry status: "+err.Error())
	}
	if err := s.Store.SaveState(ctx, &SyncState{
		LastHash: res.Hash, LastSyncAt: now, RuleCount: len(res.Rules), Status: "ok", AGHVersion: st.Version,
	}); err != nil {
		rep.Warnings = append(rep.Warnings, "save sync state: "+err.Error())
	}
	rep.DurationMs = time.Since(start).Milliseconds()
	return rep, nil
}

func (s *Syncer) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

// markPending menandai entri enforce yang seharusnya aktif sebagai "pending".
func (s *Syncer) markPending(ctx context.Context, res Result, msg string) {
	var ups []StatusUpdate
	for _, o := range res.Outcomes {
		if o.Included {
			ups = append(ups, StatusUpdate{EntryID: o.EntryID, Status: "pending", Error: msg})
		}
	}
	if len(ups) > 0 {
		_ = s.Store.ApplyStatus(ctx, ups, s.now())
	}
}

// fail menyimpan status error (tanpa menimpa last_hash) lalu mengembalikan err.
func (s *Syncer) fail(ctx context.Context, version string, err error) error {
	prev, _ := s.Store.GetState(ctx)
	st := &SyncState{Status: "error", Error: truncate(err.Error(), 300), AGHVersion: version}
	if prev != nil {
		st.LastHash, st.LastSyncAt, st.RuleCount = prev.LastHash, prev.LastSyncAt, prev.RuleCount
		if st.AGHVersion == "" {
			st.AGHVersion = prev.AGHVersion
		}
	}
	_ = s.Store.SaveState(ctx, st)
	return err
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

func reasonText(r string) string {
	switch r {
	case ReasonInvalid:
		return "Domain is not valid for DNS blocking"
	case ReasonPublicSuffix:
		return "TLD / public suffix cannot be blocked"
	case ReasonNeverBlock:
		return "Domain is on the never-block list"
	case ReasonAllowlisted:
		return "Overridden by the allowlist"
	case ReasonNoDomain:
		return "Entry has no domain"
	case ReasonGroupEmpty:
		return "Group has no known domains"
	case ReasonLimit:
		return "Rule limit reached"
	}
	return "Not applied"
}

// ErrDisabled dikembalikan Service bila fitur dimatikan.
var ErrDisabled = errors.New("enforcement is disabled")
