# MSDA - ROLLBACK integrasi AdGuard Home. RouterOS v6 & v7.
# Mengembalikan DNS upstream MikroTik ke nilai sebelum mikrotik-adguard.rsc dan
# menghapus aturan pengerasan. NAT redirect & logging DNS MSDA TIDAK disentuh.

# Dipakai bila DNS lama tidak tersimpan (msda-prev-dns tidak ada / kosong):
:local fallbackDNS "1.1.1.1,8.8.8.8"

:local prev ""
:if ([:len [/system script find name="msda-prev-dns"]] > 0) do={
  :set prev [/system script get [find name="msda-prev-dns"] source]
}
:if ([:len $prev] = 0) do={ :set prev $fallbackDNS }

/ip dns set servers=$prev
:foreach i in=[/ip firewall filter find comment="MSDA-BLOCK-DOT-TCP"] do={ /ip firewall filter remove $i }
:foreach i in=[/ip firewall filter find comment="MSDA-BLOCK-DOT-UDP"] do={ /ip firewall filter remove $i }
:foreach i in=[/system script find name="msda-prev-dns"] do={ /system script remove $i }
/ip dns cache flush

:put ("MSDA-AGH: rollback selesai. DNS upstream = " . $prev)
