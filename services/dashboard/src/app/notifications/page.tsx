"use client";

import { useState } from "react";
import { useLoad } from "@/lib/useLoad";
import { CircleCheck } from "@gravity-ui/icons";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/api";
import type { NotificationItem } from "@/lib/types";
import { formatTimeWIB, formatDateTimeWIB, timeAgo } from "@/lib/format";
import PageHeader from "@/components/PageHeader";

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchNotifications(1, 50);
      setItems(res.data);
      setNow(Date.now());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }

  useLoad(load);

  async function handleMarkRead(id: string) {
    try {
      await markNotificationRead(id);
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to update");
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to update");
    }
  }

  const unreadCount = items.filter((n) => !n.is_read).length;

  return (
    <div className="min-h-screen bg-background pb-12">
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "/" }, { label: "Notifications" }]}
        title="Notifications"
        description={
          unreadCount > 0
            ? `${unreadCount} unread ${unreadCount === 1 ? "alert" : "alerts"}`
            : "You are all caught up"
        }
        actions={
          unreadCount > 0 ? (
            <button
              onClick={handleMarkAllRead}
              className="btn inline-flex items-center gap-2"
              title="Mark all notifications as read"
            >
              <CircleCheck width={16} height={16} />
              <span>Mark all as read</span>
            </button>
          ) : undefined
        }
      />

      <div className="page-x py-6 md:py-8">
        {/* Layout fleksibel memenuhi lebar desktop tanpa terlihat kecil di tengah */}
        <div className="w-full max-w-7xl mx-auto space-y-4">
          {error && (
            <div className="rounded-xl border border-flag-border bg-flag-bg p-4 text-sm text-flag flex items-center justify-between">
              <span>{error}</span>
              <button
                type="button"
                onClick={load}
                className="underline font-medium text-xs ml-3"
              >
                Retry
              </button>
            </div>
          )}

          {loading ? (
            <div className="text-center py-24">
              <div className="w-9 h-9 border-3 border-line border-t-primary rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-chalk-dim">Loading notifications…</p>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 px-4 rounded-2xl border border-dashed border-line bg-surface/40">
              <div className="w-12 h-12 rounded-full bg-surface-2 border border-line grid place-items-center mx-auto mb-3 text-chalk-faint">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
              </div>
              <p className="text-base font-medium text-chalk">No notifications yet</p>
              <p className="text-xs text-chalk-faint mt-1">
                You will be notified when blocklist violations or automated summaries occur.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((n) => {
                const isBlacklist = n.type_send === "blacklist_alert";
                const hasClients = Boolean(n.data.client && n.data.client.length > 0);
                const totalClientHits = hasClients
                  ? n.data.client.reduce((acc, c) => acc + (c.access_count || 1), 0)
                  : 0;

                return (
                  <article
                    key={n.id}
                    className={`w-full rounded-2xl border bg-surface chalk-surface p-5 sm:p-6 transition-all duration-150 ${
                      n.is_read
                        ? "border-line opacity-80"
                        : isBlacklist
                        ? "border-line border-l-4 border-l-flag shadow-xs"
                        : "border-line border-l-4 border-l-watch shadow-xs"
                    }`}
                  >
                    {/* Header card fleksibel: tipe alert, dot indikator, waktu WIB, waktu relatif, dan aksi mark read */}
                    <div className="flex items-center justify-between gap-4 pb-3 border-b border-line/60">
                      <div className="flex flex-wrap items-center gap-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                            isBlacklist
                              ? "bg-flag/10 text-flag border border-flag/20"
                              : "bg-watch/10 text-watch border border-watch/20"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isBlacklist ? "bg-flag" : "bg-watch"
                            }`}
                          />
                          {isBlacklist ? "Blocklist Alert" : "Batch Summary"}
                        </span>

                        <span
                          className="text-xs font-medium text-chalk"
                          title={formatDateTimeWIB(n.timestamp)}
                        >
                          {formatTimeWIB(n.timestamp)} WIB
                        </span>

                        <span className="text-xs text-chalk-faint">
                          ({timeAgo(n.timestamp, now)})
                        </span>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {!n.is_read ? (
                          <button
                            onClick={() => handleMarkRead(n.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border border-line bg-surface-2 hover:bg-surface text-chalk-dim hover:text-chalk transition-colors"
                            title="Mark this notification as read"
                          >
                            <CircleCheck width={14} height={14} />
                            <span>Mark as read</span>
                          </button>
                        ) : (
                          <span className="text-xs text-chalk-faint flex items-center gap-1.5 px-2 py-0.5">
                            <CircleCheck width={13} height={13} className="text-safe" />
                            Read
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Isi Pesan: Layout fleksibel memenuhi lebar desktop */}
                    <div
                      className={`pt-4 grid grid-cols-1 ${
                        hasClients
                          ? "lg:grid-cols-12 gap-6 items-start"
                          : "gap-4"
                      }`}
                    >
                      {/* Sisi Kiri / Info Utama: Domain, Kategori, Tipe */}
                      <div className={hasClients ? "lg:col-span-5 xl:col-span-4 space-y-3.5" : "space-y-3"}>
                        {n.data.domain && n.data.domain.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold text-chalk-faint uppercase tracking-wider mb-2">
                              Target Domain{n.data.domain.length > 1 ? "s" : ""}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {n.data.domain.map((dom, i) => (
                                <span
                                  key={i}
                                  className="font-mono text-sm px-3 py-1 rounded-lg bg-surface-2 border border-line text-chalk font-semibold break-all"
                                >
                                  {dom}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Metadata kategori & tipe */}
                        {(n.data.group || n.data.type) && (
                          <div>
                            <p className="text-[11px] font-semibold text-chalk-faint uppercase tracking-wider mb-1.5">
                              Classification
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              {n.data.group && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-3 text-chalk text-xs font-medium border border-line">
                                  <span className="text-chalk-faint">Category:</span> {n.data.group}
                                </span>
                              )}
                              {n.data.type && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-3 text-chalk-dim text-xs font-medium border border-line">
                                  <span className="text-chalk-faint">Type:</span> {n.data.type}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Sisi Kanan / Client Access: Grid fleksibel yang melebar di layar desktop */}
                      {hasClients && (
                        <div className="lg:col-span-7 xl:col-span-8 lg:border-l lg:border-line/70 lg:pl-6 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-semibold text-chalk-faint uppercase tracking-wider">
                              Client Access ({n.data.client.length})
                            </p>
                            <span className="text-xs text-chalk-dim font-medium">
                              Total queries:{" "}
                              <strong className="text-flag font-semibold">
                                {totalClientHits}×
                              </strong>
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                            {n.data.client.map((c, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line/80 hover:border-line text-xs transition-colors"
                              >
                                <div className="min-w-0 pr-2">
                                  <span className="font-mono text-chalk font-semibold text-sm">
                                    {c.ip}
                                  </span>
                                  {c.ap_info?.label && (
                                    <span className="block text-[11px] text-chalk-faint truncate mt-0.5">
                                      {c.ap_info.label}
                                    </span>
                                  )}
                                </div>
                                <span className="font-mono text-flag font-semibold bg-flag/10 px-2.5 py-1 rounded-lg border border-flag/20 shrink-0">
                                  {c.access_count}×
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
