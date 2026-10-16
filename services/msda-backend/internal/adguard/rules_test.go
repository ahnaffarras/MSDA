package adguard

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func TestNormalizeDomain_RejectsInjection(t *testing.T) {
	bad := map[string]string{
		"modifier important": "a.com^$important",
		"dnsrewrite":         "a.com^$dnsrewrite=1.2.3.4",
		"newline injection":  "a.com\n@@||b.com^",
		"crlf":               "a.com\r\nb.com",
		"wildcard":           "*.a.com",
		"leading space":      " a.com",
		"inner space":        "a .com",
		"pipe":               "||a.com",
		"at":                 "@@a.com",
		"slash":              "a.com/path",
		"backslash":          `a.com\x`,
		"empty":              "",
		"double dot":         "a..com",
		"leading hyphen":     "-a.com",
		"trailing hyphen":    "a-.com",
		"ip address":         "1.2.3.4",
		"underscore":         "a_b.com",
		"label over 63":      strings.Repeat("a", 64) + ".com",
		"too long":           strings.Repeat("a.", 130) + "com",
	}
	for name, in := range bad {
		t.Run(name, func(t *testing.T) {
			if d, err := NormalizeDomain(in); err == nil {
				t.Fatalf("expected error for %q, got %q", in, d)
			}
		})
	}
}

func TestNormalizeDomain_PublicSuffix(t *testing.T) {
	for _, in := range []string{"com", "co.id", "blogspot.com", "go.id"} {
		if _, err := NormalizeDomain(in); !errors.Is(err, ErrPublicSuffix) {
			t.Errorf("%q: want ErrPublicSuffix, got %v", in, err)
		}
	}
}

func TestNormalizeDomain_Valid(t *testing.T) {
	cases := map[string]string{
		"A.COM.":                         "a.com",
		"Bet99.Example.Id":               "bet99.example.id",
		"bücher.de":                      "xn--bcher-kva.de",
		strings.Repeat("a", 63) + ".com": strings.Repeat("a", 63) + ".com",
	}
	for in, want := range cases {
		got, err := NormalizeDomain(in)
		if err != nil || got != want {
			t.Errorf("%q: got (%q,%v), want %q", in, got, err, want)
		}
	}
}

var now = time.Date(2026, 10, 16, 8, 0, 0, 0, time.UTC)

func enf(id, d string) Entry {
	return Entry{ID: id, BlockedLevel: "domain", Domain: d, BlockMode: "enforce", IsActive: true}
}

func TestBuild_OnlyEffectiveEnforceEntries(t *testing.T) {
	past, future := now.Add(-time.Hour), now.Add(time.Hour)
	entries := []Entry{
		enf("1", "bad.com"),
		{ID: "2", BlockedLevel: "domain", Domain: "alert.com", BlockMode: "", IsActive: true},
		{ID: "3", BlockedLevel: "domain", Domain: "off.com", BlockMode: "enforce", IsActive: false},
		{ID: "4", BlockedLevel: "domain", Domain: "old.com", BlockMode: "enforce", IsActive: true, ExpiresAt: &past},
		{ID: "5", BlockedLevel: "domain", Domain: "soon.com", BlockMode: "enforce", IsActive: true, ExpiresAt: &future},
	}
	res := NewBuilder(nil, 0).Build(entries, nil, nil, now)
	want := []string{"||bad.com^", "||soon.com^"}
	if strings.Join(res.Rules, ",") != strings.Join(want, ",") {
		t.Fatalf("rules = %v, want %v", res.Rules, want)
	}
}

func TestBuild_InjectionNeverProducesRules(t *testing.T) {
	var entries []Entry
	for i, d := range []string{"a.com^$important", "a.com^$dnsrewrite=1.2.3.4", "a.com\n@@||b.com^", "*.a.com", "com", "co.id", "", strings.Repeat("a", 64) + ".com"} {
		entries = append(entries, enf(string(rune('A'+i)), d))
	}
	res := NewBuilder(nil, 0).Build(entries, nil, nil, now)
	if len(res.Rules) != 0 {
		t.Fatalf("expected no rules, got %v", res.Rules)
	}
	for _, o := range res.Outcomes {
		if o.Included {
			t.Errorf("entry %s should not be included", o.EntryID)
		}
	}
}

func TestBuild_NormalizesAndDedupes(t *testing.T) {
	res := NewBuilder(nil, 0).Build([]Entry{enf("1", "A.COM."), enf("2", "a.com"), enf("3", "bücher.de")}, nil, nil, now)
	want := "||a.com^,||xn--bcher-kva.de^"
	if got := strings.Join(res.Rules, ","); got != want {
		t.Fatalf("got %s want %s", got, want)
	}
}

func TestBuild_HashStableAcrossOrder(t *testing.T) {
	a := NewBuilder(nil, 0).Build([]Entry{enf("1", "a.com"), enf("2", "b.com")}, nil, nil, now)
	b := NewBuilder(nil, 0).Build([]Entry{enf("2", "b.com"), enf("1", "a.com")}, nil, nil, now)
	if a.Hash != b.Hash || a.Hash == "" {
		t.Fatal("hash must be order independent")
	}
}

func TestBuild_NeverBlockBothDirections(t *testing.T) {
	b := NewBuilder([]string{"dashboard.corp.example.id", "pool.ntp.org"}, 0)
	res := b.Build([]Entry{
		enf("1", "dashboard.corp.example.id"),   // sama
		enf("2", "x.dashboard.corp.example.id"), // subdomain
		enf("3", "corp.example.id"),             // leluhur → akan ikut memblokir infrastruktur
		enf("4", "ntp.org"),                     // leluhur pool.ntp.org
		enf("5", "fine.com"),
	}, nil, nil, now)
	if len(res.Rules) != 1 || res.Rules[0] != "||fine.com^" {
		t.Fatalf("rules = %v", res.Rules)
	}
	if res.Outcomes[2].Reason != ReasonNeverBlock {
		t.Errorf("ancestor must be rejected, got %q", res.Outcomes[2].Reason)
	}
}

func TestBuild_Allowlist(t *testing.T) {
	res := NewBuilder(nil, 0).Build(
		[]Entry{enf("1", "a.com"), enf("2", "b.com"), enf("3", "sub.c.com")},
		nil, []string{"cdn.a.com", "b.com", "unrelated.org"}, now)
	// b.com ditimpa allowlist (dilewati); cdn.a.com → pengecualian; unrelated.org tidak dipakai.
	want := "@@||cdn.a.com^,||a.com^,||sub.c.com^"
	if got := strings.Join(res.Rules, ","); got != want {
		t.Fatalf("got %s want %s", got, want)
	}
	if res.Outcomes[1].Reason != ReasonAllowlisted {
		t.Errorf("b.com outcome = %+v", res.Outcomes[1])
	}
}

func TestBuild_GroupExpansion(t *testing.T) {
	groups := map[string][]string{"Judi Online": {"slot1.com", "slot2.com", "co.id", "bad^x.com"}}
	e := Entry{ID: "g", BlockedLevel: "group", Group: "Judi Online", BlockMode: "enforce", IsActive: true}
	res := NewBuilder(nil, 0).Build([]Entry{e}, groups, nil, now)
	if strings.Join(res.Rules, ",") != "||slot1.com^,||slot2.com^" {
		t.Fatalf("rules = %v", res.Rules)
	}
	o := res.Outcomes[0]
	if !o.Included || o.Domains != 2 || o.Skipped != 2 {
		t.Errorf("outcome = %+v", o)
	}
	empty := Entry{ID: "e", BlockedLevel: "group", Group: "Nope", BlockMode: "enforce", IsActive: true}
	r2 := NewBuilder(nil, 0).Build([]Entry{empty}, groups, nil, now)
	if r2.Outcomes[0].Reason != ReasonGroupEmpty {
		t.Errorf("want group_empty, got %+v", r2.Outcomes[0])
	}
}

func TestBuild_ExactOnlyAndSubdomainMerge(t *testing.T) {
	no := false
	e1 := enf("1", "a.com")
	e1.IncludeSubdomains = &no
	res := NewBuilder(nil, 0).Build([]Entry{e1, enf("2", "b.com")}, nil, nil, now)
	if strings.Join(res.Rules, ",") != "|a.com^,||b.com^" {
		t.Fatalf("rules = %v", res.Rules)
	}
	// domain sama diminta dengan & tanpa subdomain → yang lebih luas menang
	res = NewBuilder(nil, 0).Build([]Entry{e1, enf("2", "a.com")}, nil, nil, now)
	if strings.Join(res.Rules, ",") != "||a.com^" {
		t.Fatalf("rules = %v", res.Rules)
	}
}

func TestBuild_Limit(t *testing.T) {
	res := NewBuilder(nil, 2).Build([]Entry{enf("1", "a.com"), enf("2", "b.com"), enf("3", "c.com")}, nil, nil, now)
	if len(res.Rules) != 2 {
		t.Fatalf("rules = %v", res.Rules)
	}
	if res.Outcomes[2].Reason != ReasonLimit || res.Outcomes[2].Included {
		t.Errorf("c.com should hit the limit: %+v", res.Outcomes[2])
	}
}
