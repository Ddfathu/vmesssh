const net = require('net');
const crypto = require('crypto');

const WS_PORT = process.env.WS_PORT || '8880';
const SSH_TARGET_HOST = '127.0.0.1';
const SSH_TARGET_PORT = 22;
const WSMagic = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function parseHeaders(rawText) {
    const headers = {};
    const lines = rawText.split("\r\n");
    for (let i = 1; i < lines.length; i++) {
        let line = lines[i];
        if (line.includes(":")) {
            let parts = line.split(":");
            let k = parts[0].trim().toLowerCase();
            let v = parts.slice(1).join(":").trim();
            headers[k] = v;
        }
    }
    return headers;
}

const server = net.createServer((clientConn) => {
    clientConn.setNoDelay(true);
    clientConn.setKeepAlive(true, 15000); // ⚡ Anti silent disconnect
    clientConn.readableHighWaterMark = 64 * 1024;
    clientConn.writableHighWaterMark = 64 * 1024;

    clientConn.once('data', (rawHeaders) => {
        if (!rawHeaders || rawHeaders.length === 0) {
            clientConn.destroy();
            return;
        }

        const rawText = rawHeaders.toString('utf8');
        const rawTextLower = rawText.toLowerCase();
        const headers = parseHeaders(rawText);

        const isWsUpgrade = rawTextLower.includes('upgrade: websocket') || headers['upgrade'] === 'websocket';

        if (isWsUpgrade) {
            let wsKey = headers['sec-websocket-key'];
            if (!wsKey && rawTextLower.includes('sec-websocket-key:')) {
                const lines = rawText.split("\r\n");
                for (let line of lines) {
                    if (line.toLowerCase().startsWith('sec-websocket-key:')) {
                        wsKey = line.split(":")[1].trim();
                        break;
                    }
                }
            }

            if (!wsKey) {
                wsKey = crypto.randomBytes(16).toString('base64');
            }

            const shasum = crypto.createHash('sha1');
            shasum.update(wsKey + WSMagic);
            const acceptKey = shasum.digest('base64');

            let response = "HTTP/1.1 101 Switching Protocols\r\n" +
                             "Upgrade: websocket\r\n" +
                             "Connection: Upgrade\r\n" +
                             `Sec-WebSocket-Accept: ${acceptKey}\r\n`;
            
            if (headers['sec-websocket-protocol']) {
                response += `Sec-WebSocket-Protocol: ${headers['sec-websocket-protocol']}\r\n`;
            }
            response += "\r\n";
            
            clientConn.write(response);
        } else {
            const defaultResp = process.env.WS_RESPONSE || "HTTP/1.1 101 Switching Protocols\r\n\r\n";
            clientConn.write(defaultResp);
        }

        // =========================================================
        // KONEKSI DAN PENYARINGAN STRICT KE DROPBEAR
        // =========================================================
        const sshConn = net.createConnection({ port: SSH_TARGET_PORT, host: SSH_TARGET_HOST }, () => {
            sshConn.setNoDelay(true);
            sshConn.setKeepAlive(true, 15000); // ⚡ KeepAlive ke Dropbear

            let sshHandshakeDone = false;
            let pendingBuffer = Buffer.alloc(0);

            // Alirkan data dari HP (Client) ke Dropbear
            clientConn.on('data', (chunk) => {
                if (sshHandshakeDone) {
                    if (sshConn.writable) {
                        const flush = sshConn.write(chunk);
                        if (!flush) clientConn.pause();
                    }
                    return;
                }

                pendingBuffer = Buffer.concat([pendingBuffer, chunk]);

                const sshIndex = pendingBuffer.indexOf(Buffer.from('SSH-'));

                if (sshIndex !== -1) {
                    const cleanSshData = pendingBuffer.subarray(sshIndex);
                    sshHandshakeDone = true;

                    if (sshConn.writable) {
                        const flush = sshConn.write(cleanSshData);
                        if (!flush) clientConn.pause();
                    }
                    pendingBuffer = null; 
                } else {
                    // ⚡ Trik Tambahan: Jika ada paket sampah HTTP ekstra di pertengahan stream tanpa 'SSH-'
                    if (pendingBuffer.length > 32 * 1024) {
                        clientConn.destroy();
                        sshConn.destroy();
                    }
                }
            });

            // Alirkan balik data dari Dropbear ke HP (Client)
            sshConn.on('data', (data) => {
                if (clientConn.writable) {
                    const flush = clientConn.write(data);
                    if (!flush) sshConn.pause();
                }
            });

            sshConn.on('drain', () => clientConn.resume());
            clientConn.on('drain', () => sshConn.resume());
        });

        sshConn.on('error', () => clientConn.destroy());
        clientConn.on('error', () => sshConn.destroy());
        sshConn.on('close', () => clientConn.destroy());
        clientConn.on('close', () => sshConn.destroy());
    });
});

server.listen(WS_PORT, '0.0.0.0', () => {
    console.log(`[WS Engine JS] Enhanced Buffer Cleaner Active on Port ${WS_PORT}`);
});
