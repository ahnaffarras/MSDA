"use client";

import { useState, useEffect } from "react";
import { Bell, CircleCheck } from "@gravity-ui/icons";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/api";
import type { NotificationItem } from "@/lib/types";
import { formatTimeWIB } from "@/lib/format";

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchNotifications(1, 50);
      setItems(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat notifikasi");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleMarkRead(id: string) {
    try {
      await markNotificationRead(id);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Gagal update");
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Gagal update");
    }
  }

  const unreadCount = items.filter((n) => !n.is_read).length;

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-chalk">Notifikasi</h1>
            <p className="text-sm text-chalk-dim">
              {unreadCount > 0 ? `${unreadCount} belum dibaca` : "Semua sudah dibaca"}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm text-chalk-dim hover:text-chalk hover:bg-surface-2 transition-colors"
            >
              <CircleCheck width={16} height={16} />
              Tandai semua dibaca
            </button>
          )}
        </header>

        {error && <div className="mb-4 rounded-lg border border-flag bg-flag/10 p-3 text-sm text-flag">{error}</div>}

        {loading ? (
          <div className="text-center py-12 text-chalk-dim">Memuat...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-chalk-dim">Belum ada notifikasi.</div>
        ) : (
          <div className="space-y-3">
            {items.map((n) => (
              <article
                key={n.id}
                className={`rounded-2xl border bg-surface chalk-surface p-5 transition-colors ${
                  n.is_read ? "border-line" : "border-watch"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          color: n.type_send === "blacklist_alert" ? "var(--accent-flag)" : "var(--accent-watch)",
                          backgroundColor: n.type_send === "blacklist_alert" ? "var(--accent-flag-bg)" : "var(--accent-watch-bg)",
                        }}
                      >
                        {n.type_send === "blacklist_alert" ? "Blacklist Alert" : "Batch Summary"}
                      </span>
                      <span className="text-xs text-chalk-faint">{formatTimeWIB(n.timestamp)}</span>
                    </div>

                    {n.type_send === "blacklist_alert" && n.data.domain && (
                      <div className="space-y-2 mt-3">
                        <p className="text-sm text-chalk">
                          <span className="font-medium">Domain:</span> {n.data.domain.join(", ")}
                        </p>
                        {n.data.group && (
                          <p className="text-xs text-chalk-dim"><span className="text-chalk-faint">Group:</span> {n.data.group}</p>
                        )}
                        {n.data.type && (
                          <p className="text-xs text-chalk-dim"><span className="text-chalk-faint">Type:</span> {n.data.type}</p>
                        )}
                        {n.data.client && n.data.client.length > 0 && (
                          <p className="text-xs text-chalk-dim">
                            <span className="text-chalk-faint">Client:</span>{" "}
                            {n.data.client.map((c) => `${c.ip} (${c.access_count}x)`).join(", ")}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {!n.is_read && (
                    <button
                      onClick={() => handleMarkRead(n.id)}
                      className="shrink-0 rounded-lg border border-line bg-surface-2 p-2 hover:bg-surface text-chalk-dim hover:text-chalk transition-colors"
                      title="Tandai dibaca"
                    >
                      <CircleCheck width={14} height={14} />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
