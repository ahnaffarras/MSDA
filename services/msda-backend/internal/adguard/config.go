package adguard

import (
	"fmt"
	"strings"
	"time"
)

// Config dibaca dari environment. Seluruh fitur mati bila Enabled=false.
type Config struct {
	Enabled      bool
	URL          string
	User         string
	Pass         string
	BlockingMode string
	Interval     time.Duration
	NeverBlock   []string
	MaxRules     int
}

// Mode pemblokiran respons yang diizinkan. "default"/"refused" sengaja DITOLAK
// (D6): klien dapat mencoba resolver lain sehingga pemblokiran mudah lolos.
var allowedBlockingModes = map[string]bool{"null_ip": true, "nxdomain": true, "custom_ip": true}

// LoadConfig membaca env. Mengembalikan Config yang valid, atau error bila
// Enabled=true tetapi konfigurasinya tidak lengkap/berbahaya. Saat Enabled=false
// tidak ada validasi (perilaku sistem identik dengan sebelum fitur ini).
func LoadConfig(get func(string) string) (Config, error) {
	c := Config{
		Enabled:      strings.EqualFold(strings.TrimSpace(get("MSDA_ENFORCEMENT_ENABLED")), "true"),
		URL:          strings.TrimRight(strings.TrimSpace(get("ADGUARD_URL")), "/"),
		User:         get("ADGUARD_USER"),
		Pass:         get("ADGUARD_PASSWORD"),
		BlockingMode: strings.TrimSpace(get("ADGUARD_BLOCKING_MODE")),
		Interval:     5 * time.Minute,
		NeverBlock:   ParseNeverBlock(get("MSDA_NEVER_BLOCK")),
		MaxRules:     DefaultMaxRules,
	}
	if c.BlockingMode == "" {
		c.BlockingMode = "null_ip"
	}
	if !c.Enabled {
		return c, nil
	}
	var problems []string
	if c.URL == "" {
		problems = append(problems, "ADGUARD_URL is empty")
	}
	if c.User == "" || c.Pass == "" {
		problems = append(problems, "ADGUARD_USER / ADGUARD_PASSWORD must both be set")
	}
	if !allowedBlockingModes[c.BlockingMode] {
		problems = append(problems, fmt.Sprintf("ADGUARD_BLOCKING_MODE %q is not allowed (use null_ip or nxdomain; default/refused let clients try other resolvers)", c.BlockingMode))
	}
	if v := strings.TrimSpace(get("ADGUARD_SYNC_INTERVAL")); v != "" {
		d, err := time.ParseDuration(v)
		switch {
		case err != nil:
			problems = append(problems, "ADGUARD_SYNC_INTERVAL is not a valid duration (example: 5m)")
		case d < 30*time.Second:
			problems = append(problems, "ADGUARD_SYNC_INTERVAL must be at least 30s")
		default:
			c.Interval = d
		}
	}
	if len(problems) > 0 {
		return c, fmt.Errorf("invalid AdGuard configuration:\n  - %s", strings.Join(problems, "\n  - "))
	}
	return c, nil
}
