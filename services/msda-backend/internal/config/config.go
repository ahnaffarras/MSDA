// Package config memuat pemeriksaan konfigurasi yang harus lolos sebelum backend
// melayani trafik produksi. Paket ini sengaja hanya memakai library standar agar
// mudah diuji tanpa dependensi eksternal.
package config

import (
	"fmt"
	"net/url"
	"strings"
)

const (
	// MinSecretLen adalah panjang minimum token/secret bersama (hex 32 karakter = 128 bit).
	MinSecretLen = 32
	// MinDBPasswordLen adalah panjang minimum password MongoDB di production.
	MinDBPasswordLen = 12
)

// placeholderMarkers: potongan teks yang menandakan nilai contoh/default yang belum diganti.
var placeholderMarkers = []string{
	"changeme", "change-me", "change_me", "msda123", "isi-", "your-", "example", "password", "secret-here",
}

// IsPlaceholder true bila nilai kosong atau masih berupa nilai contoh/default.
func IsPlaceholder(v string) bool {
	t := strings.ToLower(strings.TrimSpace(v))
	if t == "" {
		return true
	}
	for _, m := range placeholderMarkers {
		if strings.Contains(t, m) {
			return true
		}
	}
	return false
}

func checkSecret(get func(string) string, key string) []string {
	v := get(key)
	switch {
	case strings.TrimSpace(v) == "":
		return []string{fmt.Sprintf("%s is empty", key)}
	case IsPlaceholder(v):
		return []string{fmt.Sprintf("%s still uses a placeholder/default value", key)}
	case len(v) < MinSecretLen:
		return []string{fmt.Sprintf("%s is too short (minimum %d characters)", key, MinSecretLen)}
	}
	return nil
}

// ValidateProduction memeriksa konfigurasi yang wajib aman saat APP_ENV=production.
// Mengembalikan error berisi SEMUA masalah (bukan hanya yang pertama) supaya operator
// bisa memperbaikinya sekali jalan. Nilai rahasia tidak pernah dimasukkan ke pesan.
func ValidateProduction(get func(string) string) error {
	var problems []string

	problems = append(problems, checkSecret(get, "MSDA_WEBHOOK_TOKEN")...)
	problems = append(problems, checkSecret(get, "MSDA_INTERNAL_TOKEN")...)
	if w, i := get("MSDA_WEBHOOK_TOKEN"), get("MSDA_INTERNAL_TOKEN"); w != "" && w == i {
		problems = append(problems, "MSDA_WEBHOOK_TOKEN and MSDA_INTERNAL_TOKEN must be different values")
	}

	uri := strings.TrimSpace(get("MONGODB_URI"))
	if uri == "" {
		problems = append(problems, "MONGODB_URI is empty")
	} else if u, err := url.Parse(uri); err != nil {
		problems = append(problems, "MONGODB_URI is not a valid URI")
	} else {
		pw, hasPw := "", false
		if u.User != nil {
			pw, hasPw = u.User.Password()
		}
		switch {
		case !hasPw || pw == "":
			problems = append(problems, "MONGODB_URI has no password (MongoDB authentication is required in production)")
		case IsPlaceholder(pw):
			problems = append(problems, "MongoDB password still uses a placeholder/default value")
		case len(pw) < MinDBPasswordLen:
			problems = append(problems, fmt.Sprintf("MongoDB password is too short (minimum %d characters)", MinDBPasswordLen))
		}
	}

	if len(problems) == 0 {
		return nil
	}
	return fmt.Errorf("insecure production configuration:\n  - %s", strings.Join(problems, "\n  - "))
}
