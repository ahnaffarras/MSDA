# SATA - Smart AP Traffic Analyzer
# RouterOS v6 & v7 Universal Import Script

:local sataServerIP "192.168.5.254"
:local sataServerPort 514

:put "SATA: Memulai setup..."

:foreach i in=[/system logging find] do={
:local act [/system logging get $i action]
:if ($act = "sataremotesyslog") do={ /system logging remove $i }
}
:foreach i in=[/system logging action find] do={
:local n [/system logging action get $i name]
:if ($n = "sataremotesyslog") do={ /system logging action remove $i }
}
:foreach i in=[/ip firewall nat find] do={
:local c [/ip firewall nat get $i comment]
:if ($c = "SATA-DNS-UDP" or $c = "SATA-DNS-TCP") do={ /ip firewall nat remove $i }
}

:put "SATA: Konfigurasi lama dibersihkan."

/ip firewall nat add chain=dstnat protocol=udp dst-port=53 action=redirect to-ports=53 comment="SATA-DNS-UDP"
/ip firewall nat add chain=dstnat protocol=tcp dst-port=53 action=redirect to-ports=53 comment="SATA-DNS-TCP"

:put "SATA: NAT firewall rule ditambahkan."

/system logging action add name=sataremotesyslog target=remote remote=$sataServerIP remote-port=$sataServerPort

:put "SATA: Logging action dibuat."

/system logging add topics=dns action=sataremotesyslog

:put "SATA: Logging rule DNS ditambahkan."



:put "================================================="
:put "  SUCCESS: SATA Mikrotik Setup Berhasil!          "
:put "================================================="
