import { ListUl } from "@gravity-ui/icons";
import { riskLevelFromType, RISK_COLOR, RISK_LABEL } from "@/lib/domain-risk";
import { formatTimeWIB } from "@/lib/format";
import { actionLabel, actionTone } from "@/lib/labels";

const TONE_STYLE = {
  blocked: { color: "var(--accent-flag)", backgroundColor: "var(--accent-flag-bg)" },
  monitor: { color: "var(--accent-watch)", backgroundColor: "var(--accent-watch-bg)" },
  allowed: { color: "var(--accent-safe)", backgroundColor: "var(--accent-safe-bg)" },
} as const;
import type { LabGridAP } from "@/lib/types";

export function ActivityLog({ labGrid }: { labGrid: LabGridAP[] }) {
  // Gabungkan semua client dari semua AP, urutkan terbaru, ambil 15
  const rows = labGrid
    .flatMap((ap) => ap.clients.map((c) => ({ ...c, ap_label: ap.ap_label })))
    .sort((a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime())
    .slice(0, 15);

  return (
    <article className="rounded-2xl border border-line bg-surface chalk-surface p-5">
      <div className="flex items-center gap-2.5">
        <ListUl width={18} height={18} className="text-chalk-faint" />
        <div>
          <h2 className="font-display text-lg font-semibold text-chalk">Activity log</h2>
          <p className="text-sm text-chalk-dim">Latest DNS requests across all labs</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-5 text-sm text-chalk-dim">No activity recorded yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-chalk-faint">
                <th className="pb-2 pr-3 font-medium">Time</th>
                <th className="pb-2 pr-3 font-medium">IP</th>
                <th className="pb-2 pr-3 font-medium">AP</th>
                <th className="pb-2 pr-3 font-medium">Domain</th>
                <th className="pb-2 pr-3 font-medium">Action</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const risk = riskLevelFromType(row.risk_level);
                return (
                  <tr
                    key={`${row.client_ip}-${i}`}
                    className="border-b border-line/60 last:border-0"
                  >
                    <td className="py-2 pr-3 font-data text-chalk-dim whitespace-nowrap">
                      {formatTimeWIB(row.last_seen)}
                    </td>
                    <td className="py-2 pr-3 font-data text-chalk">{row.client_ip}</td>
                    <td className="py-2 pr-3 text-chalk-dim text-xs">{row.ap_label}</td>
                    <td className="py-2 pr-3 font-data text-chalk max-w-[180px] truncate">
                      {row.last_domain}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className="rounded px-2 py-0.5 text-xs font-medium"
                        style={TONE_STYLE[actionTone(row.last_action, row.last_enforced)]}
                      >
                        {actionLabel(row.last_action, row.last_enforced)}
                      </span>
                    </td>
                    <td className="py-2">
                      <span
                        className="rounded px-2 py-0.5 text-xs"
                        style={{ color: RISK_COLOR[risk].fg, backgroundColor: RISK_COLOR[risk].bg }}
                      >
                        {RISK_LABEL[risk]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
