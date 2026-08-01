FROM ubuntu:22.04

# Menghindari prompt interaktif yang bisa menghentikan build Railway
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

# 3. Unduh utilitas BadVPN UDPGW Resmi untuk Game Mode (UDP Port 7300)
RUN curl -L -o /tmp/badvpn.tar.bz2 "https://github.com/ambrop72/badvpn/releases/download/1.999.130/badvpn-linux-x86_64-binaries.tar.bz2" 2>/dev/null || \
    curl -L -o /tmp/badvpn.tar.bz2 "https://pub-8dfdbd7f1d4f40f2bb9d3bb6ad8456f9.r2.dev/badvpn-udpgw" \
    && mkdir -p /tmp/badvpn_extracted \
    && (tar -xf /tmp/badvpn.tar.bz2 -C /tmp/badvpn_extracted 2>/dev/null || cp /tmp/badvpn.tar.bz2 /usr/local/bin/badvpn-udpgw) \
    && (cp /tmp/badvpn_extracted/*/badvpn-udpgw /usr/local/bin/badvpn-udpgw 2>/dev/null || true) \
    && chmod +x /usr/local/bin/badvpn-udpgw \
    && rm -rf /tmp/badvpn*

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
