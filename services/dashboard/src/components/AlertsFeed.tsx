import { ShieldExclamation } from "@gravity-ui/icons";
import { riskLevelFromType, RISK_COLOR, RISK_LABEL } from "@/lib/domain-risk";
import { formatTimeWIB } from "@/lib/format";
import type { LabGridAP } from "@/lib/types";

export function AlertsFeed({ labGrid }: { labGrid: LabGridAP[] }) {
  // Kumpulkan semua client yang blocked, diurutkan terbaru
  const flagged = labGrid
    .flatMap((ap) =>
      ap.clients
        .filter((c) => c.last_action === "blocked")
        .map((c) => ({ ...c, ap_label: ap.ap_label }))
    )
    .sort((a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime())
    .slice(0, 8);

  return (
    <article className="rounded-2xl border border-line bg-surface chalk-surface p-5">
      <div className="flex items-center gap-2.5">
        <ShieldExclamation width={18} height={18} className="text-chalk-faint" />
        <div>
          <h2 className="font-display text-lg font-semibold text-chalk">Needs attention</h2>
          <p className="text-sm text-chalk-dim">Blocklist matches in the last 8 hours</p>
        </div>
      </div>

      {flagged.length === 0 ? (
        <p className="mt-5 text-sm text-chalk-dim">
          No blocklist match in this session.
        </p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {flagged.map((client, i) => {
            const risk   = riskLevelFromType(client.risk_level);
            const colors = RISK_COLOR[risk];
            return (
              <li
                key={`${client.client_ip}-${i}`}
                className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm"
                style={{ borderColor: colors.bg, backgroundColor: colors.bg }}
              >
                <div className="min-w-0">
                  <p className="text-chalk">
                    <span className="font-data">{client.client_ip}</span>
                    <span className="text-chalk-dim"> · {client.ap_label}</span>
                  </p>
                  <p className="font-data text-chalk-dim truncate">{client.last_domain}</p>
                  <p className="text-xs" style={{ color: colors.fg }}>
                    {RISK_LABEL[risk]} · {client.last_enforced === true ? "Blocked at DNS" : "Matched blocklist (monitor)"}
                  </p>
                </div>
                <span className="shrink-0 font-data text-xs text-chalk-faint">
                  {formatTimeWIB(client.last_seen)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
