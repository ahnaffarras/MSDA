package adguard

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestHTTPClient_BasicAuthSetRulesAndRetry(t *testing.T) {
	var calls int32
	var got struct{ Rules []string }
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, p, ok := r.BasicAuth()
		if !ok || u != "user" || p != "pw" {
			w.WriteHeader(401)
			return
		}
		if r.URL.Path != "/control/filtering/set_rules" || r.Method != "POST" {
			w.WriteHeader(404)
			return
		}
		if atomic.AddInt32(&calls, 1) == 1 {
			w.WriteHeader(503) // percobaan pertama gagal → harus di-retry
			return
		}
		_ = json.NewDecoder(r.Body).Decode(&got)
		w.WriteHeader(200)
	}))
	defer srv.Close()

	c := NewHTTPClient(srv.URL, "user", "pw")
	c.Backoff = time.Millisecond
	if err := c.SetRules(context.Background(), []string{"||a.com^"}); err != nil {
		t.Fatal(err)
	}
	if calls != 2 || len(got.Rules) != 1 {
		t.Fatalf("calls=%d body=%+v", calls, got)
	}
}

func TestHTTPClient_4xxNotRetriedAndWrongPassword(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(401)
	}))
	defer srv.Close()
	c := NewHTTPClient(srv.URL, "x", "y")
	c.Backoff = time.Millisecond
	_, err := c.Status(context.Background())
	var he *ErrHTTP
	if err == nil || calls != 1 {
		t.Fatalf("err=%v calls=%d", err, calls)
	}
	if e, ok := err.(*ErrHTTP); ok {
		he = e
	}
	if he == nil || he.Status != 401 {
		t.Fatalf("want ErrHTTP 401, got %v", err)
	}
}

func TestHTTPClient_CheckHostBlocked(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("name") != "a.com" {
			w.WriteHeader(400)
			return
		}
		_, _ = w.Write([]byte(`{"reason":"FilteredBlackList","rule":"||a.com^","rules":[{"text":"||a.com^","filter_list_id":0}]}`))
	}))
	defer srv.Close()
	r, err := NewHTTPClient(srv.URL, "u", "p").CheckHost(context.Background(), "a.com")
	if err != nil || !r.Blocked || len(r.Rules) != 1 {
		t.Fatalf("%+v %v", r, err)
	}
}
