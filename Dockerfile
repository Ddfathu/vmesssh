FROM ubuntu:22.04

# Menghindari prompt interaktif saat build Railway
ENV DEBIAN_FRONTEND=noninteractive

# 1. Update & Pasang Paket Dasar Sistem, Dropbear, Stunnel, OpenSSL, Sudo, dan Node.js 20
RUN apt-get update && apt-get install -y \
    curl \
    dropbear \
    stunnel4 \
    openssl \
    ca-certificates \
    sudo \
    procps \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 2. Unduh utilitas Cloudflared Resmi Sistem untuk Terowongan Zero Trust (Port 8880)
RUN curl -fsSL -o /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
    && chmod +x /usr/local/bin/cloudflared

# 3. 🔥 FIX BADVPN LINK: Unduh static binary badvpn-udpgw AMD64 yang valid langsung ke bin
RUN curl -L -o /usr/local/bin/badvpn-udpgw "https://github.com/dedefathu/places/raw/main/badvpn-udpgw" || \
    curl -L -o /usr/local/bin/badvpn-udpgw "https://github.com/PANEL-TUNNELING/badvpn-udpgw/raw/main/badvpn-udpgw" \
    && chmod +x /usr/local/bin/badvpn-udpgw

# 4. Atur Direktori Kerja Container
WORKDIR /app

# 5. Salin package.json dan Pasang Modul Dependensi NPM
COPY package.json ./
RUN npm install --omit=dev || npm install

# 6. Salin Seluruh Berkas Script Proyek ke Container
COPY . .

# 7. Berikan Hak Izin Eksekusi Skrip start.sh
RUN chmod +x start.sh

# 8. Trigger Utama Saat Container Aktif
CMD ["./start.sh"]
