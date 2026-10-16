# DNS Enforcement with AdGuard Home (optional)

By default the MSDA blocklist only **monitors**: a matching domain raises an alert (Slack, dashboard) but the client can still open it. This optional module adds AdGuard Home (AGH) as a DNS blocker. Every blocklist entry gets a mode:

| Mode | Behaviour |
|---|---|
| **Monitor** (`alert`, default) | alert only, same as before |
| **Block DNS** (`enforce`) | blocked at DNS (the domain **and all its subdomains**) and still alerted |

When the feature is off (`MSDA_ENFORCEMENT_ENABLED=false`, the default) MSDA behaves exactly as before: the enforcement UI is hidden, `/api/v1/adguard/*` answers `{"enabled": false}`, nothing runs.

> `action: "blocked"` in `ip_access_dns` has always meant "matched the blocklist". The UI now shows **Blocked** only when `enforced === true`, otherwise *Matched blocklist (monitor)*.

## Topology

```
client ──53──▶ MikroTik (first resolver, NAT redirect, DNS logging ─▶ Vector ─▶ n8n)
                  │  only upstream
                  ▼
              AdGuard Home ──▶ public DNS (9.9.9.9, 1.1.1.1)

MongoDB dns_blacklist ──▶ Go backend (sync) ──▶ AGH /control/filtering/set_rules
```

- The log pipeline does not change. **Per-client attribution always comes from MikroTik logs**; AGH only ever sees the MikroTik IP.
- MongoDB `dns_blacklist` is the source of truth. The backend replaces the whole AGH rule set (idempotent). **Do not edit rules in the AGH UI; they are overwritten.**
- Only the backend holds AGH credentials. n8n reads `GET /api/v1/webhooks/adguard-status` (header `X-MSDA-Token`).

## Enable

1. In `infrastructure/docker/.env` set `MSDA_HOST_IP` (the LAN IP of the Docker host), `ADGUARD_USER`, `ADGUARD_PASSWORD` (≥ 12 chars), `MIKROTIK_IP` (the IP AGH sees MikroTik with), `MSDA_NEVER_BLOCK` (your infrastructure domains) and `MSDA_ENFORCEMENT_ENABLED=true`.
2. `docker compose --profile enforcement up -d`
3. `./infrastructure/adguard/init.sh` (once; safe to repeat). It runs the install wizard through the API, sets upstream DNS and blocking mode, removes the default filter lists, sets 24 h retention and restricts allowed clients.
   *Manual alternative:* open `http://127.0.0.1:3000`, finish the wizard (DNS listen on 53, web on 3000), then in Settings: remove all filter lists, set upstreams (not MikroTik), DNS blocking mode **Null IP** (or NXDOMAIN), retention 24 h, and under Access settings allow only MikroTik and the Docker network.
4. `docker compose up -d backend dashboard` so they pick up the env.
5. On the router, edit the two variables at the top of `infrastructure/mikrotik/mikrotik-adguard.rsc` and import it.
6. In the dashboard open **Blocklist**: the *DNS Enforcement* panel should say *Connected*.

AdGuard Home is pinned to `v0.107.79`. Raise it only after re-checking the endpoints below against that version's `openapi.yaml`.

## Disable / rollback

- Set `MSDA_ENFORCEMENT_ENABLED=false`, restart backend and dashboard.
- On the router import `mikrotik-adguard-rollback.rsc` (restores the previous upstream DNS and removes the DoT block).
- `docker compose --profile enforcement down` stops AGH. Existing `block_mode` values stay in MongoDB and take effect again when re-enabled.

## Fail-open vs fail-closed

Choose in `mikrotik-adguard.rsc` (`backupDNS`). Default is **fail-closed**: if AGH is down, DNS is down. Setting a backup DNS gives **fail-open**: the network survives an AGH outage but blocking is lost, and RouterOS may also use the backup while AGH is merely slow. With fail-open you **must** alert on AGH status; the endpoint `/api/v1/webhooks/adguard-status` returns `healthy` and `problems` (`unreachable`, `protection_off`, `sync_error`, `sync_stale`, `never_synced`).

## Safety rules

- Domains are validated strictly before becoming rules (`[a-z0-9-.]` only, IDN → punycode, ≥ 2 labels, labels ≤ 63). Anything with `^ $ | @ * / \`, spaces or newlines is rejected, so a value can never inject a modifier like `$dnsrewrite` or a second rule line.
- TLDs and public suffixes (`com`, `co.id`, `blogspot.com`) are rejected.
- `MSDA_NEVER_BLOCK` protects a domain, its subdomains **and its parents** (blocking `example.id` would also kill `dashboard.example.id`).
- Domains that are widely used or very short need the admin to retype the domain. Bulk changes skip them.
- Allowlisted domains win; an allowlist entry under a blocked domain becomes an `@@||sub.domain^` exception.
- Blocking mode `default`/`refused` is rejected: clients could try other resolvers. Use `null_ip` or `nxdomain`.
- Never expose port 53 of AGH to the internet (open resolver). It binds to `MSDA_HOST_IP` only and the allowed-clients list is restricted.
- Mode changes, manual sync and the protection switch are admin-only and written to the audit log.

## Limits you must know

1. **DNS cache.** MikroTik keeps answers until their TTL expires, so a new block can lag. After each change the backend clears the AGH cache; flush MikroTik with `/ip dns cache flush` (the script does it once).
2. **DoH/DoT bypass.** The NAT rule only redirects port 53. Browsers with DoH and Android Private DNS can bypass blocking. The script blocks TCP/UDP 853; the dashboard offers a *Block public DoH resolvers* preset (suggestion, not automatic).
3. **No block page.** The answer is `0.0.0.0` or NXDOMAIN; HTTPS sites just fail to connect.
4. **Client attribution.** AGH sees MikroTik only. Do not build features on AGH's client IPs.
5. **Group entries.** The backend expands `blocked_level: "group"` into all `dns_info` domains of that group for DNS blocking. The current n8n workflow (v9) drops entries without a `domain`, so group entries do not raise alerts. Fix this in n8n.
6. **Port 53 on the host.** On Ubuntu `systemd-resolved` uses `127.0.0.53:53`; binding to the LAN IP normally does not clash. If it does, disable `DNSStubListener`.

## Test

```bash
# 1. add a Block DNS entry in the dashboard (or: Check a domain in the panel)
dig bad-example.com @<MSDA_HOST_IP>        # → 0.0.0.0 (or NXDOMAIN)
dig bad-example.com @<MikroTik IP>         # same answer through the router
nslookup bad-example.com                   # from a client on the LAN
curl -s http://127.0.0.1:8081/api/v1/adguard/status -H "X-Internal-Token: …"   # dev override port
```

## Backend API

| Endpoint | Notes |
|---|---|
| `GET /api/v1/adguard/status` | enabled, healthy, version, protection, rule count, blocked today, last sync, problems |
| `POST /api/v1/adguard/sync` | sync now (`?force=true` always pushes) |
| `POST /api/v1/adguard/protection` | `{ "enabled": bool }` (admin) |
| `GET /api/v1/adguard/check?domain=` | would it be blocked, matching rule |
| `GET /api/v1/adguard/stats` | AGH counters and top blocked domains (from MSDA events) |
| `GET /api/v1/webhooks/adguard-status` | for n8n, guarded by `X-MSDA-Token` |

AGH endpoints used: `GET /control/status`, `GET /control/filtering/status`, `POST /control/filtering/set_rules`, `GET /control/filtering/check_host`, `GET /control/stats`, `POST /control/cache_clear`, `POST /control/protection`, `GET /control/dns_info`, `POST /control/dns_config` (HTTP Basic auth). The init script additionally uses `/control/install/configure`, `/control/filtering/remove_url`, `/control/filtering/config`, `/control/querylog/config`, `/control/stats/config` and `/control/access/set`.
