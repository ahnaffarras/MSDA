package config

import (
	"strings"
	"testing"
)

const goodSecretA = "9f2c1d7e4a6b8c0d3e5f7a1b2c4d6e8f"
const goodSecretB = "0a1b2c3d4e5f60718293a4b5c6d7e8f9"

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func validEnv() map[string]string {
	return map[string]string{
		"MSDA_WEBHOOK_TOKEN":  goodSecretA,
		"MSDA_INTERNAL_TOKEN": goodSecretB,
		"MONGODB_URI":         "mongodb://msda:Zk3pQ9vL2xRt@mongo:27017/msda?authSource=admin",
	}
}

func TestValidateProduction_OK(t *testing.T) {
	if err := ValidateProduction(env(validEnv())); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
}

func TestValidateProduction_RejectsEmptyAndPlaceholders(t *testing.T) {
	cases := map[string]func(m map[string]string){
		"empty webhook":        func(m map[string]string) { m["MSDA_WEBHOOK_TOKEN"] = "" },
		"default webhook":      func(m map[string]string) { m["MSDA_WEBHOOK_TOKEN"] = "changeme-token" },
		"short internal":       func(m map[string]string) { m["MSDA_INTERNAL_TOKEN"] = "abc123" },
		"same tokens":          func(m map[string]string) { m["MSDA_INTERNAL_TOKEN"] = goodSecretA },
		"default mongo pw":     func(m map[string]string) { m["MONGODB_URI"] = "mongodb://msda:msda123@mongo:27017/msda" },
		"no mongo pw":          func(m map[string]string) { m["MONGODB_URI"] = "mongodb://mongo:27017/msda" },
		"short mongo pw":       func(m map[string]string) { m["MONGODB_URI"] = "mongodb://msda:Ab1@mongo:27017/msda" },
		"empty mongo uri":      func(m map[string]string) { m["MONGODB_URI"] = "" },
		"placeholder internal": func(m map[string]string) { m["MSDA_INTERNAL_TOKEN"] = "change-me-to-a-random-secret-value" },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			m := validEnv()
			mutate(m)
			if err := ValidateProduction(env(m)); err == nil {
				t.Fatal("expected an error, got nil")
			}
		})
	}
}

func TestValidateProduction_ReportsAllProblemsWithoutLeakingSecrets(t *testing.T) {
	m := map[string]string{
		"MSDA_WEBHOOK_TOKEN":  "changeme-token",
		"MSDA_INTERNAL_TOKEN": "",
		"MONGODB_URI":         "mongodb://msda:msda123@mongo:27017/msda",
	}
	err := ValidateProduction(env(m))
	if err == nil {
		t.Fatal("expected error")
	}
	msg := err.Error()
	for _, want := range []string{"MSDA_WEBHOOK_TOKEN", "MSDA_INTERNAL_TOKEN", "MongoDB password"} {
		if !strings.Contains(msg, want) {
			t.Errorf("message should mention %q, got: %s", want, msg)
		}
	}
	if strings.Contains(msg, "msda123") {
		t.Error("message must not echo secret values")
	}
}

func TestIsPlaceholder(t *testing.T) {
	for _, v := range []string{"", "  ", "changeme-token", "CHANGE-ME-please", "msda123", "isi-token-acak"} {
		if !IsPlaceholder(v) {
			t.Errorf("%q should be a placeholder", v)
		}
	}
	if IsPlaceholder(goodSecretA) {
		t.Error("random hex must not be a placeholder")
	}
}

func TestValidateProduction_AdguardOnlyWhenEnabled(t *testing.T) {
	base := map[string]string{
		"MSDA_WEBHOOK_TOKEN":  strings.Repeat("a", 32),
		"MSDA_INTERNAL_TOKEN": strings.Repeat("b", 32),
		"MONGODB_URI":         "mongodb://msda:" + strings.Repeat("c", 16) + "@mongo:27017/msda",
	}
	get := func(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

	// Nonaktif: kredensial AdGuard kosong TIDAK mengganggu (perilaku lama).
	if err := ValidateProduction(get(base)); err != nil {
		t.Fatalf("disabled enforcement must not add requirements: %v", err)
	}
	on := map[string]string{"MSDA_ENFORCEMENT_ENABLED": "true"}
	for k, v := range base {
		on[k] = v
	}
	if err := ValidateProduction(get(on)); err == nil {
		t.Fatal("enabled enforcement without credentials must fail")
	}
	on["ADGUARD_USER"], on["ADGUARD_PASSWORD"] = "msda", strings.Repeat("z", 16)
	if err := ValidateProduction(get(on)); err != nil {
		t.Fatalf("valid credentials rejected: %v", err)
	}
}
