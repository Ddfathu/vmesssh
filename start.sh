#!/bin/bash

# 🔥 KUNCI UTAMA ANTI SUNEK: Buka limit socket container sedalam mungkin
ulimit -n 65535 2>/dev/null
ulimit -s unlimited 2>/dev/null

# =================================================================
# 🚀 ULTRA TURBO KERNEL TWEAKS (Pindahan dari Contoh ke SC Kita) 🚀
# =================================================================
echo "[*] Mengoptimalkan antrean socket & pembersihan TIME_WAIT..."
sysctl -w net.ipv4.tcp_tw_reuse=1 2>/dev/null
sysctl -w net.ipv4.tcp_fin_timeout=15 2>/dev/null
sysctl -w net.core.default_qdisc=fq 2>/dev/null
sysctl -w net.ipv4.tcp_congestion_control=bbr 2>/dev/null

echo "[*] Mengatur ukuran buffer raksasa agar tidak tersedak..."
sysctl -w net.ipv4.tcp_rmem="4096 8388608 16777216" 2>/dev/null
sysctl -w net.ipv4.tcp_wmem="4096 8388608 16777216" 2>/dev/null
sysctl -w net.core.rmem_max=16777216 2>/dev/null
sysctl -w net.core.wmem_max=16777216 2>/dev/null
sysctl -w net.core.netdev_max_backlog=50000 2>/dev/null
sysctl -w net.ipv4.tcp_max_syn_backlog=8192 2>/dev/null
# =================================================================

USER_NAME="${SSH_USER:-dd}"
USER_PASS="${SSH_PASSWORD:-dd}"
SSL_INTERNAL_PORT="2443"

echo "[*] Mengonfigurasi User SSH Dropbear..."
if ! id "$USER_NAME" &>/dev/null; then
    useradd -m -s /bin/bash "$USER_NAME"
    echo "$USER_NAME ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
fi
echo "$USER_NAME:$USER_PASS" | chpasswd

echo "[*] Membuat Sertifikat SSL Stunnel..."
mkdir -p /etc/stunnel /var/run/stunnel4
openssl req -new -newkey rsa:2048 -days 365 -nodes -x509 \
    -subj "/C=ID/ST=Jakarta/L=Jakarta/O=RailwaySSH/CN=localhost" \
    -keyout /etc/stunnel/stunnel.pem -out /etc/stunnel/stunnel.pem
chmod 600 /etc/stunnel/stunnel.pem

echo "[*] Memulai Dropbear di Port Lokal 22..."
/usr/sbin/dropbear -p 127.0.0.1:22 -W 65536

echo "[*] Mengonfigurasi & Memulai Stunnel di Port 2443..."
cat <<EOF > /etc/stunnel/stunnel.conf
pid = /var/run/stunnel4/stunnel.pid
foreground = no
debug = 4

[ssh-ssl]
accept = 127.0.0.1:$SSL_INTERNAL_PORT
connect = 127.0.0.1:22
cert = /etc/stunnel/stunnel.pem
EOF

# Pastikan pid directory bersih sebelum start
rm -f /var/run/stunnel4/stunnel.pid 2>/dev/null
stunnel4 /etc/stunnel/stunnel.conf

echo "[*] Memulai WS-Proxy untuk SSH Dropbear di Port Lokal 8880..."
export WS_PORT="8880"
node ws-proxy.js &

# 🔥 JALANKAN BADVPN UDPGW UNTUK GAME MODE (PORT GLOBAL 0.0.0.0)
if [ -f /usr/local/bin/badvpn-udpgw ]; then
    echo "[*] Memulai BadVPN udpgw hasil compile di Port Global 7300 (Game Mode)..."
    /usr/local/bin/badvpn-udpgw --listen-addr 0.0.0.0:7300 --max-clients 500 --max-connections-for-client 20 &
fi

# 🔥 LOGIKA ADAPTIF PORT TUNNEL: Default ke 8880 jika variabel env ARGO_PORT tidak diisi
TARGET_ZT_PORT="${ARGO_PORT:-8880}"

# Inisialisasi awal variabel D
D="Menghubungkan Domain..."

# Eksekusi Cloudflare Zero Trust Khusus untuk Port Kustom (Variabel Token TOKEN)
if [ -n "$TOKEN" ]; then
    echo "[*] Menghubungkan Terowongan SSH Zero Trust ke Port ${TARGET_ZT_PORT}..."
    /usr/local/bin/cloudflared tunnel run --protocol http2 --no-tls-verify --token "$TOKEN" --url "http://localhost:${TARGET_ZT_PORT}" > /tmp/named_tunnel.log 2>&1 &
    
    # 🔍 LOOPING CERDAS: Menunggu log cloudflared sampai domain spesifik port target muncul
    echo "[*] Menyadap log untuk menarik domain Zero Trust port ${TARGET_ZT_PORT}..."
    for i in {1..15}; do
        if [ -f /tmp/named_tunnel.log ]; then
            # Ekstraksi domain spesifik port target menggunakan python kecil di bash
            EXTRACTED_DOMAIN=$(python3 -c '
import re
try:
    with open("/tmp/named_tunnel.log", "r") as f:
        content = f.read()
        matches = re.findall(r"\"hostname\":\"([^\"]+)\"[^}]*?localhost:'"${TARGET_ZT_PORT}"'\"|localhost:'"${TARGET_ZT_PORT}"'\"[^}]*?\"hostname\":\"([^\"]+)\"", content)
        if matches:
            for m in matches:
                domain = m[0] or m[1]
                if domain:
                    print(domain)
                    break
except Exception as e:
    pass
            ' 2>/dev/null)

            if [ -n "$EXTRACTED_DOMAIN" ]; then
                D="$EXTRACTED_DOMAIN"
                echo "[🔥 SUKSES] Domain Zero Trust untuk Port ${TARGET_ZT_PORT} Tertangkap: $D"
                break
            fi
        fi
        sleep 1
    done
else
    echo "[!] Variabel TOKEN kosong! Terowongan SSH Zero Trust tidak dapat dijalankan."
    D="Token Kosong"
fi

# 📤 EKSPOR VARIABEL D AGAR BISA DIBACA OLEH server.js ATAU NODE.JS
export D

sleep 2

# 🔥 MASUKKAN MUX JAVASCRIPT: Menjalankan penyaring proxy di port 8881
echo "[*] Memulai Multiplexer Jaringan via Mux.js di Port 8881..."
node mux.js &

sleep 2

echo "[*] Menjalankan Server Utama UI & Gateway Vmess via Server.js..."
exec node server.js
