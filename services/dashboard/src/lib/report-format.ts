import { riskLevelFromType, type RiskLevel } from "@/lib/domain-risk";

// ── Types ───────────────────────────────────────────────────────────────────

export interface DnsAiReportDoc {
  date: string;
  partial?: boolean;
  generated_at?: string;
  model?: string;
  ai_ok?: boolean;
  history_days?: number;
  ai?: {
    headline?: string;
    summary?: string;
    insights?: string[];
    per_ap?: Array<{ ap_name: string; note: string }>;
    review_domains?: Array<{ domain: string; reason: string }>;
    recommendations?: string[];
  } | null;
  summary?: {
    total_requests?: { today?: number; baseline_avg?: number; change_pct?: number | null };
    unique_clients?: { today?: number; baseline_avg?: number; change_pct?: number | null };
    blacklist_hits?: { today?: number; baseline_avg?: number; change_pct?: number | null };
  };
  trends?: {
    domain?: {
      up?: Array<{ scope?: string; ap?: string; name?: string; domain?: string; group?: string; today?: number; baseline_avg?: number; change_pct?: number | null }>;
      down?: Array<{ scope?: string; ap?: string; name?: string; domain?: string; group?: string; today?: number; baseline_avg?: number; change_pct?: number | null }>;
      fresh?: Array<{ scope?: string; ap?: string; name?: string; domain?: string; group?: string; today?: number; baseline_avg?: number; change_pct?: number | null }>;
    };
    group?: {
      up?: Array<{ scope?: string; ap?: string; name?: string; group?: string; today?: number; baseline_avg?: number; change_pct?: number | null }>;
      down?: Array<{ scope?: string; ap?: string; name?: string; group?: string; today?: number; baseline_avg?: number; change_pct?: number | null }>;
      fresh?: Array<{ scope?: string; ap?: string; name?: string; group?: string; today?: number; baseline_avg?: number; change_pct?: number | null }>;
    };
    ap_totals?: Array<{ scope?: string; ap?: string; name?: string; today?: number; baseline_avg?: number; change_pct?: number | null; unique_clients?: number }>;
  };
  slack_text?: string;
}

export interface DnsDailyStatsDoc {
  _id?: unknown;
  date: string;
  total_requests?: number;
  unique_clients?: number;
  rows?: number;
  blacklist_hits?: number;
  per_ap?: Array<{
    ap_name: string;
    total: number;
    unique_clients: number;
    blacklist_hits: number;
    groups?: Array<{ group: string; type: string; total: number }>;
    domains?: Array<{ domain: string; group: string; total: number }>;
  }>;
  blacklist_events?: Array<{
    client_ip: string;
    ap_name: string;
    domain: string;
    group: string;
    total: number;
  }>;
  by_group?: unknown;
  top_clients?: unknown;
}

export interface RawDataRow {
  ap_name: string;
  domain: string;
  risk_level: RiskLevel;
  count: number;
  client_count: number;
}

// ── Date & Number Helpers ───────────────────────────────────────────────────

const DAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;
const MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"] as const;

/**
 * Format date label in Indonesian format using Date.UTC to prevent timezone shift.
 * Example: "Senin, 5 Okt 2026" or "Senin, 5 Okt 2026 (sementara)" if partial.
 */
export function formatDateLabel(dateStr: string, partial?: boolean): string {
  if (!dateStr || typeof dateStr !== "string") return "";
  const parts = dateStr.split("-").map(Number);
  if (parts.length === 3 && !parts.some(isNaN)) {
    const [year, month, day] = parts;
    const d = new Date(Date.UTC(year, month - 1, day));
    const dayName = DAYS_ID[d.getUTCDay()];
    const monthName = MONTHS_ID[d.getUTCMonth()];
    const base = `${dayName}, ${day} ${monthName} ${year}`;
    return partial ? `${base} (sementara)` : base;
  }
  return partial ? `${dateStr} (sementara)` : dateStr;
}

/**
 * Validates and converts generated_at to an ISO string, or falls back to date at 00:00:00+07:00.
 */
export function formatTimestamp(generatedAt: unknown, dateStr: string): string {
  if (typeof generatedAt === "string" && generatedAt.trim()) {
    const parsed = new Date(generatedAt);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  const fallback = new Date(`${dateStr}T00:00:00+07:00`);
  return !isNaN(fallback.getTime()) ? fallback.toISOString() : new Date().toISOString();
}

/**
 * Formats a number with dot thousand separator (id-ID locale).
 * Example: 12345 -> "12.345"
 */
export function formatNumberId(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return "0";
  return n.toLocaleString("id-ID");
}

/**
 * Formats percentage change with sign, e.g. +12% or -5%.
 */
export function formatPct(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return "";
  const sign = val > 0 ? "+" : "";
  return `${sign}${val}%`;
}

/**
 * Cleans Slack mrkdwn formatting into clean text or markdown supported by ReportText.tsx:
 * - Removes :emoji:
 * - Removes single backticks
 * - Converts Slack single-asterisk bold (*bold*) to double-asterisk bold (**bold**)
 * - Cleans multiple whitespace
 */
export function cleanSlackFormatting(str: string): string {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/:[a-zA-Z0-9_+ -]+:/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "**$1**")
    .replace(/[ \t]+/g, " ")
    .trim();
}

// ── Report Text Assembly ────────────────────────────────────────────────────

function formatComparison(
  changePct: number | null | undefined,
  historyDays?: number,
  partial?: boolean,
): string {
  if (partial || changePct === null || changePct === undefined || isNaN(changePct)) {
    return "";
  }
  const pctStr = formatPct(changePct);
  const vsText = historyDays ? ` vs rata-rata ${historyDays} hari` : " vs rata-rata";
  return ` (${pctStr}${vsText})`;
}

export function buildReportText(
  report: DnsAiReportDoc,
  dailyStats?: DnsDailyStatsDoc | null,
): string {
  const sections: string[] = [];
  const ai = report.ai && report.ai_ok !== false ? report.ai : null;
  const partial = Boolean(report.partial);
  const historyDays = report.history_days;

  // 1. AI Headline & Summary (or fallback notice)
  if (ai) {
    const headline = ai.headline ? cleanSlackFormatting(ai.headline) : "";
    const summary = ai.summary ? cleanSlackFormatting(ai.summary) : "";
    const introLines: string[] = [];
    if (headline) {
      introLines.push(`**${headline}**`);
    }
    if (summary) {
      introLines.push(summary);
    }
    if (introLines.length > 0) {
      sections.push(introLines.join("\n\n"));
    }
  } else {
    sections.push("Catatan: Analisis AI tidak tersedia untuk laporan ini.");
  }

  // 2. Baris ringkasan angka: total request, client unik, akses blacklist
  const totalToday = report.summary?.total_requests?.today ?? dailyStats?.total_requests ?? 0;
  const clientsToday = report.summary?.unique_clients?.today ?? dailyStats?.unique_clients ?? 0;
  const blacklistToday = report.summary?.blacklist_hits?.today ?? dailyStats?.blacklist_hits ?? 0;

  const totalChange = formatComparison(report.summary?.total_requests?.change_pct, historyDays, partial);
  const clientsChange = formatComparison(report.summary?.unique_clients?.change_pct, historyDays, partial);
  const blacklistChange = formatComparison(report.summary?.blacklist_hits?.change_pct, historyDays, partial);

  const summaryLine = `**Total request:** ${formatNumberId(totalToday)}${totalChange} | **Client unik:** ${formatNumberId(clientsToday)}${clientsChange} | **Akses blacklist:** ${formatNumberId(blacklistToday)}${blacklistChange}`;
  sections.push(summaryLine);

  // 3. Insight Tren
  if (ai && Array.isArray(ai.insights) && ai.insights.length > 0) {
    const validInsights = ai.insights.map((i) => cleanSlackFormatting(i)).filter(Boolean);
    if (validInsights.length > 0) {
      sections.push(["## Insight Tren", ...validInsights.map((i) => `- ${i}`)].join("\n"));
    }
  } else if (!ai) {
    // Fallback bila ai null: dari trends.domain.up (maks 4), down (maks 2), fresh (maks 2)
    const fallbackInsights: string[] = [];

    const upList = (report.trends?.domain?.up || []).slice(0, 4);
    for (const item of upList) {
      const d = item.domain || item.name || "";
      if (d) {
        const pct = item.change_pct !== null && item.change_pct !== undefined ? ` sebesar ${formatPct(item.change_pct)}` : "";
        fallbackInsights.push(`- Domain **${d}** mengalami kenaikan trafik${pct} (${formatNumberId(item.today)} request).`);
      }
    }

    const downList = (report.trends?.domain?.down || []).slice(0, 2);
    for (const item of downList) {
      const d = item.domain || item.name || "";
      if (d) {
        const pct = item.change_pct !== null && item.change_pct !== undefined ? ` sebesar ${formatPct(item.change_pct)}` : "";
        fallbackInsights.push(`- Domain **${d}** mengalami penurunan trafik${pct} (${formatNumberId(item.today)} request).`);
      }
    }

    const freshList = (report.trends?.domain?.fresh || []).slice(0, 2);
    for (const item of freshList) {
      const d = item.domain || item.name || "";
      if (d) {
        fallbackInsights.push(`- Domain baru terdeteksi: **${d}** dengan ${formatNumberId(item.today)} request.`);
      }
    }

    if (fallbackInsights.length > 0) {
      sections.push(["## Insight Tren", ...fallbackInsights].join("\n"));
    }
  }

  // 4. Per Access Point (maks 6)
  let apTotals = (report.trends?.ap_totals || []).slice(0, 6);
  if (apTotals.length === 0 && Array.isArray(dailyStats?.per_ap)) {
    apTotals = dailyStats.per_ap.slice(0, 6).map((p) => ({
      ap: p.ap_name,
      today: p.total,
      unique_clients: p.unique_clients,
      change_pct: null,
    }));
  }

  if (apTotals.length > 0) {
    const apLines: string[] = ["## Per Access Point"];
    const noteMap = new Map<string, string>();
    if (ai && Array.isArray(ai.per_ap)) {
      for (const p of ai.per_ap) {
        if (p && p.ap_name && p.note) {
          noteMap.set(p.ap_name.trim().toLowerCase(), cleanSlackFormatting(p.note));
        }
      }
    }

    const statsApMap = new Map<string, number>();
    if (Array.isArray(dailyStats?.per_ap)) {
      for (const p of dailyStats.per_ap) {
        if (p && p.ap_name) {
          statsApMap.set(p.ap_name.trim().toLowerCase(), p.unique_clients ?? 0);
        }
      }
    }

    for (const item of apTotals) {
      const apName = item.ap || item.name || "Unknown AP";
      const todayReq = formatNumberId(item.today ?? 0);

      let pctStr = "";
      if (item.change_pct !== null && item.change_pct !== undefined && !isNaN(item.change_pct)) {
        pctStr = ` (${formatPct(item.change_pct)})`;
      }

      const clientCount = item.unique_clients ?? statsApMap.get(apName.trim().toLowerCase()) ?? 0;
      const clientsStr = formatNumberId(clientCount);

      const note = noteMap.get(apName.trim().toLowerCase());
      const noteStr = note ? ` — ${note}` : "";

      apLines.push(`- **${apName}**: ${todayReq} request${pctStr}, ${clientsStr} client${noteStr}`);
    }

    sections.push(apLines.join("\n"));
  }

  // 5. Domain yang Perlu Ditinjau
  if (ai && Array.isArray(ai.review_domains) && ai.review_domains.length > 0) {
    const domainLines: string[] = ["## Domain yang Perlu Ditinjau"];
    for (const item of ai.review_domains) {
      if (item && item.domain) {
        const d = cleanSlackFormatting(item.domain);
        const reason = item.reason ? ` — ${cleanSlackFormatting(item.reason)}` : "";
        domainLines.push(`- ${d}${reason}`);
      }
    }
    if (domainLines.length > 1) {
      sections.push(domainLines.join("\n"));
    }
  } else if (!ai && Array.isArray(dailyStats?.blacklist_events) && dailyStats.blacklist_events.length > 0) {
    // Fallback: review domain dari blacklist_events (maks 5)
    const blList = dailyStats.blacklist_events.slice(0, 5);
    const domainLines: string[] = ["## Domain yang Perlu Ditinjau"];
    for (const ev of blList) {
      const d = ev.domain || "";
      const ap = ev.ap_name ? ` di ${ev.ap_name}` : "";
      const count = ev.total ? ` (${formatNumberId(ev.total)} request)` : "";
      const grp = ev.group ? `, kategori: ${ev.group}` : "";
      domainLines.push(`- **${d}** — Terdeteksi aktivitas blacklist${ap}${count}${grp}`);
    }
    if (domainLines.length > 1) {
      sections.push(domainLines.join("\n"));
    }
  }

  // 6. Saran
  if (ai && Array.isArray(ai.recommendations) && ai.recommendations.length > 0) {
    const recLines: string[] = ["## Saran"];
    for (const rec of ai.recommendations) {
      if (rec && typeof rec === "string" && rec.trim()) {
        recLines.push(`- ${cleanSlackFormatting(rec.trim())}`);
      }
    }
    if (recLines.length > 1) {
      sections.push(recLines.join("\n"));
    }
  }

  return sections.join("\n\n");
}

// ── Raw Data Assembly ───────────────────────────────────────────────────────

export function buildRawData(dailyStats?: DnsDailyStatsDoc | null): string {
  if (!dailyStats || !Array.isArray(dailyStats.per_ap)) {
    return "[]";
  }

  const rows: RawDataRow[] = [];
  const blacklistEvents = Array.isArray(dailyStats.blacklist_events) ? dailyStats.blacklist_events : [];

  for (const ap of dailyStats.per_ap) {
    const apName = ap.ap_name || "Unknown AP";

    const groupTypeMap = new Map<string, string>();
    if (Array.isArray(ap.groups)) {
      for (const g of ap.groups) {
        if (g && g.group) {
          groupTypeMap.set(g.group, g.type || "");
        }
      }
    }

    const apEvents = blacklistEvents.filter((e) => e.ap_name === apName);

    if (Array.isArray(ap.domains)) {
      for (const d of ap.domains) {
        const domainName = d.domain || "";
        const domainLower = domainName.toLowerCase().trim();

        const matchingEvents = apEvents.filter((e) => {
          const evDomain = (e.domain || "").toLowerCase().trim();
          return (
            evDomain === domainLower ||
            domainLower.endsWith("." + evDomain) ||
            evDomain.endsWith("." + domainLower)
          );
        });

        let riskLevel: RiskLevel = "safe";
        let clientCount = 0;

        if (matchingEvents.length > 0) {
          riskLevel = "flag";
          const uniqueIps = new Set<string>();
          for (const ev of matchingEvents) {
            if (ev.client_ip) {
              uniqueIps.add(ev.client_ip);
            }
          }
          clientCount = uniqueIps.size;
        } else {
          const groupType = d.group ? groupTypeMap.get(d.group) : undefined;
          riskLevel = groupType ? riskLevelFromType(groupType) : "safe";
        }

        rows.push({
          ap_name: apName,
          domain: domainName,
          risk_level: riskLevel,
          count: Number(d.total) || 0,
          client_count: clientCount,
        });
      }
    }
  }

  return JSON.stringify(rows);
}
