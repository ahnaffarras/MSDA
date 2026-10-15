"use client";

import { useState } from "react";
import { useLoad } from "@/lib/useLoad";
import { adminFetch } from "@/lib/admin-client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import {
  CHANNELS,
  DEFAULT_NOTIFICATION_SETTINGS,
  DIGEST_MAX_MINUTES,
  SEVERITIES,
  type Channel,
  type NotificationSettings,
} from "@/lib/notification-settings";
import { formatDateTimeWIB } from "@/lib/format";

const FIELD =
  "px-3 py-2 rounded-lg border border-line bg-background text-sm text-chalk focus:border-primary focus:outline-none disabled:opacity-60";

const CHANNEL_LABEL: Record<Channel, string> = { slack: "Slack", telegram: "Telegram" };
const DIGEST_CHOICES = [
  { v: 0, label: "Send immediately" },
  { v: 15, label: "Every 15 minutes" },
  { v: 60, label: "Every hour" },
  { v: 360, label: "Every 6 hours" },
  { v: DIGEST_MAX_MINUTES, label: "Once a day" },
];

export default function NotificationSettingsPage() {
  const { isAdmin } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [testAvailable, setTestAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<Channel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/notification-settings", { cache: "no-store", credentials: "same-origin" });
      const data = (await res.json()) as { settings?: NotificationSettings; test_available?: boolean; error?: string };
      if (!res.ok || !data.settings) throw new Error(data.error ?? "Failed to load settings");
      setSettings(data.settings);
      setTestAvailable(Boolean(data.test_available));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }
  useLoad(load);

  async function save() {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const { channels, digest_minutes, quiet_hours } = settings;
      const res = await adminFetch("/api/notification-settings", {
        method: "PUT",
        body: JSON.stringify({ channels, digest_minutes, quiet_hours }),
      });
      const data = (await res.json()) as { settings?: NotificationSettings; error?: string };
      if (!res.ok || !data.settings) throw new Error(data.error ?? "Failed to save settings");
      setSettings(data.settings);
      setOk("Settings saved.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest(channel: Channel) {
    setTesting(channel);
    setError(null);
    setOk(null);
    try {
      const res = await adminFetch("/api/notification-settings/test", {
        method: "POST",
        body: JSON.stringify({ channel }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Test failed");
      setOk(`Test message sent to ${CHANNEL_LABEL[channel]}. Check the channel.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(null);
    }
  }

  const readOnly = !isAdmin || saving;

  return (
    <div className="min-h-screen bg-background pb-12">
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "/" }, { label: "Notifications", href: "/notifications" }, { label: "Settings" }]}
        title="Notification settings"
        description="Which channels receive alerts, from what severity, and when to stay quiet. n8n reads these settings."
      />

      <div className="page-x py-6 md:py-8">
        <div className="w-full max-w-3xl mx-auto space-y-5">
          {!isAdmin && (
            <p className="rounded-xl border border-line bg-surface-2 p-3 text-sm text-chalk-dim">
              You can view these settings. Only administrators can change them.
            </p>
          )}
          {error && <p role="alert" className="rounded-xl border border-flag-border bg-flag-bg p-3 text-sm text-flag">{error}</p>}
          {ok && <p role="status" className="rounded-xl border border-line bg-surface-2 p-3 text-sm text-chalk">{ok}</p>}

          {loading ? (
            <p className="text-sm text-chalk-dim py-10 text-center">Loading…</p>
          ) : (
            <>
              <section className="rounded-2xl border border-line bg-surface p-5 space-y-4">
                <h2 className="text-base font-semibold text-chalk">Channels</h2>
                {CHANNELS.map((ch) => {
                  const c = settings.channels[ch];
                  return (
                    <div key={ch} className="flex flex-wrap items-center gap-3 border-t border-line/60 pt-4 first:border-0 first:pt-0">
                      <label className="inline-flex items-center gap-2 w-32 text-sm font-medium text-chalk">
                        <input
                          type="checkbox"
                          checked={c.enabled}
                          disabled={readOnly}
                          onChange={(e) => setSettings({ ...settings, channels: { ...settings.channels, [ch]: { ...c, enabled: e.target.checked } } })}
                        />
                        {CHANNEL_LABEL[ch]}
                      </label>
                      <label className="text-xs text-chalk-dim">
                        Minimum severity{" "}
                        <select
                          value={c.min_severity}
                          disabled={readOnly || !c.enabled}
                          onChange={(e) => setSettings({ ...settings, channels: { ...settings.channels, [ch]: { ...c, min_severity: e.target.value as typeof c.min_severity } } })}
                          className={`${FIELD} ml-1 capitalize`}
                        >
                          {SEVERITIES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                      {isAdmin && (
                        <button
                          type="button"
                          className="btn ml-auto"
                          disabled={!testAvailable || testing !== null}
                          onClick={() => sendTest(ch)}
                          title={testAvailable ? `Send a test message to ${CHANNEL_LABEL[ch]}` : "Not configured: set N8N_TEST_NOTIFY_URL on the dashboard"}
                        >
                          {testing === ch ? "Sending…" : "Send test"}
                        </button>
                      )}
                    </div>
                  );
                })}
                {isAdmin && !testAvailable && (
                  <p className="text-xs text-chalk-faint">
                    “Send test” is disabled because <code>N8N_TEST_NOTIFY_URL</code> is empty. Create the test webhook in n8n, then set that variable on the dashboard.
                  </p>
                )}
                <p className="text-xs text-chalk-faint">Bot tokens and webhook URLs are stored in n8n, never here.</p>
              </section>

              <section className="rounded-2xl border border-line bg-surface p-5 space-y-3">
                <h2 className="text-base font-semibold text-chalk">Delivery</h2>
                <label className="block text-xs font-medium text-chalk-dim">
                  Batching
                  <select
                    value={settings.digest_minutes}
                    disabled={readOnly}
                    onChange={(e) => setSettings({ ...settings, digest_minutes: Number(e.target.value) })}
                    className={`${FIELD} block mt-1`}
                  >
                    {DIGEST_CHOICES.map((d) => (
                      <option key={d.v} value={d.v}>{d.label}</option>
                    ))}
                    {!DIGEST_CHOICES.some((d) => d.v === settings.digest_minutes) && (
                      <option value={settings.digest_minutes}>Every {settings.digest_minutes} minutes</option>
                    )}
                  </select>
                </label>
              </section>

              <section className="rounded-2xl border border-line bg-surface p-5 space-y-3">
                <h2 className="text-base font-semibold text-chalk">Quiet hours</h2>
                <label className="inline-flex items-center gap-2 text-sm text-chalk">
                  <input
                    type="checkbox"
                    checked={settings.quiet_hours.enabled}
                    disabled={readOnly}
                    onChange={(e) => setSettings({ ...settings, quiet_hours: { ...settings.quiet_hours, enabled: e.target.checked } })}
                  />
                  Hold non-critical alerts during quiet hours
                </label>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="text-xs font-medium text-chalk-dim">
                    From
                    <input type="time" value={settings.quiet_hours.start} disabled={readOnly || !settings.quiet_hours.enabled}
                      onChange={(e) => setSettings({ ...settings, quiet_hours: { ...settings.quiet_hours, start: e.target.value } })}
                      className={`${FIELD} block mt-1`} />
                  </label>
                  <label className="text-xs font-medium text-chalk-dim">
                    Until
                    <input type="time" value={settings.quiet_hours.end} disabled={readOnly || !settings.quiet_hours.enabled}
                      onChange={(e) => setSettings({ ...settings, quiet_hours: { ...settings.quiet_hours, end: e.target.value } })}
                      className={`${FIELD} block mt-1`} />
                  </label>
                  <span className="text-xs text-chalk-faint pb-2">Time zone: {settings.quiet_hours.tz}</span>
                </div>
              </section>

              <div className="flex items-center justify-between">
                <p className="text-xs text-chalk-faint">
                  {settings.updated_at ? `Last saved ${formatDateTimeWIB(settings.updated_at)} WIB${settings.updated_by ? ` by ${settings.updated_by}` : ""}` : "Using defaults (never saved)."}
                </p>
                {isAdmin && (
                  <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
                    {saving ? "Saving…" : "Save settings"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
