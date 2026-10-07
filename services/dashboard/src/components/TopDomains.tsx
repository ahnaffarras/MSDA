import { Globe } from "@gravity-ui/icons";
import type { TopDomain } from "@/lib/types";

const TYPE_COLOR: Record<string, string> = {
  gambling:     "var(--accent-flag)",
  adult:        "var(--accent-flag)",
  malware:      "var(--accent-flag)",
  phishing:     "var(--accent-flag)",
  social_media: "var(--accent-watch)",
  streaming:    "var(--accent-watch)",
  gaming:       "var(--accent-watch)",
  educational:  "var(--accent-safe)",
  cloud:        "var(--accent-safe)",
  other:        "var(--chalk-faint)",
};

function typeColor(type: string) {
  return TYPE_COLOR[type] ?? "var(--chalk-faint)";
}

export function TopDomains({ domains }: { domains: TopDomain[] }) {
  const total = domains.reduce((s, d) => s + d.count, 0);

  return (
    <article className="rounded-2xl border border-line bg-surface chalk-surface p-5">
      <div className="flex items-center gap-2.5">
        <Globe width={18} height={18} className="text-chalk-faint" />
        <div>
          <h2 className="font-display text-lg font-semibold text-chalk">Top domains</h2>
          <p className="text-sm text-chalk-dim">Today&apos;s session</p>
        </div>
      </div>
      {domains.length === 0 ? (
        <p className="mt-5 text-sm text-chalk-dim">No domain data yet.</p>
      ) : (
        <div className="mt-5 space-y-4">
          {domains.map((d) => {
            const share = total > 0 ? Math.round((d.count / total) * 100) : 0;
            const color = typeColor(d.type);
            return (
              <div key={d.domain}>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-data text-chalk truncate block">{d.domain}</span>
                    {d.group && (
                      <span className="text-xs text-chalk-faint">{d.group}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
                    >
                      {d.type}
                    </span>
                    <span className="font-data text-chalk-dim">{share}%</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2">
                  <div
                    className="h-1.5 rounded-full transition-all"
                    style={{ width: `${share}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
