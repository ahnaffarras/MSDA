package adguard

import (
	"context"
	"errors"
	"sort"
	"strings"
	"testing"
	"time"
)

// ── mocks ────────────────────────────────────────────────────────────────

type mockAPI struct {
	rules       []string
	down        bool
	setCalls    int
	cacheClears int
	protection  bool
	mode        string
}

var errDown = errors.New("connection refused")

func (m *mockAPI) Status(context.Context) (*Status, error) {
	if m.down {
		return nil, errDown
	}
	return &Status{Version: "v0.107.0", Running: true, ProtectionEnabled: m.protection}, nil
}
func (m *mockAPI) GetRules(context.Context) ([]string, error) {
	if m.down {
		return nil, errDown
	}
	return append([]string(nil), m.rules...), nil
}
func (m *mockAPI) SetRules(_ context.Context, r []string) error {
	if m.down {
		return errDown
	}
	m.setCalls++
	m.rules = append([]string(nil), r...)
	return nil
}
func (m *mockAPI) CheckHost(context.Context, string) (*CheckResult, error) {
	return &CheckResult{}, nil
}
func (m *mockAPI) Stats(context.Context) (*Stats, error)             { return &Stats{}, nil }
func (m *mockAPI) CacheClear(context.Context) error                  { m.cacheClears++; return nil }
func (m *mockAPI) SetProtection(_ context.Context, e bool) error     { m.protection = e; return nil }
func (m *mockAPI) BlockingMode(context.Context) (string, error)      { return m.mode, nil }
func (m *mockAPI) SetBlockingMode(_ context.Context, s string) error { m.mode = s; return nil }

type mockStore struct {
	entries []Entry
	allow   []string
	state   *SyncState
	status  map[string]StatusUpdate
}

func (s *mockStore) EnforceEntries(context.Context) ([]Entry, error) { return s.entries, nil }
func (s *mockStore) GroupDomains(context.Context, []string) (map[string][]string, error) {
	return map[string][]string{}, nil
}
func (s *mockStore) Allowlist(context.Context) ([]string, error) { return s.allow, nil }
func (s *mockStore) ApplyStatus(_ context.Context, u []StatusUpdate, _ time.Time) error {
	if s.status == nil {
		s.status = map[string]StatusUpdate{}
	}
	for _, x := range u {
		s.status[x.EntryID] = x
	}
	return nil
}
func (s *mockStore) GetState(context.Context) (*SyncState, error) { return s.state, nil }
func (s *mockStore) SaveState(_ context.Context, st *SyncState) error {
	c := *st
	s.state = &c
	return nil
}
func (s *mockStore) EnforcedSince(context.Context, time.Time) (int64, error) { return 7, nil }
func (s *mockStore) TopEnforced(context.Context, time.Time, int) ([]DomainCount, error) {
	return nil, nil
}

func newSyncer(api *mockAPI, st *mockStore) *Syncer {
	return &Syncer{API: api, Store: st, Builder: NewBuilder(nil, 0), WantedMode: "null_ip", Now: func() time.Time { return now }}
}

// ── tests ────────────────────────────────────────────────────────────────

func TestSync_IdempotentSecondRunDoesNotCallSetRules(t *testing.T) {
	api := &mockAPI{mode: "null_ip"}
	st := &mockStore{entries: []Entry{enf("1", "a.com"), enf("2", "b.com")}}
	s := newSyncer(api, st)

	r1, err := s.Sync(context.Background(), false)
	if err != nil || !r1.Changed || api.setCalls != 1 || api.cacheClears != 1 {
		t.Fatalf("first sync: rep=%+v err=%v set=%d clears=%d", r1, err, api.setCalls, api.cacheClears)
	}
	r2, err := s.Sync(context.Background(), false)
	if err != nil || r2.Changed || api.setCalls != 1 || api.cacheClears != 1 {
		t.Fatalf("second sync must be a no-op: rep=%+v err=%v set=%d", r2, err, api.setCalls)
	}
	if st.state.Status != "ok" || st.state.RuleCount != 2 || st.status["1"].Status != "synced" {
		t.Fatalf("state=%+v status=%+v", st.state, st.status)
	}
}

func TestSync_DriftIsCorrected(t *testing.T) {
	api := &mockAPI{mode: "null_ip"}
	st := &mockStore{entries: []Entry{enf("1", "a.com")}}
	s := newSyncer(api, st)
	if _, err := s.Sync(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	api.rules = append(api.rules, "||manual-edit.com^") // diedit manual di UI AGH
	rep, err := s.Sync(context.Background(), false)
	if err != nil || !rep.Changed || api.setCalls != 2 {
		t.Fatalf("drift must trigger set_rules: %+v %v", rep, err)
	}
	sort.Strings(api.rules)
	if strings.Join(api.rules, ",") != "||a.com^" {
		t.Fatalf("rules = %v", api.rules)
	}
}

func TestSync_ReorderedRulesAreNotDrift(t *testing.T) {
	api := &mockAPI{mode: "null_ip", rules: []string{"! comment", "||b.com^", "", "||a.com^"}}
	st := &mockStore{entries: []Entry{enf("1", "a.com"), enf("2", "b.com")}}
	rep, err := newSyncer(api, st).Sync(context.Background(), false)
	if err != nil || rep.Changed || api.setCalls != 0 {
		t.Fatalf("same rule set must not push: %+v %v", rep, err)
	}
}

func TestSync_AGHDown_DoesNotPanic_SetsErrorAndPending(t *testing.T) {
	api := &mockAPI{down: true}
	st := &mockStore{entries: []Entry{enf("1", "a.com")}, state: &SyncState{LastHash: "old", RuleCount: 5, Status: "ok"}}
	rep, err := newSyncer(api, st).Sync(context.Background(), false)
	if err == nil || rep != nil {
		t.Fatalf("expected error, got rep=%+v err=%v", rep, err)
	}
	if st.state.Status != "error" || st.state.Error == "" {
		t.Fatalf("state should record error: %+v", st.state)
	}
	if st.state.LastHash != "old" || st.state.RuleCount != 5 {
		t.Fatalf("error must not overwrite last good hash: %+v", st.state)
	}
	if st.status["1"].Status != "pending" {
		t.Fatalf("entry should be pending, got %+v", st.status["1"])
	}
	// pulih → sync berikutnya sukses
	api.down = false
	if _, err := newSyncer(api, st).Sync(context.Background(), false); err != nil {
		t.Fatalf("recovery failed: %v", err)
	}
	if st.state.Status != "ok" || st.status["1"].Status != "synced" {
		t.Fatalf("after recovery: %+v %+v", st.state, st.status["1"])
	}
}

func TestSync_RejectedEntryGetsErrorStatus(t *testing.T) {
	api := &mockAPI{mode: "null_ip"}
	st := &mockStore{entries: []Entry{enf("1", "co.id"), enf("2", "ok.com")}}
	if _, err := newSyncer(api, st).Sync(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	if st.status["1"].Status != "error" || st.status["1"].Error == "" {
		t.Errorf("co.id should be error: %+v", st.status["1"])
	}
	if st.status["2"].Status != "synced" {
		t.Errorf("ok.com should be synced: %+v", st.status["2"])
	}
}

func TestSync_BlockingModeMismatchOnlyWarns(t *testing.T) {
	api := &mockAPI{mode: "default"}
	rep, err := newSyncer(api, &mockStore{}).Sync(context.Background(), false)
	if err != nil || len(rep.Warnings) == 0 || api.mode != "default" {
		t.Fatalf("should warn without changing mode: %+v %v mode=%s", rep, err, api.mode)
	}
}

func TestService_DisabledIsInert(t *testing.T) {
	s := NewService(Config{}, nil, &mockStore{})
	if s.Enabled() {
		t.Fatal("must be disabled")
	}
	if v := s.Status(context.Background(), now); v.Enabled || !v.Healthy == false && false {
		t.Fatalf("status = %+v", v)
	}
	if _, err := s.Check(context.Background(), "a.com"); !errors.Is(err, ErrDisabled) {
		t.Fatalf("check err = %v", err)
	}
}

func TestService_StatusProblems(t *testing.T) {
	api := &mockAPI{protection: false}
	st := &mockStore{state: &SyncState{Status: "ok", LastSyncAt: now.Add(-time.Hour)}}
	svc := NewService(Config{Enabled: true, Interval: 5 * time.Minute, BlockingMode: "null_ip"}, api, st)
	v := svc.Status(context.Background(), now)
	joined := strings.Join(v.Problems, ",")
	if v.Healthy || !strings.Contains(joined, "protection_off") || !strings.Contains(joined, "sync_stale") {
		t.Fatalf("problems = %v", v.Problems)
	}
	api.down = true
	if v = svc.Status(context.Background(), now); !strings.Contains(strings.Join(v.Problems, ","), "unreachable") {
		t.Fatalf("problems = %v", v.Problems)
	}
}

func TestLoadConfig(t *testing.T) {
	env := func(m map[string]string) func(string) string { return func(k string) string { return m[k] } }
	if c, err := LoadConfig(env(map[string]string{})); err != nil || c.Enabled {
		t.Fatalf("disabled by default, no validation: %+v %v", c, err)
	}
	ok := map[string]string{"MSDA_ENFORCEMENT_ENABLED": "true", "ADGUARD_URL": "http://adguard:3000/", "ADGUARD_USER": "u", "ADGUARD_PASSWORD": "p", "ADGUARD_SYNC_INTERVAL": "2m", "MSDA_NEVER_BLOCK": "a.com, b.com"}
	c, err := LoadConfig(env(ok))
	if err != nil || !c.Enabled || c.URL != "http://adguard:3000" || c.Interval != 2*time.Minute || c.BlockingMode != "null_ip" || len(c.NeverBlock) != 2 {
		t.Fatalf("cfg=%+v err=%v", c, err)
	}
	for k, v := range map[string]string{"ADGUARD_BLOCKING_MODE": "refused", "ADGUARD_SYNC_INTERVAL": "5s", "ADGUARD_URL": ""} {
		m := map[string]string{}
		for a, b := range ok {
			m[a] = b
		}
		m[k] = v
		if _, err := LoadConfig(env(m)); err == nil {
			t.Errorf("%s=%q should be rejected", k, v)
		}
	}
}
