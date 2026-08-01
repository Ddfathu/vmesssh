#!/bin/bash
ulimit -n 65535 2>/dev/null

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
stunnel4 /etc/stunnel/stunnel.conf

echo "[*] Memulai WS-Proxy untuk SSH Dropbear di Port Lokal 8880..."
export WS_PORT="8880"
node ws-proxy.js &

# 🔥 FIX MURNI BADVPN UDPGW (ANTI GAGAL GAME MODE) 🔥
if [ -f /usr/local/bin/badvpn-udpgw ]; then
    echo "[*] Memulai BadVPN udpgw di /usr/local/bin (Port 7300)..."
    /usr/local/bin/badvpn-udpgw --listen-addr 127.0.0.1:7300 --max-clients 500 --max-connections-for-client 20 &
elif [ -f ./badvpn-udpgw ]; then
    echo "[*] Memulai BadVPN udpgw di direktori lokal (Port 7300)..."
    chmod +x ./badvpn-udpgw
    ./badvpn-udpgw --listen-addr 127.0.0.1:7300 --max-clients 500 --max-connections-for-client 20 &
else
    echo "[!] Mengeksekusi BadVPN via perintah global sistem..."
    badvpn-udpgw --listen-addr 127.0.0.1:7300 --max-clients 500 --max-connections-for-client 20 &>/dev/null &
fi

# 🔥 Eksekusi Cloudflare Zero Trust Khusus untuk Port SSH 8880
if [ -n "$ARGO_AUTH" ]; then
    echo "[*] Menghubungkan Terowongan SSH Zero Trust ke Port 8880..."
    /usr/local/bin/cloudflared tunnel run --protocol http2 --no-tls-verify --token "$ARGO_AUTH" > /tmp/named_tunnel.log 2>&1 &
else
    echo "[!] Variabel ARGO_AUTH kosong! Terowongan SSH Zero Trust tidak dapat dijalankan."
fi

sleep 2

echo "[*] Menjalankan Server Utama UI & Gateway Vmess di Port Publik Railway..."
exec node server.js
