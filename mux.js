const net = require('net');

const PUBLIC_PORT = 8881; 
const SSL_TARGET = parseInt(process.env.SSL_TARGET_PORT || '2443');
const WS_TARGET = parseInt(process.env.WS_TARGET_PORT || '8880');
const SSH_TARGET = 22;

const server = net.createServer((clientConn) => {
    clientConn.setNoDelay(true);
    clientConn.readableHighWaterMark = 64 * 1024;
    clientConn.writableHighWaterMark = 64 * 1024;

    let backendConn = null;
    let isConnected = false;
    const earlyBuffer = [];

    const handleInitialData = (buffer) => {
        if (!buffer || buffer.length === 0) return;

        // Lepas listener awal
        clientConn.removeListener('data', handleInitialData);

        // 1. Deteksi Protokol
        let targetPort = WS_TARGET;
        if (buffer[0] === 0x16) {
            targetPort = SSL_TARGET;
        } else if (buffer.toString('utf8', 0, 4) === 'SSH-') {
            targetPort = SSH_TARGET;
        }

        // 2. Buat Koneksi ke Backend Target
        backendConn = net.createConnection({ port: targetPort, host: '127.0.0.1' }, () => {
            isConnected = true;
            backendConn.setNoDelay(true);

            // Kirim buffer identifikasi awal
            backendConn.write(buffer);

            // Flushing sisa data yang sempat masuk saat proses penyiapan koneksi
            while (earlyBuffer.length > 0) {
                const chunk = earlyBuffer.shift();
                backendConn.write(chunk);
            }
        });

        // 3. Pasang Listener Data Segera (Cegah Paket Hilang)
        clientConn.on('data', (data) => {
            if (isConnected && backendConn && backendConn.writable) {
                const flush = backendConn.write(data);
                if (!flush) clientConn.pause(); // Anti-choking
            } else {
                earlyBuffer.push(data); // Simpan sementara jika backend belum beres handshake
            }
        });

        backendConn.on('data', (data) => {
            if (clientConn.writable) {
                const flush = clientConn.write(data);
                if (!flush) backendConn.pause(); // Anti-choking
            }
        });

        // Event Drain untuk Melepas Pause Flow
        backendConn.on('drain', () => clientConn.resume());
        clientConn.on('drain', () => backendConn.resume());

        // Handling Error & Cleanup
        backendConn.on('error', () => clientConn.destroy());
        clientConn.on('error', () => backendConn ? backendConn.destroy() : null);
        backendConn.on('close', () => clientConn.destroy());
        clientConn.on('close', () => backendConn ? backendConn.destroy() : null);
    };

    clientConn.on('data', handleInitialData);
});

server.listen(PUBLIC_PORT, '0.0.0.0', () => {
    console.log(`[Mux JS] High Performance Stream Mux Active on Port ${PUBLIC_PORT}`);
});
