import type { ReactNode } from "react";

export function StatCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <article className="rounded-2xl border border-line bg-surface chalk-surface p-5">
      <div className="flex items-center gap-2 text-chalk-dim">
        <span className="text-chalk-faint">{icon}</span>
        <p className="text-sm">{label}</p>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="font-display text-3xl font-semibold text-chalk">{value}</p>
        {detail && <span className="text-xs text-chalk-dim">{detail}</span>}
      </div>
    </article>
  );
}
