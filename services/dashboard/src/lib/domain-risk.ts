/**
 * Placeholder domain risk categorization.
 *
 * In production this classification is meant to happen in n8n (Phase 1) and
 * later be enriched by AI analysis (Phase 2) — see ARCHITECTURE.md, "AI
 * Processing" and "Analytics Module". This client-side keyword list exists
 * only so the dashboard has something meaningful to render before that
 * pipeline delivers a `risk_level` field on each event. Replace this with
 * the value coming from the API/webhook payload once it exists.
 */

export type RiskLevel = "safe" | "watch" | "flag";

const FLAG_KEYWORDS = ["bet", "judi", "porn", "xxx", "casino", "toto"];
const WATCH_KEYWORDS = [
  "youtube",
  "tiktok",
  "instagram",
  "facebook",
  "roblox",
  "mobile-legends",
  "steam",
  "discord",
  "netflix",
];
const SAFE_KEYWORDS = [
  "wikipedia",
  "google",
  "github",
  "stackoverflow",
  "docs.",
  "quipper",
  "ruangguru",
  "belajar",
  "kemdikbud",
  "office",
  "duolingo",
];

export function classifyDomain(domain: string): RiskLevel {
  const d = domain.toLowerCase();
  if (FLAG_KEYWORDS.some((k) => d.includes(k))) return "flag";
  if (WATCH_KEYWORDS.some((k) => d.includes(k))) return "watch";
  if (SAFE_KEYWORDS.some((k) => d.includes(k))) return "safe";
  return "safe";
}

export const RISK_LABEL: Record<RiskLevel, string> = {
  safe: "Wajar",
  watch: "Perlu Perhatian",
  flag: "Berisiko",
};

export const RISK_COLOR: Record<RiskLevel, { fg: string; bg: string }> = {
  safe: { fg: "var(--accent-safe)", bg: "var(--accent-safe-bg)" },
  watch: { fg: "var(--accent-watch)", bg: "var(--accent-watch-bg)" },
  flag: { fg: "var(--accent-flag)", bg: "var(--accent-flag-bg)" },
};

/** Map domain type/category string to a UI risk level. */
const FLAG_TYPES  = new Set(["gambling", "adult", "malware", "phishing", "crypto_miner"]);
const WATCH_TYPES = new Set(["social_media", "streaming", "gaming"]);

export function riskLevelFromType(type: string): RiskLevel {
  if (FLAG_TYPES.has(type))  return "flag";
  if (WATCH_TYPES.has(type)) return "watch";
  return "safe";
}
