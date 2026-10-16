// Package adguard berisi klien HTTP untuk AdGuard Home (AGH), pembangun aturan
// dari blocklist MSDA, dan rekonsiliasi (Sync). Hanya memakai library standar
// kecuali public-suffix list dari golang.org/x/net.
//
// Endpoint AGH yang dipakai (diverifikasi terhadap openapi.yaml AGH v0.107.x):
//
//	GET  /control/status                 versi, protection_enabled, running
//	GET  /control/filtering/status       user_rules, filter list
//	POST /control/filtering/set_rules    {"rules":[...]}  (penggantian penuh)
//	GET  /control/filtering/check_host   ?name=  → reason, rule(s)
//	GET  /control/stats                  num_blocked_filtering, top_blocked_domains
//	POST /control/cache_clear
//	POST /control/protection             {"enabled":bool}
//	GET  /control/dns_info               blocking_mode
//	POST /control/dns_config             {"blocking_mode":"..."}
//
// Autentikasi: HTTP Basic.
package adguard

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// API adalah antarmuka minimal yang dibutuhkan Syncer dan handler. Dibuat
// sebagai interface agar mudah di-mock pada tes.
type API interface {
	Status(ctx context.Context) (*Status, error)
	GetRules(ctx context.Context) ([]string, error)
	SetRules(ctx context.Context, rules []string) error
	CheckHost(ctx context.Context, name string) (*CheckResult, error)
	Stats(ctx context.Context) (*Stats, error)
	CacheClear(ctx context.Context) error
	SetProtection(ctx context.Context, enabled bool) error
	BlockingMode(ctx context.Context) (string, error)
	SetBlockingMode(ctx context.Context, mode string) error
}

// Status adalah subset respons GET /control/status.
type Status struct {
	Version           string `json:"version"`
	Running           bool   `json:"running"`
	ProtectionEnabled bool   `json:"protection_enabled"`
}

// CheckResult adalah subset respons GET /control/filtering/check_host.
type CheckResult struct {
	Reason  string `json:"reason"` // mis. FilteredBlackList, NotFilteredNotFound
	Rule    string `json:"rule"`
	Rules   []Rule `json:"rules"`
	Blocked bool   `json:"-"`
}

// Rule adalah satu aturan yang cocok pada check_host.
type Rule struct {
	Text         string `json:"text"`
	FilterListID int64  `json:"filter_list_id"`
}

// Stats adalah subset respons GET /control/stats.
type Stats struct {
	NumBlockedFiltering int64              `json:"num_blocked_filtering"`
	NumDNSQueries       int64              `json:"num_dns_queries"`
	TopBlocked          []map[string]int64 `json:"top_blocked_domains"`
}

// HTTPClient mengimplementasikan API lewat HTTP Basic.
type HTTPClient struct {
	BaseURL string
	User    string
	Pass    string
	HC      *http.Client
	// Retries = jumlah percobaan ulang (di luar percobaan pertama) untuk galat jaringan / 5xx.
	Retries int
	// Backoff awal; berlipat dua tiap percobaan.
	Backoff time.Duration
}

// NewHTTPClient membuat klien dengan timeout dan retry bawaan yang wajar.
func NewHTTPClient(baseURL, user, pass string) *HTTPClient {
	return &HTTPClient{
		BaseURL: strings.TrimRight(baseURL, "/"),
		User:    user,
		Pass:    pass,
		HC:      &http.Client{Timeout: 10 * time.Second},
		Retries: 2,
		Backoff: 300 * time.Millisecond,
	}
}

// ErrHTTP dikembalikan untuk status non-2xx. Body sengaja dipotong; kredensial tidak pernah dicatat.
type ErrHTTP struct {
	Status int
	Body   string
}

func (e *ErrHTTP) Error() string { return fmt.Sprintf("adguard: HTTP %d: %s", e.Status, e.Body) }

func (c *HTTPClient) do(ctx context.Context, method, path string, query url.Values, in, out any) error {
	var payload []byte
	if in != nil {
		b, err := json.Marshal(in)
		if err != nil {
			return err
		}
		payload = b
	}
	target := c.BaseURL + path
	if len(query) > 0 {
		target += "?" + query.Encode()
	}

	attempts := c.Retries + 1
	backoff := c.Backoff
	var lastErr error
	for i := 0; i < attempts; i++ {
		if i > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
			}
			backoff *= 2
		}
		var body io.Reader
		if payload != nil {
			body = bytes.NewReader(payload)
		}
		req, err := http.NewRequestWithContext(ctx, method, target, body)
		if err != nil {
			return err
		}
		req.SetBasicAuth(c.User, c.Pass)
		if payload != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		req.Header.Set("Accept", "application/json")

		resp, err := c.HC.Do(req)
		if err != nil {
			lastErr = err
			if ctx.Err() != nil {
				return ctx.Err()
			}
			continue // galat jaringan: coba lagi
		}
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
		resp.Body.Close()

		if resp.StatusCode >= 500 {
			lastErr = &ErrHTTP{Status: resp.StatusCode, Body: trim(string(raw))}
			continue
		}
		if resp.StatusCode < 200 || resp.StatusCode > 299 {
			return &ErrHTTP{Status: resp.StatusCode, Body: trim(string(raw))}
		}
		if out != nil && len(bytes.TrimSpace(raw)) > 0 {
			if err := json.Unmarshal(raw, out); err != nil {
				return fmt.Errorf("adguard: decode %s: %w", path, err)
			}
		}
		return nil
	}
	if lastErr == nil {
		lastErr = errors.New("adguard: request failed")
	}
	return lastErr
}

func trim(s string) string {
	s = strings.TrimSpace(s)
	if len(s) > 200 {
		return s[:200]
	}
	return s
}

func (c *HTTPClient) Status(ctx context.Context) (*Status, error) {
	var s Status
	if err := c.do(ctx, http.MethodGet, "/control/status", nil, nil, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

func (c *HTTPClient) GetRules(ctx context.Context) ([]string, error) {
	var out struct {
		UserRules []string `json:"user_rules"`
	}
	if err := c.do(ctx, http.MethodGet, "/control/filtering/status", nil, nil, &out); err != nil {
		return nil, err
	}
	return out.UserRules, nil
}

// SetRules mengganti SELURUH aturan pengguna AGH (idempoten).
func (c *HTTPClient) SetRules(ctx context.Context, rules []string) error {
	if rules == nil {
		rules = []string{}
	}
	return c.do(ctx, http.MethodPost, "/control/filtering/set_rules", nil, map[string]any{"rules": rules}, nil)
}

func (c *HTTPClient) CheckHost(ctx context.Context, name string) (*CheckResult, error) {
	var r CheckResult
	q := url.Values{"name": {name}}
	if err := c.do(ctx, http.MethodGet, "/control/filtering/check_host", q, nil, &r); err != nil {
		return nil, err
	}
	r.Blocked = strings.HasPrefix(r.Reason, "Filtered")
	return &r, nil
}

func (c *HTTPClient) Stats(ctx context.Context) (*Stats, error) {
	var s Stats
	if err := c.do(ctx, http.MethodGet, "/control/stats", nil, nil, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

func (c *HTTPClient) CacheClear(ctx context.Context) error {
	return c.do(ctx, http.MethodPost, "/control/cache_clear", nil, nil, nil)
}

func (c *HTTPClient) SetProtection(ctx context.Context, enabled bool) error {
	return c.do(ctx, http.MethodPost, "/control/protection", nil, map[string]any{"enabled": enabled}, nil)
}

func (c *HTTPClient) BlockingMode(ctx context.Context) (string, error) {
	var out struct {
		BlockingMode string `json:"blocking_mode"`
	}
	if err := c.do(ctx, http.MethodGet, "/control/dns_info", nil, nil, &out); err != nil {
		return "", err
	}
	return out.BlockingMode, nil
}

// SetBlockingMode: AGH menolak POST /control/dns_config parsial pada beberapa
// versi; kita kirim hanya blocking_mode (field lain tidak diubah).
func (c *HTTPClient) SetBlockingMode(ctx context.Context, mode string) error {
	return c.do(ctx, http.MethodPost, "/control/dns_config", nil, map[string]any{"blocking_mode": mode}, nil)
}
