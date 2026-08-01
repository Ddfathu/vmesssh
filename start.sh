#!/bin/bash
ulimit -n 65535 2>/dev/null

USER_NAME="${SSH_USER:-ddfathu}"
USER_PASS="${SSH_PASSWORD:-admin123}"
SSL_INTERNAL_PORT="2443"
PUBLIC_PORT="${PORT:-8080}"

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
stunnel4 /etc/stunnel/stunnel.conf

echo "[*] Memulai WS-Proxy untuk SSH Dropbear di Port Lokal 8880..."
export WS_PORT="8880"
node ws-proxy.js &

# Memulai BadVPN UDPGW di port 7300 untuk Game Mode
if [ -f /usr/local/bin/badvpn-udpgw ]; then
    echo "[*] Memulai BadVPN udpgw di Port Lokal 7300 (Game Mode)..."
    /usr/local/bin/badvpn-udpgw --listen-addr 127.0.0.1:7300 --max-clients 500 --max-connections-for-client 20 &
fi

# Eksekusi Cloudflare Zero Trust Khusus untuk Port SSH 8880
if [ -n "$ARGO_AUTH" ]; then
    echo "[*] Menghubungkan Terowongan SSH Zero Trust ke Port 8880..."
    /usr/local/bin/cloudflared tunnel run --protocol http2 --no-tls-verify --token "$ARGO_AUTH" > /tmp/named_tunnel.log 2>&1 &
fi

# 🔥 SEKARANG HADIR KEMBALI: LOOP SUPPLIER DATA UNTUK UI PANEL 🔥
(
    while true; do
        CPU_MODEL=$(lscpu | grep 'Model name' | cut -d':' -f2 | sed -e 's/^[ \t]*//')
        [ -z "$CPU_MODEL" ] && CPU_MODEL=$(grep -m1 'model name' /proc/procinfo 2>/dev/null | cut -d':' -f2 | sed -e 's/^[ \t]*//')
        [ -z "$CPU_MODEL" ] && CPU_MODEL="Railway Virtual CPU"

        RAM_TOTAL=$(free -h | awk '/Mem:/ {print $2}')
        RAM_USED=$(free -h | awk '/Mem:/ {print $3}')
        DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}')
        UPTIME=$(uptime -p | sed 's/up //')
        
        COUNT_ONLINE=$(cat /proc/net/tcp 2>/dev/null | grep -i '0100007F:0016' | wc -l)
        
        USER_DETAILS_LIST=""
        if [ "$COUNT_ONLINE" -gt 0 ]; then
            RAW_USER_LIST=$(cat /etc/passwd | awk -F: '$3>=1000 {print $1}' | grep -v -E 'nobody|ubuntu')
            for u in $RAW_USER_LIST; do
                if ps aux | grep -i "$u" | grep -v grep &>/dev/null; then
                    USER_DETAILS_LIST="${USER_DETAILS_LIST}👤 User Active: ${u}\\n"
                fi
            done
        fi

        if [ -z "$USER_DETAILS_LIST" ] || [ "$COUNT_ONLINE" -eq 0 ]; then
            USER_DETAILS_LIST="Semua user offline"
            SSH_ONLINE="0 Users"
        else
            SSH_ONLINE="${COUNT_ONLINE} Users"
        fi

        # Cek Railway TCP Proxy bawaan dashboard
        RLWY_PROXY=""
        if [ -n "$RAILWAY_TCP_PROXY_DOMAIN" ] && [ -n "$RAILWAY_TCP_PROXY_PORT" ]; then
            RLWY_PROXY="${RAILWAY_TCP_PROXY_DOMAIN}:${RAILWAY_TCP_PROXY_PORT}"
        fi

        cat <<EOF > /tmp/server_stats.json
{
  "cpu_model": "$CPU_MODEL",
  "ram_total": "$RAM_TOTAL",
  "ram_used": "$RAM_USED",
  "disk_usage": "$DISK_USAGE",
  "uptime": "$UPTIME",
  "ssh_online": "👥 $SSH_ONLINE Active",
  "user_list_details": "$USER_DETAILS_LIST",
  "railway_proxy": "$RLWY_PROXY"
}
EOF
        sleep 2
    done
) &

sleep 2

echo "[*] Menjalankan Server Utama UI & Gateway Vmess di Port Publik Railway..."
exec node server.js
