# MSDA - MikroTik Smart DNS Analytics
# RouterOS v6 & v7 Universal Import Script

:local msdaServerIP "192.168.5.254"
:local msdaServerPort 514

:put "MSDA: Memulai setup..."

:foreach i in=[/system logging find] do={
:local act [/system logging get $i action]
:if ($act = "msdaremotesyslog") do={ /system logging remove $i }
}
:foreach i in=[/system logging action find] do={
:local n [/system logging action get $i name]
:if ($n = "msdaremotesyslog") do={ /system logging action remove $i }
}
:foreach i in=[/ip firewall nat find] do={
:local c [/ip firewall nat get $i comment]
:if ($c = "MSDA-DNS-UDP" or $c = "MSDA-DNS-TCP") do={ /ip firewall nat remove $i }
}

:put "MSDA: Konfigurasi lama dibersihkan."

/ip firewall nat add chain=dstnat protocol=udp dst-port=53 action=redirect to-ports=53 comment="MSDA-DNS-UDP"
/ip firewall nat add chain=dstnat protocol=tcp dst-port=53 action=redirect to-ports=53 comment="MSDA-DNS-TCP"

:put "MSDA: NAT firewall rule ditambahkan."

/system logging action add name=msdaremotesyslog target=remote remote=$msdaServerIP remote-port=$msdaServerPort

:put "MSDA: Logging action dibuat."

/system logging add topics=dns action=msdaremotesyslog

:put "MSDA: Logging rule DNS ditambahkan."



:put "================================================="
:put "  SUCCESS: MSDA Mikrotik Setup Berhasil!          "
:put "================================================="
