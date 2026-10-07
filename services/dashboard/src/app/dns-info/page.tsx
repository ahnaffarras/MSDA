"use client";

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { useLoad } from "@/lib/useLoad";

type IpEntry = {
  ip: string;
  type: string;
  geo?: string;
};

type DNSInfo = {
  _id: string;
  domain: string;
  ip_address: string;
  all_ips: IpEntry[];
  registrar: string;
  company: string;
  country: string;
  city: string;
  region: string;
  org: string;
  asn: string;
  ptr_hostname: string;
  created_date: string;
  updated_date: string;
  expires_date: string;
  group: string;
  type: string;
};

function DNSInfoContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const domainParam = searchParams.get("domain") || searchParams.get("search") || "";

  const [dnsData, setDnsData] = useState<DNSInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(domainParam);
  const [prevDomainParam, setPrevDomainParam] = useState(domainParam);

  if (domainParam !== prevDomainParam) {
    setPrevDomainParam(domainParam);
    setSearch(domainParam);
  }

  const fetchDNSInfo = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/dns-info");
      const data = await res.json();
      setDnsData(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch DNS info:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useLoad(fetchDNSInfo);

  const filteredData = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dnsData;
    return dnsData.filter(
      (d) =>
        d.domain?.toLowerCase().includes(q) ||
        d.group?.toLowerCase().includes(q) ||
        d.type?.toLowerCase().includes(q) ||
        d.ip_address?.toLowerCase().includes(q) ||
        d.org?.toLowerCase().includes(q) ||
        d.company?.toLowerCase().includes(q)
    );
  }, [dnsData, search]);

  const clearFilter = () => {
    setSearch("");
    router.replace("/dns-info");
  };

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "/" }, { label: "Domain Info" }]}
        title="Domain Info"
        description="Ownership, hosting, and network details for the domains SATA has seen."
        actions={
          <button
            onClick={fetchDNSInfo}
            disabled={loading}
            className="btn"
            title="Refresh records"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        }
      />

      <div className="page-x py-6 md:py-8">
        <div className="bg-surface rounded-xl border border-line p-4 md:p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
            <label className="block text-sm font-medium text-chalk-dim">
              Search domains
            </label>
            {search && (
              <button
                type="button"
                onClick={clearFilter}
                className="text-xs text-primary hover:underline text-left self-start sm:self-auto"
              >
                Clear filter
              </button>
            )}
          </div>
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type a domain name, category, or IP…"
              className="w-full px-4 py-2.5 bg-background border border-line rounded-lg text-chalk placeholder-chalk-faint focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-sm"
            />
            {search && (
              <button
                type="button"
                onClick={clearFilter}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-chalk-faint hover:text-chalk text-xs px-1.5 py-0.5 rounded bg-surface border border-line"
              >
                ✕
              </button>
            )}
          </div>
          {domainParam && (
            <p className="mt-2 text-xs text-chalk-faint">
              Filtering by:{" "}
              <span className="font-mono text-primary font-semibold">
                {domainParam}
              </span>
            </p>
          )}
        </div>

        <div className="bg-surface rounded-xl border border-line overflow-hidden">
          <div className="border-b border-line px-5 py-4 flex items-center justify-between">
            <h2 className="text-base md:text-lg font-semibold text-chalk">
              Domain records ({filteredData.length})
            </h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-3 border-line border-t-primary rounded-full animate-spin"></div>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="text-center py-16 text-chalk-faint px-4">
              <svg
                className="w-12 h-12 mx-auto mb-3 text-chalk-faint"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm font-medium">No domain information found</p>
              {search && (
                <button
                  type="button"
                  onClick={clearFilter}
                  className="mt-3 inline-block text-xs text-primary underline"
                >
                  Show all records
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-line">
              {filteredData.map((dns) => (
                <div
                  key={dns._id}
                  className="p-5 md:p-6 hover:bg-surface-2 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-chalk font-mono mb-1 break-all">
                        {dns.domain}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2">
                        {dns.group && dns.group !== "Unknown" && (
                          <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs border border-primary/20 font-medium">
                            {dns.group}
                          </span>
                        )}
                        {dns.type && dns.type !== "unknown" && (
                          <span className="px-2 py-0.5 bg-surface-3 text-chalk-dim rounded text-xs border border-line">
                            {dns.type}
                          </span>
                        )}
                      </div>
                    </div>
                    {dns.org && dns.org !== "-" && (
                      <div className="sm:text-right">
                        <p className="text-xs text-chalk-faint">ISP / Organization</p>
                        <p className="text-sm text-chalk-dim font-medium">{dns.org}</p>
                        {dns.asn && dns.asn !== "-" && (
                          <p className="text-xs text-chalk-faint font-mono">{dns.asn}</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-3 text-xs md:text-sm">
                    <div>
                      <p className="text-xs text-chalk-faint mb-0.5">IP Address</p>
                      <p className="font-mono text-chalk font-medium truncate">
                        {dns.ip_address}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-chalk-faint mb-0.5">Registrar / Owner</p>
                      <p className="text-chalk truncate">{dns.registrar}</p>
                    </div>
                    <div>
                      <p className="text-xs text-chalk-faint mb-0.5">Company</p>
                      <p className="text-chalk truncate">{dns.company}</p>
                    </div>
                    <div>
                      <p className="text-xs text-chalk-faint mb-0.5">Server Location</p>
                      <p className="text-chalk truncate">
                        {dns.country !== "-"
                          ? dns.country
                          : dns.city !== "-"
                          ? dns.city
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-chalk-faint mb-0.5">Last Verified</p>
                      <p className="text-chalk">{dns.updated_date}</p>
                    </div>
                    <div>
                      <p className="text-xs text-chalk-faint mb-0.5">First Recorded</p>
                      <p className="text-chalk">{dns.created_date}</p>
                    </div>
                    {dns.ptr_hostname && dns.ptr_hostname !== "-" && (
                      <div className="col-span-2">
                        <p className="text-xs text-chalk-faint mb-0.5">PTR Hostname</p>
                        <p className="text-chalk font-mono truncate">
                          {dns.ptr_hostname}
                        </p>
                      </div>
                    )}
                  </div>

                  {dns.all_ips && dns.all_ips.length > 1 && (
                    <div className="mt-3 pt-3 border-t border-line/60">
                      <p className="text-xs text-chalk-faint mb-1.5">
                        All IPs ({dns.all_ips.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {dns.all_ips.map((ipEntry, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 bg-background border border-line rounded text-xs font-mono text-chalk-dim"
                          >
                            {ipEntry.ip}
                            {ipEntry.type && (
                              <span className="text-chalk-faint ml-1">
                                [{ipEntry.type}]
                              </span>
                            )}
                            {ipEntry.geo && (
                              <span className="text-chalk-faint ml-1">
                                — {ipEntry.geo}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DNSInfoPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background grid place-items-center">
          <div className="w-8 h-8 border-3 border-line border-t-primary rounded-full animate-spin" />
        </div>
      }
    >
      <DNSInfoContent />
    </Suspense>
  );
}
