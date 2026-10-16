package adguard

import (
	"context"
	"log"
	"time"
)

// Service membungkus Syncer + API + Store untuk dipakai handler HTTP.
// Bila cfg.Enabled=false semua metode aman dipanggil dan handler mengembalikan {"enabled":false}.
type Service struct {
	Cfg    Config
	API    API
	Store  Store
	Syncer *Syncer
}

// NewService merakit Service dari Config. API boleh nil bila fitur nonaktif.
func NewService(cfg Config, api API, store Store) *Service {
	s := &Service{Cfg: cfg, API: api, Store: store}
	if cfg.Enabled && api != nil {
		s.Syncer = &Syncer{API: api, Store: store, Builder: NewBuilder(cfg.NeverBlock, cfg.MaxRules), WantedMode: cfg.BlockingMode}
	}
	return s
}

func (s *Service) Enabled() bool { return s != nil && s.Cfg.Enabled && s.Syncer != nil }

// Run menjalankan sinkronisasi saat startup lalu tiap Interval sampai ctx selesai.
func (s *Service) Run(ctx context.Context) {
	if !s.Enabled() {
		return
	}
	do := func() {
		c, cancel := context.WithTimeout(ctx, 60*time.Second)
		defer cancel()
		if rep, err := s.Syncer.Sync(c, false); err != nil {
			log.Printf("[AdGuard] sync failed: %v", err)
		} else if rep.Changed {
			log.Printf("[AdGuard] rules updated: %d rules", rep.RuleCount)
		}
	}
	do()
	t := time.NewTicker(s.Cfg.Interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			do()
		}
	}
}

// StatusView adalah isi GET /adguard/status dan webhook adguard-status.
type StatusView struct {
	Enabled      bool       `json:"enabled"`
	Healthy      bool       `json:"healthy"`
	Version      string     `json:"version,omitempty"`
	Protection   bool       `json:"protection"`
	BlockingMode string     `json:"blocking_mode,omitempty"`
	RuleCount    int        `json:"rule_count"`
	BlockedToday int64      `json:"blocked_today"`
	LastSyncAt   *time.Time `json:"last_sync_at,omitempty"`
	SyncStatus   string     `json:"sync_status,omitempty"`
	Error        string     `json:"error,omitempty"`
	Problems     []string   `json:"problems"`
}

// Status mengumpulkan kondisi saat ini. Healthy = terjangkau, protection aktif, sync terakhir ok dan tidak basi.
func (s *Service) Status(ctx context.Context, now time.Time) StatusView {
	v := StatusView{Enabled: s.Enabled(), Problems: []string{}}
	if !v.Enabled {
		return v
	}
	v.BlockingMode = s.Cfg.BlockingMode
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	st, err := s.API.Status(c)
	if err != nil {
		v.Problems = append(v.Problems, "unreachable")
	} else {
		v.Version, v.Protection = st.Version, st.ProtectionEnabled
		if !st.ProtectionEnabled {
			v.Problems = append(v.Problems, "protection_off")
		}
		if m, e := s.API.BlockingMode(c); e == nil && m != "" {
			v.BlockingMode = m
		}
	}
	if state, e := s.Store.GetState(ctx); e == nil && state != nil {
		t := state.LastSyncAt
		v.LastSyncAt, v.RuleCount, v.SyncStatus, v.Error = &t, state.RuleCount, state.Status, state.Error
		if state.Status == "error" {
			v.Problems = append(v.Problems, "sync_error")
		}
		if now.Sub(state.LastSyncAt) > 3*s.Cfg.Interval {
			v.Problems = append(v.Problems, "sync_stale")
		}
	} else {
		v.Problems = append(v.Problems, "never_synced")
	}
	v.BlockedToday, _ = s.Store.EnforcedSince(ctx, startOfDayWIB(now))
	v.Healthy = len(v.Problems) == 0
	return v
}

// startOfDayWIB: 00:00 WIB (UTC+7) pada hari `now`.
func startOfDayWIB(now time.Time) time.Time {
	wib := time.FixedZone("WIB", 7*3600)
	n := now.In(wib)
	return time.Date(n.Year(), n.Month(), n.Day(), 0, 0, 0, 0, wib)
}

// CheckView: jawaban GET /adguard/check.
type CheckView struct {
	Domain       string   `json:"domain"`
	WouldBlock   bool     `json:"would_block"`
	Reason       string   `json:"reason,omitempty"`
	Rule         string   `json:"rule,omitempty"`
	Rules        []string `json:"rules,omitempty"`
	NeverBlocked bool     `json:"never_block"`
}

// Check memvalidasi domain lalu menanyakan AGH (check_host). Domain tidak valid → ErrInvalid/ErrPublicSuffix.
func (s *Service) Check(ctx context.Context, domain string) (*CheckView, error) {
	if !s.Enabled() {
		return nil, ErrDisabled
	}
	d, err := NormalizeDomain(domain)
	if err != nil {
		return nil, err
	}
	c, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	r, err := s.API.CheckHost(c, d)
	if err != nil {
		return nil, err
	}
	v := &CheckView{Domain: d, WouldBlock: r.Blocked, Reason: r.Reason, Rule: r.Rule, NeverBlocked: s.Syncer.Builder.neverBlocked(d)}
	for _, x := range r.Rules {
		v.Rules = append(v.Rules, x.Text)
	}
	return v, nil
}

// StatsView: jawaban GET /adguard/stats.
type StatsView struct {
	Enabled     bool          `json:"enabled"`
	AGHBlocked  int64         `json:"agh_blocked"`
	AGHQueries  int64         `json:"agh_queries"`
	MSDABlocked int64         `json:"msda_blocked_today"`
	TopBlocked  []DomainCount `json:"top_blocked"`
}

func (s *Service) Stats(ctx context.Context, now time.Time) (*StatsView, error) {
	v := &StatsView{Enabled: s.Enabled(), TopBlocked: []DomainCount{}}
	if !v.Enabled {
		return v, nil
	}
	since := startOfDayWIB(now)
	v.MSDABlocked, _ = s.Store.EnforcedSince(ctx, since)
	if top, err := s.Store.TopEnforced(ctx, since, 10); err == nil && top != nil {
		v.TopBlocked = top
	}
	c, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	if st, err := s.API.Stats(c); err == nil {
		v.AGHBlocked, v.AGHQueries = st.NumBlockedFiltering, st.NumDNSQueries
	}
	return v, nil
}
