/**
 * Mirrors the actual MongoDB collections and Go backend models.
 * Field names kept identical to backend JSON responses.
 */

// ── dns_events (n8n → MongoDB) ──────────────────────────────────────────────
export interface DnsEvent {
  timestamp:   string; // ISO 8601
  source_type: string; // "mikrotik_dns"
  ap_ip:       string;
  ap_name:     string;
  client_ip:   string;
  domain:      string;
  risk_level:  string; // "safe" | "watch" | "flag"
  ingested_at: string; // ISO 8601
}

// ── dns_info (AI Analyzer output) ───────────────────────────────────────────
export interface DNSInfo {
  id:            string;
  domain:        string;
  group:         string;
  type:          string;
  info_app:      InfoApp | null;
  ip_scan:       IPScan[];
  ptr_hostname:  string;
  host_isp:      HostISP | null;
  last_verified: string;
  timestamp:     string;
}

export interface InfoApp {
  platform:            string[];
  company_responsible: string;
  owner:               string;
}

export interface IPScan {
  ip:   string;
  type: string;
  geo:  string;
}

export interface HostISP {
  city:   string;
  region: string;
  org:    string;
  asn:    string;
}

// ── dns_blacklist (admin-managed) ───────────────────────────────────────────
export interface DNSBlacklist {
  id:            string;
  blocked_level: "domain" | "group";
  domain?:       string;
  group?:        string;
  type:          string;
  is_active:     boolean;
  created_at:    string;
  updated_at:    string;
}

// ── client_access_dns (backend-written) ─────────────────────────────────────
export interface ClientAccessLog {
  id:           string;
  timestamp:    string;
  domain:       string;
  group:        string;
  type:         string;
  action:       "allowed" | "blocked";
  client_ip:    string;
  ap_info:      APInfo;
  access_count: number;
}

export interface APInfo {
  label: string;
  ip:    string;
}

// ── notifications (webhook from n8n) ────────────────────────────────────────
export interface NotificationItem {
  id:        string;
  type_send: "blacklist_alert" | "batch_summary";
  data:      NotificationData;
  is_read:   boolean;
  timestamp: string;
}

export interface NotificationData {
  domain: string[];
  group:  string;
  type:   string;
  client: NotificationClient[];
}

export interface NotificationClient {
  ip:          string;
  access_count: number;
  ap_info:     APInfo;
}

// ── ai_reports (n8n daily report) ───────────────────────────────────────────
export interface AIReport {
  id:         string;
  timestamp:  string;
  date_label: string;
  report_text: string;
  raw_rows:   number;
  ap_count:   number;
  raw_data:   string;
}

// ── dashboard summary ───────────────────────────────────────────────────────
export interface DashboardSummary {
  total_queries:     number;
  unique_domains:    number;
  new_domains:       number;
  blacklist_hits:    number;
  blacklist_clients: number;
  cached_responses:  number;
  range:             string;
}

// ── dashboard lab-grid ──────────────────────────────────────────────────────
export interface LabClient {
  client_ip:   string;
  last_domain: string;
  last_action: string;
  last_seen:   string;
  risk_level:  string;
}

export interface LabGridAP {
  ap_label: string;
  ap_ip:    string;
  clients:  LabClient[];
}

// ── dashboard top-domains / top-clients ─────────────────────────────────────
export interface TopDomain {
  domain: string;
  group:  string;
  type:   string;
  count:  number;
}

export interface TopClient {
  client_ip:      string;
  ap_label:       string;
  blacklist_hits: number;
}

// ── client-access stats ─────────────────────────────────────────────────────
export interface ClientAccessStats {
  per_day:  { date: string; count: number }[];
  per_type: { type: string; count: number }[];
  per_ap:   { ap_label: string; ap_ip: string; count: number }[];
}

// ── pagination wrapper ──────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; total_pages: number };
}

// ── UI seat map ─────────────────────────────────────────────────────────────
export interface LabSeat {
  seat:          number;
  client_ip:     string;
  student_label: string;
}

// ── Device Types ────────────────────────────────────────────────────────────
export type DeviceType = 'PC' | 'AP' | 'Client' | 'Server' | 'Printer' | 'Other';

// ── Network Types ───────────────────────────────────────────────────────────
// Network Types are now stored in database, not hard-coded
export interface NetworkTypeItem {
  id: string;
  name: string;
  created_at: string;
}

// ── lab_configs (flexible lab configuration) ────────────────────────────────
export interface LabConfig {
  id:           string;
  name:         string;           // e.g., "Lab Komputer 1", "Lab Multimedia", "Lapkom A"
  ap_ip:        string;           // Access Point IP
  network_type: string;      // Type of network
  description?: string;           // Optional description
  order:        number;           // Display order in tabs
  is_active:    boolean;          // Show/hide this lab
  created_at:   string;
  updated_at:   string;
}

export interface IPMapping {
  id:          string;
  lab_id:      string;           // Reference to LabConfig.id
  client_ip:   string;           // IP address from logs
  device_type: DeviceType;       // Type of device (PC, AP, Client, etc)
  seat:        number;           // Seat/position number
  label:       string;           // e.g., "PC-01", "AP-Main", "Client-A"
  description?: string;          // Optional description
  created_at:  string;
  updated_at:  string;
}

// ── Available IPs from logs ─────────────────────────────────────────────────
export interface AvailableIP {
  client_ip:    string;
  ap_ip:        string;
  ap_name:      string;
  last_seen:    string;
  query_count:  number;
  is_mapped:    boolean;        // Already mapped to a lab?
}

// ── Network Summary ─────────────────────────────────────────────────────────
export interface NetworkSummary {
  lab_id:      string;
  lab_name:    string;
  total_devices: number;
  by_type:     { device_type: DeviceType; count: number }[];
  ap_count:    number;
  client_count: number;
}

// ── Groups (Main menu items in sidebar) ─────────────────────────────────────
export interface Group {
  id:           string;
  name:         string;           // e.g., "Kelas A", "Lab Multimedia", "Ruang Server"
  description?: string;           // Optional description
  order:        number;           // Display order in sidebar
  is_active:    boolean;          // Show/hide this group
  created_at:   string;
  updated_at:   string;
}

// ── Nodes (Submenu items under each Group) ──────────────────────────────────
export interface Node {
  id:           string;
  group_id:     string;           // Reference to Group.id
  name:         string;           // e.g., "AP r.23", "AP r.24", "Server Main"
  ap_ip:        string;           // Access Point IP or device IP
  device_type:  string;           // e.g., "AP", "Server", "Router"
  description?: string;           // Optional description
  order:        number;           // Display order within group
  is_active:    boolean;          // Show/hide this node
  created_at:   string;
  updated_at:   string;
}
