# MSDA - Integrasi AdGuard Home (DNS Enforcement)
# RouterOS v6 & v7. Idempoten: aman dijalankan berulang (aturan lama dibersihkan lewat comment).
#
# URUTAN: jalankan SETELAH mikrotik-setup.rsc (NAT redirect port 53 + logging DNS tetap dipakai).
# Topologi (D2): klien -> MikroTik (resolver pertama, log tetap ke Vector/n8n) -> AdGuard (SATU-SATUNYA upstream).
# AdGuard hanya melihat IP MikroTik; atribusi per klien tetap dari log MikroTik.
#
# ---- TRADE-OFF GAGAL-BUKA vs GAGAL-TUTUP (D8) ----
#   backupDNS = ""            GAGAL-TUTUP : bila AdGuard mati, DNS mati total (jaringan "putus", tetapi tidak ada yang lolos).
#   backupDNS = "1.1.1.1"     GAGAL-BUKA  : bila AdGuard mati, MikroTik beralih ke DNS cadangan -> jaringan tetap hidup,
#                                           TETAPI semua pemblokiran hilang sementara. WAJIB pantau status AdGuard (alert n8n).
# Catatan: RouterOS dapat memakai server cadangan walau AdGuard hidup tetapi lambat; ini bisa meloloskan sebagian query.
#
# ---- SESUAIKAN ----
:local aghIP "192.168.5.254"
:local backupDNS ""
# Pengerasan opsional: blok DNS-over-TLS (TCP 853) dan DNS-over-QUIC (UDP 853) agar klien tidak melewati pemblokiran.
:local hardenDoT true

:put "MSDA-AGH: Memulai setup..."

# Simpan DNS lama SEKALI (untuk rollback)
:local cur [/ip dns get servers]
:if ([:len [/system script find name="msda-prev-dns"]] = 0 && [:tostr $cur] != $aghIP) do={
  /system script add name="msda-prev-dns" source=[:tostr $cur] comment="MSDA-AGH: DNS servers sebelum AdGuard"
}

# Bersihkan aturan lama milik skrip ini (berdasarkan comment)
:foreach i in=[/ip firewall filter find comment="MSDA-BLOCK-DOT-TCP"] do={ /ip firewall filter remove $i }
:foreach i in=[/ip firewall filter find comment="MSDA-BLOCK-DOT-UDP"] do={ /ip firewall filter remove $i }

# Upstream: AdGuard saja (atau + cadangan bila operator memilih gagal-buka)
:local servers $aghIP
:if ([:len $backupDNS] > 0) do={ :set servers ($aghIP . "," . $backupDNS) }
/ip dns set servers=$servers allow-remote-requests=yes

# Tanpa DoH upstream (jika ada, MikroTik akan melewati AdGuard)
:do { /ip dns set use-doh-server="" } on-error={ :put "MSDA-AGH: use-doh-server tidak tersedia pada versi ini (diabaikan)." }

:if ($hardenDoT) do={
  # place-before=0 menaruh aturan di paling atas; bila tabel filter kosong, tambahkan biasa.
  :do {
    /ip firewall filter add chain=forward protocol=tcp dst-port=853 action=reject reject-with=icmp-admin-prohibited comment="MSDA-BLOCK-DOT-TCP" place-before=0
    /ip firewall filter add chain=forward protocol=udp dst-port=853 action=drop comment="MSDA-BLOCK-DOT-UDP" place-before=0
  } on-error={
    /ip firewall filter add chain=forward protocol=tcp dst-port=853 action=reject reject-with=icmp-admin-prohibited comment="MSDA-BLOCK-DOT-TCP"
    /ip firewall filter add chain=forward protocol=udp dst-port=853 action=drop comment="MSDA-BLOCK-DOT-UDP"
  }
  :put "MSDA-AGH: DoT/DoQ (853) diblokir."
}

# Bersihkan cache supaya pemblokiran baru langsung berlaku
/ip dns cache flush

# NAT redirect port 53 dan logging dari mikrotik-setup.rsc TIDAK diubah.
:put "MSDA-AGH: NAT redirect & logging DNS dipertahankan."
:put "================================================="
:put "  SUCCESS: DNS MikroTik sekarang memakai AdGuard  "
:put "================================================="
:put "Uji dari klien:  nslookup <domain-enforce>  -> 0.0.0.0 / NXDOMAIN"
:put "CATATAN: DoH browser & Android Private DNS tetap bisa melewati; lihat docs/adguard.md."
