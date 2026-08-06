import { ArrowUpRight, ChartBar, Globe, Shield } from "@gravity-ui/icons";

const stats = [
  { label: "Active APs", value: "12", detail: "+3 this week" },
  { label: "Unique clients", value: "184", detail: "Peak at 18:00" },
  { label: "Top domain", value: "youtube.com", detail: "38% of traffic" },
];

const domains = [
  { name: "youtube.com", share: 38, color: "from-sky-500 to-cyan-400" },
  { name: "tiktok.com", share: 24, color: "from-fuchsia-500 to-purple-500" },
  { name: "instagram.com", share: 18, color: "from-emerald-500 to-green-500" },
  { name: "chatgpt.com", share: 12, color: "from-amber-500 to-orange-500" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_45%),linear-gradient(135deg,#f8fafc_0%,#eef2ff_100%)] p-6 text-slate-900">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-3 rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-sky-600">
                SATA • Network Intelligence
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                Smart AP Traffic Analyzer
              </h1>
            </div>
            <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
              Live pipeline active
            </div>
          </div>
          <p className="max-w-2xl text-sm text-slate-600 sm:text-base">
            AI-powered monitoring for DNS traffic, access-point behavior, and daily reporting from Mikrotik logs.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {stats.map((item) => (
            <article key={item.label} className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm">
              <p className="text-sm text-slate-500">{item.label}</p>
              <div className="mt-3 flex items-end justify-between">
                <p className="text-3xl font-semibold">{item.value}</p>
                <span className="text-sm font-medium text-sky-600">{item.detail}</span>
              </div>
            </article>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <article className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-sky-100 p-2 text-sky-700">
                <ChartBar width={20} height={20} />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Traffic trend</h2>
                <p className="text-sm text-slate-500">Devices connected across the day</p>
              </div>
            </div>
            <div className="mt-6 h-48 rounded-2xl bg-slate-950 p-4 text-slate-100">
              <div className="flex h-full items-end gap-3">
                {[48, 72, 64, 92, 88, 124, 110].map((height, index) => (
                  <div key={index} className="flex-1 rounded-t-xl bg-gradient-to-t from-sky-500 to-cyan-300" style={{ height: `${height}%` }} />
                ))}
              </div>
            </div>
          </article>

          <article className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-violet-100 p-2 text-violet-700">
                <Globe width={20} height={20} />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Top domains</h2>
                <p className="text-sm text-slate-500">Most accessed by AP</p>
              </div>
            </div>
            <div className="mt-6 space-y-4">
              {domains.map((domain) => (
                <div key={domain.name}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span>{domain.name}</span>
                    <span className="font-semibold">{domain.share}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className={`h-2 rounded-full bg-gradient-to-r ${domain.color}`} style={{ width: `${domain.share}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="rounded-3xl border border-slate-200/70 bg-slate-950 p-6 text-slate-100 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-amber-500/20 p-2 text-amber-400">
                <Shield width={20} height={20} />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Alerting status</h2>
                <p className="text-sm text-slate-400">Real-time anomaly detection branch is ready</p>
              </div>
            </div>
            <a href="#" className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/20">
              Open workflow <ArrowUpRight width={16} height={16} />
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
