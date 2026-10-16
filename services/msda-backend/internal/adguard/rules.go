package adguard

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"sort"
	"strings"
	"time"
	"unicode"

	"golang.org/x/net/idna"
	"golang.org/x/net/publicsuffix"
)

// DefaultMaxRules adalah batas aman jumlah aturan yang dikirim ke AGH.
const DefaultMaxRules = 50000

// Alasan sebuah entri tidak menghasilkan aturan.
const (
	ReasonNotEnforce   = "not_enforce"   // block_mode bukan "enforce"
	ReasonInactive     = "inactive"      // is_active=false
	ReasonExpired      = "expired"       // expires_at sudah lewat
	ReasonInvalid      = "invalid"       // domain gagal validasi
	ReasonPublicSuffix = "public_suffix" // TLD / public suffix
	ReasonNeverBlock   = "never_block"   // cocok daftar MSDA_NEVER_BLOCK
	ReasonAllowlisted  = "allowlisted"   // tertimpa dns_allowlist
	ReasonNoDomain     = "no_domain"     // entri tanpa domain
	ReasonGroupEmpty   = "group_empty"   // group tidak punya domain di dns_info
	ReasonLimit        = "limit"         // melebihi MaxRules
)

// Entry adalah subset dokumen dns_blacklist yang dibutuhkan pembangun aturan.
type Entry struct {
	ID                string
	BlockedLevel      string // "domain" | "group" (kosong = "domain")
	Domain            string
	Group             string
	BlockMode         string // "alert" | "enforce" (kosong = "alert")
	IsActive          bool
	ExpiresAt         *time.Time
	IncludeSubdomains *bool // nil = true
}

// Outcome menjelaskan hasil satu entri: dipakai Sync untuk mengisi enforce_status.
type Outcome struct {
	EntryID  string
	Included bool
	Reason   string // diisi bila !Included, atau bila sebagian domain group dilewati
	Skipped  int    // jumlah domain group yang dilewati
	Domains  int    // jumlah domain yang menjadi aturan
}

// Result adalah keluaran Build.
type Result struct {
	Rules    []string
	Hash     string
	Outcomes []Outcome
}

// Builder membangun aturan AGH dari blocklist. Nilai nol tidak dipakai; gunakan NewBuilder.
type Builder struct {
	NeverBlock []string // domain (sudah dinormalisasi) yang tidak boleh diblokir
	MaxRules   int
}

// NewBuilder menormalisasi daftar never-block (nilai tidak valid diabaikan).
func NewBuilder(neverBlock []string, maxRules int) *Builder {
	if maxRules <= 0 {
		maxRules = DefaultMaxRules
	}
	b := &Builder{MaxRules: maxRules}
	for _, n := range neverBlock {
		if d, err := NormalizeDomain(n); err == nil {
			b.NeverBlock = append(b.NeverBlock, d)
		}
	}
	return b
}

// ParseNeverBlock memecah nilai env (dipisah koma/spasi/titik koma).
func ParseNeverBlock(env string) []string {
	f := strings.FieldsFunc(env, func(r rune) bool { return r == ',' || r == ';' || unicode.IsSpace(r) })
	return f
}

var (
	ErrEmpty        = errors.New("domain is empty")
	ErrInvalid      = errors.New("domain contains invalid characters or structure")
	ErrPublicSuffix = errors.New("domain is a TLD or public suffix")
)

// NormalizeDomain memvalidasi SANGAT ketat dan mengembalikan domain kanonik
// (huruf kecil, tanpa titik akhir, IDN → punycode). Karakter apa pun di luar
// [a-z0-9-.] (spasi, ^ $ | @ * / \ newline, dst.) ditolak, sehingga hasilnya
// aman disambung ke "||<domain>^" tanpa risiko injeksi modifier/baris aturan.
func NormalizeDomain(in string) (string, error) {
	if in == "" {
		return "", ErrEmpty
	}
	// Tolak whitespace & karakter kontrol di mana pun (termasuk di tepi): newline
	// adalah vektor injeksi baris aturan.
	for _, r := range in {
		if unicode.IsSpace(r) || unicode.IsControl(r) {
			return "", ErrInvalid
		}
	}
	d := in
	// Satu titik akhir (FQDN) diperbolehkan lalu dibuang.
	d = strings.TrimSuffix(d, ".")

	ascii := true
	for i := 0; i < len(d); i++ {
		if d[i] >= 0x80 {
			ascii = false
			break
		}
	}
	if !ascii {
		p, err := idna.Lookup.ToASCII(d)
		if err != nil {
			return "", ErrInvalid
		}
		d = p
	}
	d = strings.ToLower(d)

	if len(d) < 3 || len(d) > 253 {
		return "", ErrInvalid
	}
	for i := 0; i < len(d); i++ {
		c := d[i]
		ok := (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '.'
		if !ok {
			return "", ErrInvalid
		}
	}
	labels := strings.Split(d, ".")
	if len(labels) < 2 {
		return "", ErrPublicSuffix // satu label = TLD
	}
	for _, l := range labels {
		if l == "" || len(l) > 63 || l[0] == '-' || l[len(l)-1] == '-' {
			return "", ErrInvalid
		}
	}
	// TLD tidak boleh numerik murni (menolak alamat IP seperti 1.2.3.4).
	last := labels[len(labels)-1]
	allDigits := true
	for i := 0; i < len(last); i++ {
		if last[i] < '0' || last[i] > '9' {
			allDigits = false
			break
		}
	}
	if allDigits {
		return "", ErrInvalid
	}
	// Public suffix (co.id, com, blogspot.com, ...) tidak boleh diblokir.
	if _, err := publicsuffix.EffectiveTLDPlusOne(d); err != nil {
		return "", ErrPublicSuffix
	}
	return d, nil
}

// covers true bila `parent` sama dengan `d` atau merupakan leluhur d.
func covers(parent, d string) bool {
	return d == parent || strings.HasSuffix(d, "."+parent)
}

// neverBlocked true bila memblokir d akan mengenai domain never-block: d sama
// dengan, subdomain dari, ATAU leluhur dari salah satu entri never-block.
func (b *Builder) neverBlocked(d string) bool {
	for _, n := range b.NeverBlock {
		if covers(n, d) || covers(d, n) {
			return true
		}
	}
	return false
}

// Build menghasilkan aturan AGH. Deterministik: urutan masukan tidak memengaruhi hash.
//
//	groupDomains: group (dns_info.group) → daftar domain, untuk entri blocked_level="group".
//	allow:        domain dari dns_allowlist (mencakup subdomain).
func (b *Builder) Build(entries []Entry, groupDomains map[string][]string, allow []string, now time.Time) Result {
	// Normalisasi allowlist (yang tidak valid diabaikan).
	var allowN []string
	for _, a := range allow {
		if d, err := NormalizeDomain(a); err == nil {
			allowN = append(allowN, d)
		}
	}
	allowed := func(d string) bool {
		for _, a := range allowN {
			if covers(a, d) {
				return true
			}
		}
		return false
	}

	type blockSpec struct{ sub bool }
	blocks := map[string]blockSpec{} // domain → spec
	res := Result{}

	addDomain := func(d string, sub bool) (string, bool) {
		if b.neverBlocked(d) {
			return ReasonNeverBlock, false
		}
		if allowed(d) {
			return ReasonAllowlisted, false
		}
		cur, ok := blocks[d]
		// Bila domain yang sama diminta dengan & tanpa subdomain, yang lebih luas menang.
		blocks[d] = blockSpec{sub: sub || (ok && cur.sub)}
		return "", true
	}

	for _, e := range entries {
		o := Outcome{EntryID: e.ID}
		switch {
		case e.BlockMode != "enforce":
			o.Reason = ReasonNotEnforce
		case !e.IsActive:
			o.Reason = ReasonInactive
		case e.ExpiresAt != nil && !e.ExpiresAt.After(now):
			o.Reason = ReasonExpired
		}
		if o.Reason != "" {
			res.Outcomes = append(res.Outcomes, o)
			continue
		}
		sub := e.IncludeSubdomains == nil || *e.IncludeSubdomains

		var candidates []string
		if e.BlockedLevel == "group" {
			candidates = groupDomains[e.Group]
			if len(candidates) == 0 {
				o.Reason = ReasonGroupEmpty
				res.Outcomes = append(res.Outcomes, o)
				continue
			}
		} else {
			if e.Domain == "" {
				o.Reason = ReasonNoDomain
				res.Outcomes = append(res.Outcomes, o)
				continue
			}
			candidates = []string{e.Domain}
		}

		firstReason := ""
		for _, raw := range candidates {
			d, err := NormalizeDomain(raw)
			if err != nil {
				r := ReasonInvalid
				if errors.Is(err, ErrPublicSuffix) {
					r = ReasonPublicSuffix
				}
				if firstReason == "" {
					firstReason = r
				}
				o.Skipped++
				continue
			}
			if r, ok := addDomain(d, sub); !ok {
				if firstReason == "" {
					firstReason = r
				}
				o.Skipped++
				continue
			}
			o.Domains++
		}
		if o.Domains == 0 {
			o.Reason = firstReason
		} else if o.Skipped > 0 {
			o.Reason = firstReason // sebagian dilewati; tetap Included
			o.Included = true
		} else {
			o.Included = true
		}
		res.Outcomes = append(res.Outcomes, o)
	}

	// Susun aturan: blokir + pengecualian allowlist yang merupakan turunan dari domain terblokir.
	set := map[string]struct{}{}
	for d, spec := range blocks {
		if spec.sub {
			set["||"+d+"^"] = struct{}{}
		} else {
			set["|"+d+"^"] = struct{}{}
		}
	}
	for _, a := range allowN {
		for d, spec := range blocks {
			if spec.sub && a != d && strings.HasSuffix(a, "."+d) {
				set["@@||"+a+"^"] = struct{}{}
				break
			}
		}
	}
	rules := make([]string, 0, len(set))
	for r := range set {
		rules = append(rules, r)
	}
	sort.Strings(rules)

	// Batas jumlah: potong deterministik dan tandai entri yang tidak muat.
	if len(rules) > b.MaxRules {
		rules = rules[:b.MaxRules]
		keep := map[string]struct{}{}
		for _, r := range rules {
			keep[strings.TrimSuffix(strings.TrimLeft(strings.TrimPrefix(r, "@@"), "|"), "^")] = struct{}{}
		}
		for i := range res.Outcomes {
			o := &res.Outcomes[i]
			if !o.Included {
				continue
			}
			// Cek ulang untuk entri domain-level.
			for _, e := range entries {
				if e.ID != o.EntryID || e.BlockedLevel == "group" {
					continue
				}
				if d, err := NormalizeDomain(e.Domain); err == nil {
					if _, ok := keep[d]; !ok {
						o.Included, o.Reason = false, ReasonLimit
					}
				}
			}
		}
	}

	res.Rules = rules
	sum := sha256.Sum256([]byte(strings.Join(rules, "\n")))
	res.Hash = hex.EncodeToString(sum[:])
	return res
}
