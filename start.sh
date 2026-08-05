#!/bin/bash

# 🔥 KUNCI UTAMA ANTI SUNEK: Buka limit socket container sedalam mungkin
ulimit -n 65535 2>/dev/null
ulimit -s unlimited 2>/dev/null

# =================================================================
# 🚀 ULTRA TURBO KERNEL TWEAKS 🚀
# =================================================================
echo "[*] Mengoptimalkan antrean socket & pembersihan TIME_WAIT..."
sysctl -w net.ipv4.tcp_tw_reuse=1 2>/dev/null
sysctl -w net.ipv4.tcp_fin_timeout=10 2>/dev/null
sysctl -w net.core.default_qdisc=fq 2>/dev/null
sysctl -w net.ipv4.tcp_congestion_control=bbr 2>/dev/null

echo "[*] Mengatur ukuran buffer raksasa agar tidak tersedak dobel request..."
sysctl -w net.ipv4.tcp_rmem="4096 8388608 16777216" 2>/dev/null
sysctl -w net.ipv4.tcp_wmem="4096 8388608 16777216" 2>/dev/null
sysctl -w net.core.rmem_max=16777216 2>/dev/null
sysctl -w net.core.wmem_max=16777216 2>/dev/null
sysctl -w net.core.netdev_max_backlog=50000 2>/dev/null
sysctl -w net.ipv4.tcp_max_syn_backlog=8192 2>/dev/null
# =================================================================

echo "[*] Membuat Banner Dropbear..."
cat << 'EOF' > /etc/dropbear_banner
<center><font color="#FF0000">==================================================</font></center><br>
<center><font color="#00FF00">👑 SELAMAT MENIKMATI 👑</font></center><br>
<center><font color="#00FFFF">🥳 SSH SERVER PAAS RAILWAY 🥳</font></center><br>
<br>
<font color="#FFA500"> 🔹 MULTIPLEXER :</font> <font color="#FFFF00">NODE.JS JAVASCRIPT ENGINE</font><br>
<font color="#00FF00"> 🔹 OS PLATFORM :</font> <font color="#00FFFF">UBUNTU</font><br>
<font color="#0000FF"> 🔹 SSH SERVICE :</font> <font color="#9B59B6">DROPBEAR ENHANCED BUFFER</font><br>
<center><font color="#FF0000">==================================================</font></center><br>
<center><font color="#FFD700">powered by : d e d e f a t h u</font></center><br>
<center><font color="#FF0000">==================================================</font></center>
EOF

SSL_INTERNAL_PORT="2443"

echo "[*] Membuat Sertifikat SSL Stunnel..."
mkdir -p /etc/stunnel /var/run/stunnel4
openssl req -new -newkey rsa:2048 -days 365 -nodes -x509 \
    -subj "/C=ID/ST=Jakarta/L=Jakarta/O=RailwaySSH/CN=localhost" \
    -keyout /etc/stunnel/stunnel.pem -out /etc/stunnel/stunnel.pem
chmod 600 /etc/stunnel/stunnel.pem

echo "[*] Memulai Dropbear Server di Port Lokal 22..."
/usr/sbin/dropbear -p 127.0.0.1:22 -b /etc/dropbear_banner -W 1048576 -K 15 -I 300
sleep 1

echo "[*] Mengonfigurasi & Memulai Stunnel di Port 2443..."
cat <<EOF > /etc/stunnel/stunnel.conf
pid = /var/run/stunnel4/stunnel.pid
foreground = no
debug = 0

[ssh-ssl]
accept = 127.0.0.1:$SSL_INTERNAL_PORT
connect = 127.0.0.1:22
cert = /etc/stunnel/stunnel.pem
EOF

rm -f /var/run/stunnel4/stunnel.pid 2>/dev/null
stunnel4 /etc/stunnel/stunnel.conf

echo "[*] Memulai WS-Proxy untuk SSH Dropbear di Port Lokal 8880..."
export WS_PORT="8880"
node ws-proxy.js &

if [ -f /usr/local/bin/badvpn-udpgw ]; then
    echo "[*] Memulai BadVPN udpgw di Port Global 7300..."
    /usr/local/bin/badvpn-udpgw --listen-addr 0.0.0.0:7300 --max-clients 1000 --max-connections-for-client 50 &
fi

TARGET_ZT_PORT="${ARGO_PORT:-8880}"

if [ -n "$TOKEN" ]; then
    echo "[*] Menghubungkan Terowongan SSH Zero Trust ke Port ${TARGET_ZT_PORT}..."
    /usr/local/bin/cloudflared tunnel run --protocol http2 --no-tls-verify --token "$TOKEN" --url "http://localhost:${TARGET_ZT_PORT}" > /tmp/named_tunnel.log 2>&1 &
fi

sleep 1

echo "[*] Memulai Mux.js di Port 8881..."
node mux.js &

sleep 1

echo "[*] Menjalankan Server Utama UI & Gateway Server.js..."
exec node server.js
