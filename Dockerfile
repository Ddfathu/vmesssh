# =================================================================
# STAGE 1: BUILDER (Logika Sukses Kompilasi BadVPN dari Contoh)
# =================================================================
FROM ubuntu:22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    cmake \
    make \
    gcc \
    g++ \
    curl \
    tar \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src

# Download dan compile badvpn-udpgw langsung dari release resmi github
RUN curl -fsSL https://github.com/ambrop72/badvpn/archive/refs/tags/1.999.130.tar.gz | tar -xz \
    && cd badvpn-1.999.130 \
    && mkdir build && cd build \
    && cmake .. -DBUILD_NOTHING_BY_DEFAULT=1 -DBUILD_UDPGW=1 \
    && make badvpn-udpgw

# =================================================================
# STAGE 2: RUNTIME (Pondasi Utama SC Asli Lu yang Sudah Konek)
# =================================================================
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js, Dropbear, Stunnel, OpenSSL, dan tools pendukung asli
RUN apt-get update && apt-get install -y \
    curl \
    dropbear \
    stunnel4 \
    openssl \
    ca-certificates \
    sudo \
    procps \
    net-tools \
    bash \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Unduh utilitas Cloudflared Resmi untuk Terowongan Zero Trust
RUN curl -fsSL -o /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
    && chmod +x /usr/local/bin/cloudflared

# 🔥 PENERAPAN LOGIKA: Salin binary udpgw yang SUKSES dari stage builder ke target sistem
COPY --from=builder /src/badvpn-1.999.130/build/udpgw/badvpn-udpgw /usr/local/bin/badvpn-udpgw
RUN chmod +x /usr/local/bin/badvpn-udpgw

# Atur Direktori Kerja Container
WORKDIR /app

# Salin package.json dan Pasang Modul Dependensi NPM bawaan lu
COPY package.json ./
RUN npm install --omit=dev || npm install

# Salin Seluruh Berkas Script Proyek (server.js, start.sh, dll) ke Container
COPY . .

# Berikan Hak Izin Eksekusi Skrip start.sh
RUN chmod +x start.sh

# Trigger Utama Saat Container Aktif
CMD ["./start.sh"]
