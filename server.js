#!/usr/bin/env node

const http = require("http");
const url = require("url");
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const crypto = require('crypto');
const { promisify } = require('util');
const execPromise = promisify(require('child_process').exec);
const { exec, execSync } = require('child_process');

// ========================================================
// VARIABEL KONFIGURASI GLOBAL
// ========================================================
const UPLOAD_URL = process.env.UPLOAD_URL || '';      
const PROJECT_URL = process.env.PROJECT_URL || '';    
const AUTO_ACCESS = process.env.AUTO_ACCESS || false; 
const FILE_PATH = process.env.FILE_PATH || '.tmp';   
const SUB_PATH = process.env.SUB_PATH || 'sub';       

const PORT = 8081; 

const UUID = process.env.UUID || '1f37ac4f-fdd0-49df-9406-1eda70a1d512'; 

const ARGO_PORT = 8001;            

const CFPORT = process.env.CFPORT || 443;                  
const NAME = process.env.NAME || 'ddfathu';                        

const LOG_PATH = path.join(FILE_PATH, "boot.log"); 
const ZT_LOG_PATH = "/tmp/named_tunnel.log";
const ZT_SINGLE_TOKEN_FILE = "/tmp/zt_single_token.txt";
const CFIP_FILE = "/tmp/cfip.txt";
const NET_SETTING_FILE = "/tmp/net_settings.json";
const WS_PROXY_CONFIG_FILE = "/tmp/ws_proxy_config.json";
const SYSTEM_CONFIG_FILE = "/tmp/system_config.json";

const ADMIN_PASS_FILE = "/tmp/admin_pass.txt";
const STATS_PATH = "/tmp/server_stats.json";
const DB_PATH = "/tmp/ssh_details.json";

let cachedDiskUsage = "38%";
let cachedSshOnline = "0 User";
let cachedUserListDetails = "Semua user offline";

if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH);
}

// ========================================================
// HELPER NETWORK, WS-PROXY & SYSTEM CONFIG
// ========================================================
function getNetworkSettings() {
    try {
        if (fs.existsSync(NET_SETTING_FILE)) {
            return JSON.parse(fs.readFileSync(NET_SETTING_FILE, 'utf8'));
        }
    } catch(e) {}
    return { dns_type: "udp", custom_dns: "8.8.8.8", engine: "ws" };
}

function saveNetworkSettings(dns_type, custom_dns, engine) {
    try {
        fs.writeFileSync(NET_SETTING_FILE, JSON.stringify({ dns_type, custom_dns, engine }, null, 2));
    } catch(e) {}
}

function getWsProxyConfig() {
    try {
        if (fs.existsSync(WS_PROXY_CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(WS_PROXY_CONFIG_FILE, 'utf8'));
        }
    } catch (e) {}
    return { sshPort: 22, keepAlive: 15000, maxBuffer: 32768 };
}

function saveWsProxyConfig(sshPort, keepAlive, maxBuffer) {
    try {
        const data = {
            sshPort: parseInt(sshPort) || 22,
            keepAlive: parseInt(keepAlive) || 15000,
            maxBuffer: parseInt(maxBuffer) || 32768
        };
        fs.writeFileSync(WS_PROXY_CONFIG_FILE, JSON.stringify(data, null, 2));
    } catch(e) {}
}

function getSystemSettings() {
    try {
        if (fs.existsSync(SYSTEM_CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(SYSTEM_CONFIG_FILE, 'utf8'));
        }
    } catch(e) {}
    return { banner: "", enable_bbr: "true", udpgw_port: "7300", udpgw_max_clients: "1000" };
}

function saveSystemSettings(banner, enable_bbr, udpgw_port, udpgw_max_clients) {
    try {
        const data = {
            banner: banner || "",
            enable_bbr: enable_bbr || "true",
            udpgw_port: udpgw_port || "7300",
            udpgw_max_clients: udpgw_max_clients || "1000"
        };
        fs.writeFileSync(SYSTEM_CONFIG_FILE, JSON.stringify(data, null, 2));
    } catch(e) {}
}

function getActiveCfip() {
    try {
        if (fs.existsSync(CFIP_FILE)) {
            const savedIp = fs.readFileSync(CFIP_FILE, 'utf8').trim();
            if (savedIp) return savedIp;
        }
    } catch(e) {}
    return process.env.CFIP || '104.17.3.81';
}

function getAdminPassword() {
    try {
        if (fs.existsSync(ADMIN_PASS_FILE)) {
            return fs.readFileSync(ADMIN_PASS_FILE, 'utf8').trim();
        }
    } catch (e) {}
    return process.env.ADMIN_PASSWORD || null;
}

function verifyAdminPassword(passInput) {
    const currentPass = getAdminPassword();
    if (!currentPass) return false;
    return currentPass === passInput;
}

function generateRandomName() {
  const characters = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

let subContent = null;
const webName = generateRandomName();
const botName = generateRandomName();
let webPath = path.join(FILE_PATH, webName);
let botPath = path.join(FILE_PATH, botName);
let subPath = path.join(FILE_PATH, 'sub.txt');

function loadDb() {
    if (fs.existsSync(DB_PATH)) {
        try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch (e) { return {}; }
    }
    return {};
}
function saveDb(data) {
    try { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); } catch (e) {}
}

let currentActiveDomain = '';

function restartSingleTunnel(newToken) {
    exec("pkill -9 -f 'cloudflared'", () => {
        setTimeout(() => {
            if (newToken && newToken.trim()) {
                fs.writeFileSync(ZT_SINGLE_TOKEN_FILE, newToken.trim());
                exec(`nohup ${botPath} tunnel run --protocol http2 --no-tls-verify --token "${newToken.trim()}" > ${ZT_LOG_PATH} 2>&1 &`);
            } else {
                if (fs.existsSync(ZT_SINGLE_TOKEN_FILE)) fs.unlinkSync(ZT_SINGLE_TOKEN_FILE);
                if (fs.existsSync(ZT_LOG_PATH)) fs.writeFileSync(ZT_LOG_PATH, "Token Dihapus.");
                let args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${LOG_PATH} --loglevel info --url http://localhost:${ARGO_PORT}`;
                exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`);
            }
        }, 1000);
    });
}

function getDomainsByPort(targetPorts) {
    const domains = [];
    try {
        if (fs.existsSync(ZT_LOG_PATH)) {
            const logContent = fs.readFileSync(ZT_LOG_PATH, 'utf8');
            const portRegexStr = targetPorts.join('|');

            const regexIngress = new RegExp(`(?:\\\\?"|")hostname(?:\\\\?"|")\\s*:\\s*(?:\\\\?"|")([^"\\\\]+)(?:\\\\?"|")[^}]*?localhost:(${portRegexStr})`, 'g');
            let match;
            
            while ((match = regexIngress.exec(logContent)) !== null) {
                const domainName = match[1].trim();
                const portNum = match[2];
                if (!domains.some(d => d.domain === domainName)) {
                    domains.push({ domain: domainName, port: portNum });
                }
            }

            if (domains.length === 0) {
                const regexIngressReverse = new RegExp(`localhost:(${portRegexStr})[^}]*?(?:\\\\?"|")hostname(?:\\\\?"|")\\s*:\\s*(?:\\\\?"|")([^"\\\\]+)(?:\\\\?"|")`, 'g');
                while ((match = regexIngressReverse.exec(logContent)) !== null) {
                    const portNum = match[1];
                    const domainName = match[2].trim();
                    if (!domains.some(d => d.domain === domainName)) {
                        domains.push({ domain: domainName, port: portNum });
                    }
                }
            }
        }
    } catch (e) {}

    return domains;
}

function getCurrentHosts() {
    let hwInfo = {};
    if (fs.existsSync(STATS_PATH)) {
        try { hwInfo = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8')); } catch (e) {}
    }
    const ztDomains = getDomainsByPort(['8880', '8881']);
    const namedUrl = ztDomains.length > 0 ? ztDomains[0].domain : (process.env.D || "");
    let quickUrl = currentActiveDomain || "Menunggu Quick Tunnel...";
    
    let hostOutput = "";
    if (namedUrl && !namedUrl.includes("Menghubungkan")) hostOutput += `${namedUrl.replace(/https?:\/\//, '')} (SSH WS)`;
    
    if (process.env.RAILWAY_TCP_PROXY_DOMAIN && process.env.RAILWAY_TCP_PROXY_PORT) {
        const autoTcp = `${process.env.RAILWAY_TCP_PROXY_DOMAIN}:${process.env.RAILWAY_TCP_PROXY_PORT}`;
        hostOutput += hostOutput ? ` dan ini (SSH SNI) ${autoTcp}` : `${autoTcp}`;
    } else if (process.env.SNI) {
        hostOutput += hostOutput ? ` dan ${process.env.SNI.replace(/https?:\/\//, '')}` : `${process.env.SNI.replace(/https?:\/\//, '')}`;
    } else if (hwInfo.railway_proxy && hwInfo.railway_proxy.trim() !== "") {
        hostOutput += hostOutput ? ` dan ${hwInfo.railway_proxy}` : `${hwInfo.railway_proxy}`;
    }
    
    if (!hostOutput) hostOutput = quickUrl.replace(/https?:\/\//, '');
    return hostOutput;
}

function listSsh() {
    try {
        const users = [];
        const dbInfo = loadDb();
        const passwdContent = fs.readFileSync('/etc/passwd', 'utf8');
        const lines = passwdContent.split('\n');
        
        for (let line of lines) {
            if (!line.trim()) continue;
            const parts = line.split(':');
            const username = parts[0];
            const uid = parseInt(parts[2], 10);
            const shell = parts[parts.length - 1];
            
            if (uid >= 1000 && !["nobody", "ubuntu", "sshd", "dropbear", "stunnel"].includes(username)) {
                const extra = dbInfo[username] || { password: "-", ip: "Unknown", user_agent: "Unknown" };
                users.push({ username, uid, shell, ...extra });
            }
        }
        return { status: "success", total: users.length, users: users };
    } catch (e) {
        return { status: "error", message: e.message };
    }
}

function addSsh(username, password, ipAddr, userAgent) {
    if (!username || !password) return { status: "error", message: "Username dan password wajib diisi!" };
    if (!/^[a-zA-Z0-9_-]+$/.test(username) || !/^[a-zA-Z0-9_@.-]+$/.test(password)) {
        return { status: "error", message: "Username/Password mengandung karakter ilegal!" };
    }
    try {
        execSync(`useradd -m -s /bin/bash ${username}`);
        execSync(`echo '${username}:${password}' | chpasswd`);
        
        const dbInfo = loadDb();
        dbInfo[username] = { password, ip: ipAddr, user_agent: userAgent };
        saveDb(dbInfo);
        
        const activeHost = getCurrentHosts();
        const accountDetails = 
            `================================\n` +
            ` ⚡ PREMIUM SSH ACCOUNT CREATED ⚡\n` +
            `================================\n` +
            `🔹 Host SSH  : ${activeHost}\n` +
            `🔹 Port TLS  : 443\n` +
            `🔹 Port NTLS : 80\n` +
            `🔹 Username  : ${username}\n` +
            `🔹 Password  : ${password}\n` +
            `================================\n` +
            ` powered by : d e d e f a t h u\n` +
            `================================`;
        return { status: "success", message: accountDetails };
    } catch (e) {
        return { status: "error", message: `Gagal membuat user. Username mungkin sudah terpakai.` };
    }
}

function deleteSsh(username) {
    if (!username || !/^[a-zA-Z0-9_-]+$/.test(username)) return { status: "error", message: "Username ilegal!" };
    try {
        execSync(`userdel -r ${username}`);
        const dbInfo = loadDb();
        if (dbInfo[username]) {
            delete dbInfo[username];
            saveDb(dbInfo);
        }
        return { status: "success", message: `User ${username} berhasil dihapus!` };
    } catch (e) {
        return { status: "error", message: `Gagal menghapus user.` };
    }
}

function readPathsFromFile(filename, defaultPath) { try { if (fs.existsSync(filename)) { const content = fs.readFileSync(filename, 'utf-8'); const paths = content.split('\n').map(p => p.trim()).filter(p => p.startsWith('/')); if (paths.length > 0) return paths; } } catch (e) {} return [defaultPath]; }

async function generateConfig() {
  const netSettings = getNetworkSettings();
  const vlessPaths = readPathsFromFile('pathvless.txt', '/vless-argo');
  const vmessPaths = readPathsFromFile('pathvmess.txt', '/vmess-argo');
  const trojanPaths = readPathsFromFile('pathtrojan.txt', '/trojan-argo');
  
  const fallbacksList = [];
  const inboundsList = [];
  let nextPort = 3100;

  const engine = netSettings.engine || 'ws';

  let streamSettingsObj = {};
  if (engine === 'grpc') {
    streamSettingsObj = { network: "grpc", security: "none", grpcSettings: { serviceName: "grpc-service" } };
  } else if (engine === 'h2') {
    streamSettingsObj = { network: "h2", security: "none", httpSettings: { path: "/h2-path", host: ["localhost"] } };
  } else if (engine === 'tcp') {
    streamSettingsObj = { network: "tcp", security: "none" };
  } else {
    streamSettingsObj = { network: "ws", security: "none" };
  }

  vlessPaths.forEach(p => { 
    const cp = nextPort++; 
    fallbacksList.push({ path: p, dest: cp }); 
    let st = JSON.parse(JSON.stringify(streamSettingsObj));
    if (engine === 'ws') st.wsSettings = { path: p };

    inboundsList.push({ 
        port: cp, listen: "127.0.0.1", protocol: 'vless', 
        settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" }, 
        streamSettings: st, 
        sniffing: { enabled: true, destOverride: ["http", "tls", "quic"] } 
    }); 
  });

  vmessPaths.forEach(p => { 
    const cp = nextPort++; 
    fallbacksList.push({ path: p, dest: cp }); 
    let st = JSON.parse(JSON.stringify(streamSettingsObj));
    if (engine === 'ws') st.wsSettings = { path: p };

    inboundsList.push({ 
        port: cp, listen: "127.0.0.1", protocol: "vmess", 
        settings: { clients: [{ id: UUID, alterId: 0 }] }, 
        streamSettings: st, 
        sniffing: { enabled: true, destOverride: ["http", "tls", "quic"] } 
    }); 
  });

  trojanPaths.forEach(p => { 
    const cp = nextPort++; 
    fallbacksList.push({ path: p, dest: cp }); 
    let st = JSON.parse(JSON.stringify(streamSettingsObj));
    if (engine === 'ws') st.wsSettings = { path: p };

    inboundsList.push({ 
        port: cp, listen: "127.0.0.1", protocol: "trojan", 
        settings: { clients: [{ password: UUID }] }, 
        streamSettings: st, 
        sniffing: { enabled: true, destOverride: ["http", "tls", "quic"] } 
    }); 
  });

  inboundsList.unshift({
    port: ARGO_PORT,
    protocol: 'vless',
    settings: { clients: [{ id: UUID }], decryption: 'none', fallbacks: fallbacksList },
    streamSettings: { network: 'tcp', security: 'none' },
    sniffing: { enabled: true, destOverride: ["http", "tls", "quic"] }
  });

  let dnsValue = (netSettings.custom_dns || "").trim();
  let dnsServers = [];

  if (netSettings.dns_type === 'doh') {
    if (!dnsValue.startsWith('http')) dnsValue = 'https://1.1.1.1/dns-query';
    dnsServers = [dnsValue, "8.8.8.8"];
  } else {
    if (!dnsValue || dnsValue.startsWith('http')) dnsValue = '8.8.8.8';
    dnsServers = [dnsValue, "1.1.1.1"];
  }

  const config = { 
    log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' }, 
    inbounds: inboundsList, 
    dns: { servers: dnsServers }, 
    outbounds: [{ protocol: "freedom", tag: "direct" }] 
  };
  
  fs.writeFileSync(path.join(FILE_PATH, 'config.json'), JSON.stringify(config, null, 2));
}

function getSystemArchitecture() { return os.arch().includes('arm') ? 'arm' : 'amd'; }
function downloadFile(fileName, fileUrl, callback) {
  if (!fs.existsSync(FILE_PATH)) fs.mkdirSync(FILE_PATH, { recursive: true });
  const writer = fs.createWriteStream(fileName);
  axios({ method: 'get', url: fileUrl, responseType: 'stream' }).then(response => {
    response.data.pipe(writer);
    writer.on('finish', () => { writer.close(); callback(null, fileName); });
    writer.on('error', err => { fs.unlink(fileName, () => {}); callback(err.message); });
  }).catch(err => callback(err.message));
}

async function downloadFilesAndRun() {
  const architecture = getSystemArchitecture();
  const filesToDownload = architecture === 'arm' ? 
    [{ fileName: webPath, fileUrl: "https://arm64.ssss.nyc.mn/web" }, { fileName: botPath, fileUrl: "https://arm64.ssss.nyc.mn/bot" }] :
    [{ fileName: webPath, fileUrl: "https://amd64.ssss.nyc.mn/web" }, { fileName: botPath, fileUrl: "https://amd64.ssss.nyc.mn/bot" }];

  for (let fileInfo of filesToDownload) {
    await new Promise((resolve, reject) => { downloadFile(fileInfo.fileName, fileInfo.fileUrl, (err) => err ? reject(err) : resolve()); });
  }
  fs.chmodSync(webPath, 0o775); fs.chmodSync(botPath, 0o775);

  exec(`nohup ${webPath} -c ${FILE_PATH}/config.json >/dev/null 2>&1 &`);
  
  if (fs.existsSync(ZT_SINGLE_TOKEN_FILE)) {
    const singleToken = fs.readFileSync(ZT_SINGLE_TOKEN_FILE, 'utf8').trim();
    if (singleToken) {
      restartSingleTunnel(singleToken);
    } else {
      let args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${LOG_PATH} --loglevel info --url http://localhost:${ARGO_PORT}`;
      exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`);
    }
  } else {
    let args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${LOG_PATH} --loglevel info --url http://localhost:${ARGO_PORT}`;
    exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`);
  }

  await new Promise(r => setTimeout(r, 5000));
}

async function extractDomains() {
  try {
    if(fs.existsSync(LOG_PATH)) {
      const logContent = fs.readFileSync(LOG_PATH, 'utf-8');
      const match = logContent.match(/https:\/\/([a-zA-Z0-9-]+\.trycloudflare\.com)/);
      if (match) { 
        currentActiveDomain = match[1]; 
        await generateLinks(currentActiveDomain); 
      }
    }
  } catch (e) {}
}

async function getMetaInfo() { try { const res = await axios.get('https://api.ip.sb/geoip'); return `${res.data.country_code}-${res.data.isp}`.replace(/\s+/g, '_'); } catch(e) { return 'RailwayServer'; } }
async function generateLinks(argoDomain) {
  const ISP = await getMetaInfo(); const nodeName = `${NAME}-${ISP}`;
  const activeCfip = getActiveCfip();
  const defaultVless = readPathsFromFile('pathvless.txt', '/vless-argo')[0];
  const defaultVmess = readPathsFromFile('pathvmess.txt', '/vmess-argo')[0];
  const defaultTrojan = readPathsFromFile('pathtrojan.txt', '/trojan-argo')[0];
  
  const VMESS = { v: '2', ps: `${nodeName}`, add: activeCfip, port: CFPORT, id: UUID, aid: '0', scy: 'auto', net: 'ws', type: 'none', host: argoDomain, path: `${defaultVmess}?ed=2560`, tls: 'tls', sni: argoDomain, alpn: '', fp: 'firefox' };
  const subTxt = `vless://${UUID}@${activeCfip}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=${encodeURIComponent(defaultVless + '?ed=2560')}#${nodeName}\n\nvmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}\n\ntrojan://${UUID}@${activeCfip}:${CFPORT}?security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=${encodeURIComponent(defaultTrojan + '?ed=2560')}#${nodeName}`;
  subContent = Buffer.from(subTxt).toString('base64');
  fs.writeFileSync(subPath, subContent);
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathName = parsedUrl.pathname;
    const query = parsedUrl.query;
    const ipAddr = req.headers['cf-connecting-ip'] || req.socket.remoteAddress || "Unknown IP";
    const userAgent = req.headers['user-agent'] || "Unknown UA";
    
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (pathName === `/${SUB_PATH}`) {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end(subContent || (fs.existsSync(subPath) ? fs.readFileSync(subPath, 'utf-8') : 'Loading sub...'));
    }

    if (pathName === '/__info') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const defaultVless = readPathsFromFile('pathvless.txt', '/vless-argo')[0];
        const defaultVmess = readPathsFromFile('pathvmess.txt', '/vmess-argo')[0];
        const defaultTrojan = readPathsFromFile('pathtrojan.txt', '/trojan-argo')[0];
        return res.end(JSON.stringify({ 
            uuid: UUID, 
            cfip: getActiveCfip(),
            domain: currentActiveDomain || "Menunggu Quick Tunnel...", 
            paths: { vless: defaultVless, vmess: defaultVmess, trojan: defaultTrojan } 
        }));
    }

    if (pathName === '/api/logtunnel') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end(fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, 'utf8') : "Log belum siap.");
    }

    if (pathName === '/api/lognamed') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        if (fs.existsSync(ZT_LOG_PATH)) {
            return res.end(fs.readFileSync(ZT_LOG_PATH, 'utf8'));
        } else {
            return res.end("Log Zero Trust belum terbuat atau file /tmp/named_tunnel.log tidak ditemukan.");
        }
    }

    if (pathName === '/api/setup-pass') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const newPass = query.pass ? query.pass.trim() : "";
        const oldPass = query.old_pass ? query.old_pass.trim() : "";
        const currentPass = getAdminPassword();

        if (currentPass) {
            if (oldPass !== currentPass) {
                return res.end(JSON.stringify({ status: "error", message: "Password Admin Lama Salah!" }));
            }
        }
        
        if (!newPass || newPass.length < 4) {
            return res.end(JSON.stringify({ status: "error", message: "Password minimal 4 karakter!" }));
        }

        fs.writeFileSync(ADMIN_PASS_FILE, newPass);
        return res.end(JSON.stringify({ status: "success", message: "Password Admin Berhasil Disimpan/Diubah!" }));
    }

    // 🔑 API ENDPOINT SET NETWORK & CUSTOM DNS
    if (pathName === '/api/set-network') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (!verifyAdminPassword(query.pass)) {
            return res.end(JSON.stringify({ status: "error", message: "Akses Ditolak! Anda harus Login Admin terlebih dahulu." }));
        }
        const dns_type = query.dns_type || "udp";
        const custom_dns = query.custom_dns ? decodeURIComponent(query.custom_dns) : "8.8.8.8";
        const engine = query.engine || "ws";
        
        saveNetworkSettings(dns_type, custom_dns, engine);
        await generateConfig();
        
        exec(`pkill -9 -f '${webName}'`, () => {
            setTimeout(() => {
                exec(`nohup ${webPath} -c ${FILE_PATH}/config.json >/dev/null 2>&1 &`);
            }, 1000);
        });

        return res.end(JSON.stringify({ status: "success", message: `Setting V2Ray Disimpan! DNS: [${dns_type.toUpperCase()}] ${custom_dns}, Engine: ${engine.toUpperCase()}. Engine restarted!` }));
    }

    // ⚡ API ENDPOINT SET WS-PROXY SSH CONTROLLER
    if (pathName === '/api/set-wsproxy') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (!verifyAdminPassword(query.pass)) {
            return res.end(JSON.stringify({ status: "error", message: "Akses Ditolak! Anda harus Login Admin terlebih dahulu." }));
        }

        saveWsProxyConfig(query.ssh_port, query.keep_alive, query.max_buffer);
        return res.end(JSON.stringify({ status: "success", message: `Setting SSH Disimpan! Target Port: ${query.ssh_port || 22}, KeepAlive: ${query.keep_alive || 15000}ms` }));
    }

    // 🛠️ API ENDPOINT SET SYSTEM CONFIG (BANNER, BBR, UDPGW)
    if (pathName === '/api/set-system') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (!verifyAdminPassword(query.pass)) {
            return res.end(JSON.stringify({ status: "error", message: "Akses Ditolak! Anda harus Login Admin terlebih dahulu." }));
        }

        const banner = query.banner ? decodeURIComponent(query.banner) : "";
        const enable_bbr = query.enable_bbr || "true";
        const udpgw_port = query.udpgw_port || "7300";
        const udpgw_max_clients = query.udpgw_max_clients || "1000";

        saveSystemSettings(banner, enable_bbr, udpgw_port, udpgw_max_clients);

        // 1. Update Banner Dropbear Instan
        if (banner) {
            try {
                fs.writeFileSync('/etc/dropbear_banner', banner);
            } catch(e) {
                console.error("Gagal tulis banner:", e);
            }
        } else {
            const defaultBanner = "==================================================\n" +
                                  "          👑 SELAMAT MENIKMATI 👑\n" +
                                  "       🥳 SSH SERVER PAAS RAILWAY 🥳\n" +
                                  "==================================================\n" +
                                  " powered by : d e d e f a t h u\n" +
                                  "==================================================\n";
            try { fs.writeFileSync('/etc/dropbear_banner', defaultBanner); } catch(e){}
        }

        // 2. Restart Dropbear Terpisah
        exec("pkill -9 dropbear", () => {
            setTimeout(() => {
                const wsCfg = getWsProxyConfig();
                const sshPort = wsCfg.sshPort || 22;
                exec(`/usr/sbin/dropbear -p 127.0.0.1:${sshPort} -b /etc/dropbear_banner -W 1048576 -K 15 -I 300`, (err) => {
                    if (err) console.error("Gagal restart Dropbear:", err.message);
                });
            }, 1000);
        });

        // 3. Kill badvpn-udpgw lama & restart ke port baru secara real-time
        exec("pkill -9 badvpn-udpgw", () => {
            setTimeout(() => {
                if (fs.existsSync('/usr/local/bin/badvpn-udpgw')) {
                    exec(`nohup /usr/local/bin/badvpn-udpgw --listen-addr 0.0.0.0:${udpgw_port} --max-clients ${udpgw_max_clients} --max-connections-for-client 50 >/dev/null 2>&1 &`);
                }
            }, 1000);
        });

        // 4. Apply BBR Switch
        try {
            if (enable_bbr === "true") {
                exec("sysctl -w net.ipv4.tcp_congestion_control=bbr 2>/dev/null");
            } else {
                exec("sysctl -w net.ipv4.tcp_congestion_control=cubic 2>/dev/null");
            }
        } catch(e) {}

        return res.end(JSON.stringify({ status: "success", message: `System Config (Banner/BBR/UDPGW:${udpgw_port}) Berhasil Disimpan & Di-apply!` }));
    }

    if (pathName === '/api/set-token') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (!verifyAdminPassword(query.pass)) {
            return res.end(JSON.stringify({ status: "error", message: "Akses Ditolak! Anda harus Login Admin terlebih dahulu." }));
        }
        
        const singleToken = query.token !== undefined ? query.token.trim() : null;
        if (singleToken !== null) restartSingleTunnel(singleToken);

        return res.end(JSON.stringify({ status: "success", message: "Perintah restart tunnel terkirim! Tunggu 10 detik..." }));
    }

    if (pathName === '/api/set-cfip') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (!verifyAdminPassword(query.pass)) {
            return res.end(JSON.stringify({ status: "error", message: "Akses Ditolak! Anda harus Login Admin terlebih dahulu." }));
        }
        const newIp = query.ip ? query.ip.trim() : "";
        if (newIp) {
            fs.writeFileSync(CFIP_FILE, newIp);
            if (currentActiveDomain) generateLinks(currentActiveDomain);
            return res.end(JSON.stringify({ status: "success", message: `CFIP Berhasil Diperbarui ke: ${newIp}` }));
        } else {
            if (fs.existsSync(CFIP_FILE)) fs.unlinkSync(CFIP_FILE);
            return res.end(JSON.stringify({ status: "success", message: "CFIP Direset ke Default." }));
        }
    }

    if (pathName === '/api/add') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(addSsh(query.user, query.pass, ipAddr, userAgent))); }
    
    if (pathName === '/api/delete') { 
        res.writeHead(200, { 'Content-Type': 'application/json' }); 
        if (!verifyAdminPassword(query.token)) return res.end(JSON.stringify({ status: "error", message: "Akses Ditolak!" })); 
        return res.end(JSON.stringify(deleteSsh(query.user))); 
    }
    
    if (pathName === '/api/list') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(listSsh())); }
    
    if (pathName === '/api/login') { 
        res.writeHead(200, { 'Content-Type': 'application/json' }); 
        const isPassConfigured = getAdminPassword() !== null;
        if (!isPassConfigured) {
            return res.end(JSON.stringify({ status: "not_configured", message: "Password Admin belum pernah dibuat!" }));
        }
        return res.end(JSON.stringify(verifyAdminPassword(query.pass) ? { status: "success", token: query.pass } : { status: "error", message: "Password Salah!" })); 
    }
    
    if (pathName === '/api/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        
        let hwInfo = { 
            cpu_model: os.cpus()[0] ? os.cpus()[0].model : "Unknown Core", 
            ram_total: (os.totalmem()/1024/1024/1024).toFixed(2)+" GB", 
            ram_used: ((os.totalmem()-os.freemem())/1024/1024/1024).toFixed(2)+" GB", 
            disk_usage: cachedDiskUsage, 
            uptime: (os.uptime()/3600).toFixed(2)+" Hours", 
            ssh_online: cachedSshOnline, 
            user_list_details: cachedUserListDetails 
        };
        
        if (fs.existsSync(STATS_PATH)) { try { hwInfo = { ...hwInfo, ...JSON.parse(fs.readFileSync(STATS_PATH, 'utf8')) }; } catch (e) {} }
        
        let quickUrl = currentActiveDomain || "Menunggu Quick Tunnel...";
        let ztSshDomains = getDomainsByPort(['8880', '8881']);
        let ztVmessDomains = getDomainsByPort(['8001']);
        let passConfigured = getAdminPassword() !== null;
        let netSettings = getNetworkSettings();
        let wsProxyCfg = getWsProxyConfig();
        let sysSettings = getSystemSettings();
        
        let rlwyUrl = process.env.RAILWAY_TCP_PROXY_DOMAIN && process.env.RAILWAY_TCP_PROXY_PORT
            ? `${process.env.RAILWAY_TCP_PROXY_DOMAIN}:${process.env.RAILWAY_TCP_PROXY_PORT}`
            : (process.env.SNI || "Tidak Aktif");
        
        let cleanOnlineStr = String(hwInfo.ssh_online).replace(/👥/g, '').replace(/Active/g, '').replace(/Users/g, '').trim();
        return res.end(JSON.stringify({ 
            active_cfip: getActiveCfip(), 
            quick_url: quickUrl, 
            zt_domains: ztSshDomains, 
            zt_vmess_domains: ztVmessDomains, 
            pass_configured: passConfigured, 
            railway_url: rlwyUrl, 
            status: "ONLINE", 
            dns_type: netSettings.dns_type,
            custom_dns: netSettings.custom_dns,
            engine_mode: netSettings.engine,
            ws_proxy_cfg: wsProxyCfg,
            sys_settings: sysSettings,
            ...hwInfo, 
            ssh_online: cleanOnlineStr || "0" 
        }));
    }

    if (pathName === '/' || pathName === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <title>⚡ PREMIUM SSH & VPN PANEL ⚡</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: '-apple-system', BlinkMacSystemFont, sans-serif; background: #000000; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 15px; flex-direction: column;}
                .container { background: #000000; width: 100%; max-width: 500px; padding: 20px; border-radius: 16px; box-shadow: 0 0 20px rgba(56, 189, 248, 0.1); border: 1px solid #111827; margin-bottom: 20px; }
                .header { text-align: center; margin-bottom: 20px; position: relative; }
                h1 { font-size: 20px; color: #38bdf8; text-transform: uppercase; letter-spacing: 1px; }
                .dev-tag { font-size: 11px; color: #64748b; margin-top: 4px; font-weight: bold; }
                .btn-login-trigger { position: absolute; top: 0; right: 0; background: #111827; color: #f8fafc; border: 1px solid #1f2937; padding: 4px 8px; border-radius: 6px; font-size: 10px; cursor: pointer; font-weight: bold; }
                .status-container { text-align: center; margin-bottom: 15px; }
                .status-badge { display: inline-block; background: #0a0a0a; padding: 5px 12px; border-radius: 50px; font-size: 11px; font-weight: bold; border: 1px solid #1f2937; }
                .status-dot { height: 8px; width: 8px; background-color: #4ade80; border-radius: 50%; display: inline-block; margin-right: 6px; box-shadow: 0 0 8px #4ade80; }
                .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
                .stat-card { background: #0a0a0a; padding: 12px; border-radius: 8px; border: 1px solid #1f2937; text-align: left; }
                .stat-title { font-size: 11px; color: #94a3b8; text-transform: uppercase; }
                .stat-value { font-size: 14px; font-weight: bold; color: #f1f5f9; margin-top: 4px; }
                .ssh-manager { background: #0a0a0a; padding: 15px; border-radius: 12px; border: 1px solid #1f2937; margin-bottom: 20px; position: relative;}
                .ssh-title { font-size: 13px; font-weight: bold; color: #38bdf8; text-transform: uppercase; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
                .input-group { display: flex; gap: 8px; margin-bottom: 10px; }
                .input-ssh { background: #000000; border: 1px solid #1f2937; padding: 8px 12px; border-radius: 6px; color: #fff; font-size: 13px; width: 100%; outline: none; }
                .input-ssh:focus { border-color: #38bdf8; }
                
                .select-zt { background: #000000; border: 1px solid #a855f7; padding: 8px 12px; border-radius: 6px; color: #38bdf8; font-size: 13px; width: 100%; font-weight: bold; font-family: monospace; outline: none; margin: 6px 0; }
                .btn-add { background: #38bdf8; color: #090d16; border: none; padding: 8px 15px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 13px; }
                .admin-status-lbl { font-size: 10px; font-weight: bold; color: #38bdf8; background: rgba(56, 189, 248, 0.1); padding: 2px 6px; border-radius: 4px; }
                .result-box { display: none; background: #000000; border: 1px solid #4ade80; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 12px; color: #4ade80; white-wrap: pre-wrap; margin-bottom: 15px; overflow-x: hidden; }
                .btn-copy-result { display: none; background: #4ade80; color: #090d16; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 11px; width: 100%; margin-bottom: 15px; }
                .ssh-list { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
                .ssh-list th { text-align: left; padding: 6px; color: #94a3b8; border-bottom: 1px solid #1f2937; }
                .ssh-list td { padding: 6px; border-bottom: 1px solid #111827; vertical-align: middle; }
                .btn-action-group { display: flex; gap: 4px; justify-content: flex-end; }
                .btn-del { background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; display: none; }
                .btn-info { background: #eab308; color: #090d16; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; display: none; }
                .url-section { background: #000000; border: 1px solid #38bdf8; padding: 12px; border-radius: 8px; margin-bottom: 12px; text-align: center; }
                .url-section th { font-size: 11px; color: #94a3b8; font-weight: bold; text-transform: uppercase; }
                .url-box { font-family: monospace; font-size: 13px; word-break: break-all; color: #38bdf8; font-weight: bold; margin: 6px 0; }
                .btn-copy { background: #38bdf8; color: #090d16; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 11px; width: 100%; }
                .note { font-size: 11px; color: #64748b; text-align: center; line-height: 1.4; margin-top: 10px; }

                .card-blue { background-color: #050a14; border: 1px solid #1e293b; padding: 15px; border-radius: 12px; margin-top: 15px; text-align: left; }
                .btn-blue { background-color: #0f172a; border: 1px solid #1e293b; color: #93c5fd; padding: 8px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer; width: 100%; text-align: center; font-family: monospace; }
                .btn-blue:hover { border-color: #3b82f6; color: #fff; background-color: #1e293b; }
                .btn-active { border-color: #60a5fa !important; color: #fff !important; background-color: #1d4ed8 !important; }
                .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 8px; }
                .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
                .lbl-vpn { font-size: 10px; color: #38bdf8; font-weight: bold; display: block; margin-bottom: 4px; text-transform: uppercase; }
                .border-lbl { border-left: 2px solid #38bdf8; padding-left: 6px; font-size: 11px; font-weight: bold; margin-top: 12px; font-family: monospace; }

                .zt-admin-card { background: #000000; border: 1px solid #8b5cf6; padding: 16px; border-radius: 12px; margin-bottom: 18px; box-shadow: 0 0 15px rgba(139, 92, 246, 0.15); }
                .sub-box { background: #05050a; border: 1px solid #1f1938; padding: 12px; border-radius: 10px; margin-bottom: 12px; }
                .sub-box-title { font-size: 12px; font-weight: bold; color: #38bdf8; margin-bottom: 8px; text-transform: uppercase; display: flex; align-items: center; gap: 6px; }
                .btn-token-trigger { width: 100%; padding: 12px; border-radius: 8px; font-weight: bold; font-size: 13px; cursor: pointer; border: none; transition: 0.2s; text-transform: uppercase; letter-spacing: 0.5px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>👑 SELAMAT DATANG DI PANEL SSH/VPN RAILWAY 👑</h1>
                    <div class="dev-tag">DYNAMIC TRIPLE-TUNNEL NODE CORE ACTIVE</div>
                    <button class="btn-login-trigger" id="admin-login-btn" onclick="handleAdminAuthBtn()">🔑 LOGIN ADMIN</button>
                </div>
                <div class="status-container"><div class="status-badge"><span class="status-dot"></span><span style="color: #4ade80">ALL TUNNELS ONLINE</span></div></div>
                <div class="stats-grid">
                    <div class="stat-card" style="grid-column: span 2;"><div class="stat-title">CPU Model</div><div class="stat-value" id="cpu" style="font-size:12px; color:#38bdf8;">Loading...</div></div>
                    <div class="stat-card"><div class="stat-title">RAM Used / Total</div><div class="stat-value" id="ram">Loading...</div></div>
                    <div class="stat-card"><div class="stat-title">Disk Usage (/)</div><div class="stat-value" id="disk">Loading...</div></div>
                    <div class="stat-card"><div class="stat-title">Server Uptime</div><div class="stat-value" id="uptime" style="font-size:12px;">Loading...</div></div>
                    <div class="stat-card" style="border-color: #a855f7;"><div class="stat-title" style="color:#d8b4fe;">SSH Online Users</div><div class="stat-value" id="ssh" style="font-size:14px; color:#a855f7; line-height:1.3;">👥 0 Users</div></div>
                </div>

                <!-- 🔒 MENU ADMIN KONTROL UTAMA -->
                <div class="zt-admin-card" id="zt-admin-box">
                    <div style="font-size: 12px; font-weight: bold; color: #d8b4fe; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
                        <span>⚙️ SYSTEM CONTROL PANEL</span>
                        <span id="btn-change-pass" onclick="changeAdminPassUI()" style="color: #eab308; cursor: pointer; text-decoration: underline; font-size: 11px; display: none;">🔑 GANTI PASS ADMIN</span>
                    </div>

                    <!-- BOX 1: PENGATURAN V2RAY SERVER -->
                    <div class="sub-box" style="border-color: #0284c7;">
                        <div class="sub-box-title" style="color:#38bdf8;">⚙️ PENGATURAN V2RAY SERVER</div>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <div class="grid-2" style="margin-bottom:0;">
                                <div>
                                    <label class="lbl-vpn" style="color:#eab308;">DNS MODE</label>
                                    <select id="dnsTypeSelect" class="input-ssh" style="color: #eab308; font-weight: bold;" onchange="toggleDnsPlaceholder()">
                                        <option value="udp">🚀 UDP Fast DNS (IP)</option>
                                        <option value="doh">🔒 DoH Secure DNS (HTTPS URL)</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="lbl-vpn" style="color:#38bdf8;">ENGINE MODE</label>
                                    <select id="engineSelect" class="input-ssh" style="color: #38bdf8; font-weight: bold;">
                                        <option value="ws">🌐 WebSocket (WS)</option>
                                        <option value="grpc">⚡ gRPC Engine</option>
                                        <option value="h2">🚀 HTTP/2 (H2)</option>
                                        <option value="tcp">🔌 TCP (Raw Direct)</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label class="lbl-vpn" style="color:#4ade80;">CUSTOM DNS IP / DOH URL</label>
                                <select id="dnsDropdown" class="input-ssh" style="color:#4ade80;" onchange="toggleCustomDnsInput()">
                                    <option value="8.8.8.8">Google DNS (8.8.8.8)</option>
                                    <option value="1.1.1.1">Cloudflare DNS (1.1.1.1)</option>
                                    <option value="9.9.9.9">Quad9 DNS (9.9.9.9)</option>
                                    <option value="https://1.1.1.1/dns-query">Cloudflare DoH (https://1.1.1.1/dns-query)</option>
                                    <option value="https://dns.google/dns-query">Google DoH (https://dns.google/dns-query)</option>
                                    <option value="https://dns.adguard-dns.com/dns-query">AdGuard DoH (https://dns.adguard-dns.com/dns-query)</option>
                                    <option value="custom">✏️ Custom...</option>
                                </select>
                                <input type="text" id="customDnsInput" class="input-ssh" placeholder="Ketik IP DNS atau URL DoH Manual..." style="color:#4ade80; display:none; margin-top:4px;">
                            </div>

                            <button class="btn-token-trigger" style="background: #0284c7; color: #fff; margin-top: 4px;" onclick="saveDnsNetworkSetting()">💾 SIMPAN V2RAY SERVER CONFIG</button>
                        </div>
                    </div>

                    <!-- BOX 2: PENGATURAN SSH SERVER -->
                    <div class="sub-box" style="border-color: #8b5cf6;">
                        <div class="sub-box-title" style="color:#d8b4fe;">🔌 PENGATURAN SSH SERVER</div>
                        <div class="grid-3" style="margin-top:4px;">
                            <div>
                                <label class="lbl-vpn" style="color:#a855f7;">PORT DROPBEAR</label>
                                <select id="wsPortDropdown" class="input-ssh" style="color:#a855f7;" onchange="toggleCustomWsPortInput()">
                                    <option value="22">Port 22 (OpenSSH)</option>
                                    <option value="109">Port 109 (Dropbear Direct)</option>
                                    <option value="143">Port 143 (Dropbear Alt)</option>
                                    <option value="447">Port 447 (SSL Stunnel)</option>
                                    <option value="custom">✏️ Custom...</option>
                                </select>
                                <input type="number" id="wsPortInput" class="input-ssh" placeholder="Port Manual..." style="display:none; margin-top:4px;">
                            </div>
                            <div>
                                <label class="lbl-vpn" style="color:#a855f7;">KEEPALIVE (MS)</label>
                                <select id="wsKeepDropdown" class="input-ssh" style="color:#a855f7;" onchange="toggleCustomWsKeepInput()">
                                    <option value="5000">5000 (5s - Fast)</option>
                                    <option value="15000">15000 (15s - Normal)</option>
                                    <option value="30000">30000 (30s - Slow)</option>
                                    <option value="custom">✏️ Custom...</option>
                                </select>
                                <input type="number" id="wsKeepInput" class="input-ssh" placeholder="Interval MS..." style="display:none; margin-top:4px;">
                            </div>
                            <div>
                                <label class="lbl-vpn" style="color:#a855f7;">MAX BUFFER</label>
                                <select id="wsBufDropdown" class="input-ssh" style="color:#a855f7;" onchange="toggleCustomWsBufInput()">
                                    <option value="16384">16384 (16KB)</option>
                                    <option value="32768">32768 (32KB)</option>
                                    <option value="65536">65536 (64KB)</option>
                                    <option value="custom">✏️ Custom...</option>
                                </select>
                                <input type="number" id="wsBufInput" class="input-ssh" placeholder="Bytes Limit..." style="display:none; margin-top:4px;">
                            </div>
                        </div>

                        <!-- SUB-BOX SISTEM FITUR: BANNER, BBR, UDPGW -->
                        <div style="margin-top:12px; border-top:1px solid #1f1938; padding-top:10px;">
                            <div>
                                <label class="lbl-vpn" style="color:#eab308;">CUSTOM BANNER DROPBEAR (HTML / TEXT ALLOWED)</label>
                                <textarea id="bannerInput" class="input-ssh" style="height:60px; font-family:monospace; font-size:11px;" placeholder="Kosongkan untuk memakai banner standar..."></textarea>
                            </div>

                            <div class="grid-2" style="margin-top:8px; margin-bottom:0;">
                                <div>
                                    <label class="lbl-vpn" style="color:#10b981;">TCP BBR SWITCH</label>
                                    <select id="bbrSelect" class="input-ssh" style="color:#10b981; font-weight:bold;">
                                        <option value="true">⚡ ON (TCP BBR Active)</option>
                                        <option value="false">❌ OFF (TCP Cubic Standard)</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="lbl-vpn" style="color:#f43f5e;">BADVPN UDPGW PORT</label>
                                    <select id="udpgwPortSelect" class="input-ssh" style="color:#f43f5e; font-weight:bold;">
                                        <option value="7300">Port 7300 (Standard Game)</option>
                                        <option value="7200">Port 7200 (Alt Game 1)</option>
                                        <option value="7100">Port 7100 (Alt Game 2)</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <button class="btn-token-trigger" style="background: #8b5cf6; color: #fff; margin-top:10px;" onclick="saveWsProxySettingUI()">💾 SIMPAN CONFIG SSH SERVER</button>
                    </div>

                    <!-- TOMBOL BESAR TOKEN ARGO TUNNEL & CFIP -->
                    <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
                        <button class="btn-token-trigger" style="background: linear-gradient(135deg, #a855f7, #6b21a8); color: #fff; box-shadow: 0 4px 15px rgba(168, 85, 247, 0.4);" onclick="promptSingleTokenInput()">🌐 MASUKKAN TOKEN ARGO TUNNEL</button>
                        <button class="btn-token-trigger" style="background: #16a34a; color: #fff;" onclick="promptCfipInput()">🚀 SET CLOUDFLARE CLEAN IP (CFIP)</button>
                    </div>

                    <!-- BOX 3: INFO STATUS DIBAWAH -->
                    <div class="sub-box" style="border-color: #10b981; margin-bottom: 0;">
                        <div class="sub-box-title" style="color:#10b981; text-align:center; display:block;">📋 PENGATURAN YANG TERPASANG DI SERVER</div>
                        <div style="font-size: 11px; color: #4ade80; text-align: center; font-weight: bold; line-height: 1.6;">
                            <span>CFIP AKTIF: </span><span id="display-cfip" style="color:#fff; font-family:monospace;">Loading...</span><br>
                            <span>DNS MODE: </span><span id="display-dns" style="color:#eab308; font-family:monospace;">UDP</span> | 
                            <span>ENGINE: </span><span id="display-engine" style="color:#38bdf8; font-family:monospace;">WS</span><br>
                            <span>SSH TARGET PORT: </span><span id="display-ws-port" style="color:#d8b4fe; font-family:monospace;">22</span> | 
                            <span>KEEPALIVE: </span><span id="display-ws-keep" style="color:#38bdf8; font-family:monospace;">15000ms</span> | 
                            <span>MAX BUFFER: </span><span id="display-ws-buf" style="color:#eab308; font-family:monospace;">32768 Bytes</span><br>
                            <span>TCP BBR: </span><span id="display-bbr" style="color:#10b981; font-family:monospace;">ON</span> | 
                            <span>UDPGW PORT: </span><span id="display-udpgw" style="color:#f43f5e; font-family:monospace;">7300</span>
                        </div>
                    </div>
                </div>

                <div class="ssh-manager">
                    <div class="ssh-title"><span>➕ BUAT AKUN SSH BARU</span><span id="admin-indicator" class="admin-status-lbl">PUBLIC CREATION</span></div>
                    <div class="input-group">
                        <input type="text" id="ssh-user" class="input-ssh" placeholder="Username...">
                        <input type="password" id="ssh-pass" class="input-ssh" placeholder="Password...">
                        <button class="btn-add" id="btn-add-ssh" onclick="createAccount()">ADD</button>
                    </div>
                    <div id="ssh-result" class="result-box"></div>
                    <button id="btn-copy-acc" class="btn-copy-result" onclick="copyAccountText()">📋 COPY DETAIL AKUN</button>
                    <div id="ssh-msg" style="font-size: 11px; margin-top: 5px; font-weight: bold;"></div>
                    <div class="ssh-title" style="margin-top: 15px; border-top: 1px solid #1f2937; padding-top: 10px;">📋 DAFTAR AKUN TERDAFTAR</div>
                    <table class="ssh-list">
                        <thead><tr><th>Username</th><th>Shell Path</th><th style="text-align: right;">Aksi</th></tr></thead>
                        <tbody id="ssh-table-body"><tr><td colspan="3" style="text-align:center; color:#64748b;">Loading accounts...</td></tr></tbody>
                    </table>
                </div>

                <!-- DOMAIN TUNNEL SSH -->
                <div class="url-section" style="border-color: #a855f7;">
                    <div class="url-title" style="color: #d8b4fe;">Server ssh aktif (zero trust domain)</div>
                    <div id="zt-container">
                        <div class="url-box" id="named-url">Menghubungkan Domain...</div>
                    </div>
                    <button class="btn-copy" id="btn-copy-named" style="background:#a855f7; color:#fff;" onclick="copyTxt('named-url', 'btn-copy-named')">📋 COPY SSH SERVER</button>
                </div>

                <!-- DOMAIN TUNNEL VMESS -->
                <div class="url-section" style="border-color: #0284c7;">
                    <div class="url-title" style="color: #38bdf8;">Server Zero trust (Vmess/Vless/X-Ray Domain)</div>
                    <div id="zt-vmess-container">
                        <div class="url-box" id="vmess-named-url" style="color:#38bdf8;">Menghubungkan Domain VMess...</div>
                    </div>
                    <button class="btn-copy" id="btn-copy-vmess-named" style="background:#0284c7; color:#fff;" onclick="copyTxt('vmess-named-url', 'btn-copy-vmess-named')">📋 COPY VMESS DOMAIN</button>
                </div>

                <div class="url-section" style="border-color: #f43f5e;"><div class="url-title" style="color: #fb7185;">Server SNI/Stunnel SNI MURNI</div><div class="url-box" id="railway-url" style="color: #f43f5e;">Loading...</div><button class="btn-copy" id="btn-copy-railway" style="background:#f43f5e; color:#fff;" onclick="copyTxt('railway-url', 'btn-copy-railway')">📋 COPY SERVER SSH SNI</button></div>
                <div class="url-section"><div class="url-title">Quick Tunnel url (Vmess/Vless/Trojan Sub)</div><div class="url-box" id="quick-url">Loading...</div><button class="btn-copy" id="btn-copy-quick" onclick="copyTxt('quick-url', 'btn-copy-quick')">📋 COPY SUB DOMAIN</button></div>

                <div class="card-blue">
                  <div style="text-align: center; margin-bottom: 12px; border-bottom: 1px solid #1e2d54; padding-bottom: 8px;">
                    <span style="font-size: 13px; font-weight: bold; color: #fff; tracking-wider;">⚡ DDFATHUVLES CONFIG GENERATOR</span>
                  </div>
                  <div class="grid-2">
                    <div>
                      <label class="lbl-vpn">UUID / PASS</label>
                      <input id="uuidInput" type="text" value="Loading..." class="input-ssh" style="font-family: monospace;" readonly>
                    </div>
                    <div>
                      <label class="lbl-vpn">PILIH DOMAIN TARGET TUNNEL</label>
                      <select id="domainSelect" class="input-ssh" style="font-family: monospace; color: #38bdf8; font-weight: bold;">
                        <option value="">-- Menunggu Domain --</option>
                      </select>
                    </div>
                  </div>
                  <div style="margin-bottom: 12px;">
                    <label class="lbl-vpn">BUG HOST (SNI / CDN)</label>
                    <input id="bugInput" type="text" value="suporte.garena.com" class="input-ssh" style="font-family: monospace;">
                  </div>

                  <div class="border-lbl" style="border-color:#38bdf8; color:#93c5fd;">BUG SNI (NORMAL / STANDAR)</div>
                  <div class="grid-3">
                    <button onclick="buildConfig('vless', 'sni', event)" class="btn-blue">VLESS STD</button>
                    <button onclick="buildConfig('vmess', 'sni', event)" class="btn-blue">VMESS STD</button>
                    <button onclick="buildConfig('trojan', 'sni', event)" class="btn-blue">TROJAN STD</button>
                  </div>

                  <div class="border-lbl" style="border-color:#eab308; color:#fde047;">BUG SNI (REVERSE / GAMBAR 2)</div>
                  <div class="grid-3">
                    <button onclick="buildConfig('vless', 'sni_reverse', event)" class="btn-blue" style="color:#fde047;">VLESS REV</button>
                    <button onclick="buildConfig('vmess', 'sni_reverse', event)" class="btn-blue" style="color:#fde047;">VMESS REV</button>
                    <button onclick="buildConfig('trojan', 'sni_reverse', event)" class="btn-blue" style="color:#fde047;">TROJAN REV</button>
                  </div>

                  <div class="border-lbl" style="border-color:#6366f1; color:#c7d2fe;">BUG CDN (PROXY PROT)</div>
                  <div class="grid-3">
                    <button onclick="buildConfig('vless', 'cdn', event)" class="btn-blue">VLESS</button>
                    <button onclick="buildConfig('vmess', 'cdn', event)" class="btn-blue">VMESS</button>
                    <button onclick="buildConfig('trojan', 'cdn', event)" class="btn-blue">TROJAN</button>
                  </div>

                  <div id="output-area" class="result-box" style="margin-top: 15px; border-color: #38bdf8; display: none;">
                    <div style="display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 6px; font-size: 11px;">
                      <span id="out-type" style="color: #38bdf8;">CONFIG</span>
                      <span onclick="copyOutConfig()" style="color: #4ade80; cursor: pointer; text-decoration: underline;">[COPY]</span>
                    </div>
                    <p id="configText" style="word-break: break-all; color: #fff; max-h: 100px; overflow-y: auto; font-family: monospace;"></p>
                  </div>
                </div>

                <p class="note">Single terowongan multi-host berjalan sinkron.<br>Node.js Core Engine Rendering System.</p>
            </div>
            <script>
                let adminToken = localStorage.getItem("admin_session_token") || "";
                let savedUsersData = []; 
                let isPassConfigured = false;

                function checkAdminUI() {
                    let indicator = document.getElementById('admin-indicator'); 
                    let loginBtn = document.getElementById('admin-login-btn');
                    let changePassBtn = document.getElementById('btn-change-pass');

                    if(!isPassConfigured) {
                        loginBtn.innerText = "⚙️ SETUP ADMIN PASS";
                        loginBtn.style.background = "#eab308"; loginBtn.style.color = "#000";
                        changePassBtn.style.display = "none";
                    } else if(adminToken) {
                        indicator.innerText = "ADMIN ROUTE"; indicator.style.color = "#4ade80"; indicator.style.background = "rgba(74, 222, 128, 0.1)"; 
                        loginBtn.innerText = "🔒 LOGOUT"; loginBtn.style.background = "#111827"; loginBtn.style.color = "#f8fafc";
                        changePassBtn.style.display = "inline";
                        document.querySelectorAll('.btn-del').forEach(b => b.style.display = "inline-block"); document.querySelectorAll('.btn-info').forEach(b => b.style.display = "inline-block");
                    } else {
                        indicator.innerText = "PUBLIC CREATION"; indicator.style.color = "#38bdf8"; indicator.style.background = "rgba(56, 189, 248, 0.1)"; 
                        loginBtn.innerText = "🔑 LOGIN ADMIN"; loginBtn.style.background = "#111827"; loginBtn.style.color = "#f8fafc";
                        changePassBtn.style.display = "none";
                        document.querySelectorAll('.btn-del').forEach(b => b.style.display = "none"); document.querySelectorAll('.btn-info').forEach(b => b.style.display = "none");
                    }
                }

                function toggleDnsPlaceholder() {
                    toggleCustomDnsInput();
                }

                function toggleCustomDnsInput() {
                    let sel = document.getElementById('dnsDropdown').value;
                    let inp = document.getElementById('customDnsInput');
                    inp.style.display = (sel === 'custom') ? 'block' : 'none';
                }

                function toggleCustomWsPortInput() {
                    let sel = document.getElementById('wsPortDropdown').value;
                    let inp = document.getElementById('wsPortInput');
                    inp.style.display = (sel === 'custom') ? 'block' : 'none';
                }

                function toggleCustomWsKeepInput() {
                    let sel = document.getElementById('wsKeepDropdown').value;
                    let inp = document.getElementById('wsKeepInput');
                    inp.style.display = (sel === 'custom') ? 'block' : 'none';
                }

                function toggleCustomWsBufInput() {
                    let sel = document.getElementById('wsBufDropdown').value;
                    let inp = document.getElementById('wsBufInput');
                    inp.style.display = (sel === 'custom') ? 'block' : 'none';
                }

                async function handleAdminAuthBtn() {
                    if(!isPassConfigured) {
                        let newP = prompt("KREASI PASSWORD ADMIN PERTAMA KALI:\\nMasukkan Password Admin Baru:");
                        if(!newP) return false;
                        try {
                            let res = await fetch('/api/setup-pass?pass=' + encodeURIComponent(newP));
                            let data = await res.json();
                            alert(data.message);
                            if(data.status === "success") { 
                                adminToken = newP; 
                                localStorage.setItem("admin_session_token", adminToken); 
                                updateStats(); 
                                return true;
                            }
                        } catch(e) { alert("Gagal membuat password!"); }
                        return false;
                    }

                    if(adminToken) { 
                        localStorage.removeItem("admin_session_token"); 
                        adminToken = ""; 
                        checkAdminUI(); 
                        fetchAccounts(); 
                        return false; 
                    }
                    
                    let pass = prompt("Masukkan Password Admin:"); if(!pass) return false;
                    try {
                        let res = await fetch('/api/login?pass='+pass); let data = await res.json();
                        if(data.status === "success") { 
                            adminToken = data.token; 
                            localStorage.setItem("admin_session_token", adminToken); 
                            checkAdminUI(); 
                            fetchAccounts(); 
                            return true;
                        } else { 
                            alert(data.message); 
                        }
                    } catch(e) { alert("Gagal terhubung"); }
                    return false;
                }

                async function saveDnsNetworkSetting() {
                    if (!adminToken) {
                        alert("Akses Ditolak! Anda harus Login Admin terlebih dahulu.");
                        let loggedIn = await handleAdminAuthBtn();
                        if (!loggedIn && !adminToken) return;
                    }

                    let dnsType = document.getElementById('dnsTypeSelect').value;
                    let selDns = document.getElementById('dnsDropdown').value;
                    let customDns = (selDns === 'custom') ? document.getElementById('customDnsInput').value.trim() : selDns;
                    let engine = document.getElementById('engineSelect').value;

                    if (!customDns) customDns = "8.8.8.8";

                    try {
                        let res = await fetch('/api/set-network?pass=' + encodeURIComponent(adminToken) + '&dns_type=' + dnsType + '&custom_dns=' + encodeURIComponent(customDns) + '&engine=' + engine);
                        let data = await res.json();
                        alert(data.message);
                        if (data.status === "success") {
                            updateStats();
                        }
                    } catch(e) {
                        alert("Gagal menyimpan konfigurasi ke backend!");
                    }
                }

                async function saveWsProxySettingUI() {
                    if (!adminToken) {
                        alert("Akses Ditolak! Anda harus Login Admin terlebih dahulu.");
                        let loggedIn = await handleAdminAuthBtn();
                        if (!loggedIn && !adminToken) return;
                    }

                    let selPort = document.getElementById('wsPortDropdown').value;
                    let port = (selPort === 'custom') ? document.getElementById('wsPortInput').value.trim() : selPort;

                    let selKeep = document.getElementById('wsKeepDropdown').value;
                    let keep = (selKeep === 'custom') ? document.getElementById('wsKeepInput').value.trim() : selKeep;

                    let selBuf = document.getElementById('wsBufDropdown').value;
                    let buf = (selBuf === 'custom') ? document.getElementById('wsBufInput').value.trim() : selBuf;

                    let banner = document.getElementById('bannerInput').value.trim();
                    let bbr = document.getElementById('bbrSelect').value;
                    let udpgw = document.getElementById('udpgwPortSelect').value;

                    if (!port) port = "22";
                    if (!keep) keep = "15000";
                    if (!buf) buf = "32768";

                    try {
                        let res1 = await fetch('/api/set-wsproxy?pass=' + encodeURIComponent(adminToken) + '&ssh_port=' + port + '&keep_alive=' + keep + '&max_buffer=' + buf);
                        let data1 = await res1.json();

                        let res2 = await fetch('/api/set-system?pass=' + encodeURIComponent(adminToken) + '&banner=' + encodeURIComponent(banner) + '&enable_bbr=' + bbr + '&udpgw_port=' + udpgw);
                        let data2 = await res2.json();

                        alert(data1.message + "\\n" + data2.message);
                        updateStats();
                    } catch(e) { alert("Gagal memperbarui SSH Config!"); }
                }

                async function promptSingleTokenInput() {
                    if (!adminToken) {
                        alert("Akses Ditolak! Anda harus Login Admin terlebih dahulu.");
                        let loggedIn = await handleAdminAuthBtn();
                        if (!loggedIn && !adminToken) return;
                    }

                    let inputToken = prompt("MASUKKAN TOKEN CLOUDFLARE ARGO (SINGLE TOKEN UNTUK SEMUA INGRESS RULES):\\n\\n(Kosongkan lalu klik OK jika ingin menghapus token tersimpan)");
                    if (inputToken === null) return;

                    try {
                        let res = await fetch('/api/set-token?pass=' + encodeURIComponent(adminToken) + '&token=' + encodeURIComponent(inputToken.trim()));
                        let data = await res.json();
                        alert(data.message);
                        updateStats();
                    } catch(e) { alert("Gagal memperbarui token!"); }
                }

                async function promptCfipInput() {
                    if (!adminToken) {
                        alert("Akses Ditolak! Anda harus Login Admin terlebih dahulu.");
                        let loggedIn = await handleAdminAuthBtn();
                        if (!loggedIn && !adminToken) return;
                    }

                    let inputIp = prompt("MASUKKAN IP CLEAN CLOUDFLARE (CFIP):\\nContoh: 104.17.3.81\\n\\n(Kosongkan lalu klik OK untuk reset ke default)");
                    if (inputIp === null) return;

                    try {
                        let res = await fetch('/api/set-cfip?pass=' + encodeURIComponent(adminToken) + '&ip=' + encodeURIComponent(inputIp.trim()));
                        let data = await res.json();
                        alert(data.message);
                        updateStats();
                    } catch(e) { alert("Gagal memperbarui CFIP!"); }
                }

                async function changeAdminPassUI() {
                    if(!adminToken) return;
                    let newP = prompt("GANTI PASSWORD ADMIN:\\nMasukkan Password Admin Baru:");
                    if(!newP) return;
                    try {
                        let res = await fetch('/api/setup-pass?old_pass=' + encodeURIComponent(adminToken) + '&pass=' + encodeURIComponent(newP));
                        let data = await res.json();
                        alert(data.message);
                        if(data.status === "success") { adminToken = newP; localStorage.setItem("admin_session_token", adminToken); checkAdminUI(); }
                    } catch(e) { alert("Gagal mengupdate password!"); }
                }

                async function updateStats() {
                    try {
                        let res = await fetch('/api/stats'); let data = await res.json();
                        isPassConfigured = data.pass_configured;
                        checkAdminUI();

                        document.getElementById('cpu').innerText = data.cpu_model || "N/A"; 
                        document.getElementById('ram').innerText = (data.ram_used || "0") + " / " + (data.ram_total || "0"); 
                        document.getElementById('disk').innerText = data.disk_usage || "0%"; 
                        document.getElementById('uptime').innerText = data.uptime || "0 Hours";
                        let detailActiveList = data.user_list_details || "Semua user offline";
                        document.getElementById('ssh').innerHTML = "👥 " + (data.ssh_online || "0") + " Active<br><span style='font-size:11px; font-weight:normal; color:#d8b4fe; display:block; margin-top:5px; white-space:pre-line;'>" + detailActiveList + "</span>";
                        document.getElementById('display-cfip').innerText = data.active_cfip || "Default";

                        if(data.dns_type) {
                            document.getElementById('dnsTypeSelect').value = data.dns_type;
                            document.getElementById('display-dns').innerText = (data.dns_type + " (" + (data.custom_dns || "8.8.8.8") + ")").toUpperCase();
                        }
                        if(data.custom_dns) {
                            let dropdown = document.getElementById('dnsDropdown');
                            let found = Array.from(dropdown.options).some(opt => opt.value === data.custom_dns);
                            if (found) {
                                dropdown.value = data.custom_dns;
                            } else {
                                dropdown.value = 'custom';
                                document.getElementById('customDnsInput').value = data.custom_dns;
                            }
                            toggleCustomDnsInput();
                        }
                        if(data.engine_mode) {
                            document.getElementById('engineSelect').value = data.engine_mode;
                            document.getElementById('display-engine').innerText = data.engine_mode.toUpperCase();
                        }
                        if(data.ws_proxy_cfg) {
                            let pDrop = document.getElementById('wsPortDropdown');
                            let foundP = Array.from(pDrop.options).some(opt => opt.value == data.ws_proxy_cfg.sshPort);
                            if (foundP) { pDrop.value = data.ws_proxy_cfg.sshPort; } else { pDrop.value = 'custom'; document.getElementById('wsPortInput').value = data.ws_proxy_cfg.sshPort; }
                            toggleCustomWsPortInput();

                            let kDrop = document.getElementById('wsKeepDropdown');
                            let foundK = Array.from(kDrop.options).some(opt => opt.value == data.ws_proxy_cfg.keepAlive);
                            if (foundK) { kDrop.value = data.ws_proxy_cfg.keepAlive; } else { kDrop.value = 'custom'; document.getElementById('wsKeepInput').value = data.ws_proxy_cfg.keepAlive; }
                            toggleCustomWsKeepInput();

                            let bDrop = document.getElementById('wsBufDropdown');
                            let foundB = Array.from(bDrop.options).some(opt => opt.value == data.ws_proxy_cfg.maxBuffer);
                            if (foundB) { bDrop.value = data.ws_proxy_cfg.maxBuffer; } else { bDrop.value = 'custom'; document.getElementById('wsBufInput').value = data.ws_proxy_cfg.maxBuffer; }
                            toggleCustomWsBufInput();

                            document.getElementById('display-ws-port').innerText = data.ws_proxy_cfg.sshPort;
                            document.getElementById('display-ws-keep').innerText = (data.ws_proxy_cfg.keepAlive || 15000) + "ms";
                            document.getElementById('display-ws-buf').innerText = (data.ws_proxy_cfg.maxBuffer || 32768) + " Bytes";
                        }

                        if(data.sys_settings) {
                            if(data.sys_settings.banner) document.getElementById('bannerInput').value = data.sys_settings.banner;
                            if(data.sys_settings.enable_bbr) document.getElementById('bbrSelect').value = data.sys_settings.enable_bbr;
                            if(data.sys_settings.udpgw_port) document.getElementById('udpgwPortSelect').value = data.sys_settings.udpgw_port;

                            document.getElementById('display-bbr').innerText = (data.sys_settings.enable_bbr === "true") ? "ON" : "OFF";
                            document.getElementById('display-udpgw').innerText = data.sys_settings.udpgw_port || "7300";
                        }

                        let ztContainer = document.getElementById('zt-container');
                        if (data.zt_domains && data.zt_domains.length > 1) {
                            let dropdownHtml = '<select id="named-url" class="select-zt" onmousedown="event.stopPropagation()">';
                            data.zt_domains.forEach(item => { dropdownHtml += '<option value="' + item.domain + '">🌐 ' + item.domain + ' (Port ' + item.port + ')</option>'; });
                            dropdownHtml += '</select>';
                            ztContainer.innerHTML = dropdownHtml;
                        } else if (data.zt_domains && data.zt_domains.length === 1) {
                            ztContainer.innerHTML = '<div class="url-box" id="named-url">' + data.zt_domains[0].domain + '</div>';
                        } else {
                            ztContainer.innerHTML = '<div class="url-box" id="named-url">Menghubungkan Domain SSH...</div>';
                        }

                        let ztVmessContainer = document.getElementById('zt-vmess-container');
                        if (data.zt_vmess_domains && data.zt_vmess_domains.length > 1) {
                            let dropdownVmessHtml = '<select id="vmess-named-url" class="select-zt" style="border-color:#0284c7; color:#38bdf8;" onmousedown="event.stopPropagation()">';
                            data.zt_vmess_domains.forEach(item => { dropdownVmessHtml += '<option value="' + item.domain + '">⚡ ' + item.domain + ' (Port ' + item.port + ')</option>'; });
                            dropdownVmessHtml += '</select>';
                            ztVmessContainer.innerHTML = dropdownVmessHtml;
                        } else if (data.zt_vmess_domains && data.zt_vmess_domains.length === 1) {
                            ztVmessContainer.innerHTML = '<div class="url-box" id="vmess-named-url" style="color:#38bdf8;">' + data.zt_vmess_domains[0].domain + '</div>';
                        } else {
                            ztVmessContainer.innerHTML = '<div class="url-box" id="vmess-named-url" style="color:#38bdf8;">Menghubungkan Domain VMess...</div>';
                        }

                        document.getElementById('railway-url').innerText = data.railway_url || "Tidak Aktif"; 
                        document.getElementById('quick-url').innerText = data.quick_url || "Menunggu Quick Tunnel...";

                        let domainSelect = document.getElementById('domainSelect');
                        let currentSelected = domainSelect.value;
                        let optionsHtml = '';

                        if (data.quick_url && !data.quick_url.includes("Menunggu")) {
                            optionsHtml += '<option value="' + data.quick_url + '">⚡ Quick Tunnel: ' + data.quick_url + '</option>';
                        }

                        if (data.zt_vmess_domains && data.zt_vmess_domains.length > 0) {
                            data.zt_vmess_domains.forEach(d => {
                                optionsHtml += '<option value="' + d.domain + '">🛡️ Zero Argo VMess (Port 8001): ' + d.domain + '</option>';
                            });
                        }

                        if (!optionsHtml) {
                            optionsHtml = '<option value="">-- Menunggu Domain VMess --</option>';
                        }

                        domainSelect.innerHTML = optionsHtml;
                        if (currentSelected) domainSelect.value = currentSelected;

                    } catch(e) {}
                }

                async function fetchAccounts() {
                    try {
                        let res = await fetch('/api/list'); let data = await res.json(); let tbody = document.getElementById('ssh-table-body'); tbody.innerHTML = "";
                        if(data.status === "success" && data.users.length > 0) {
                            savedUsersData = data.users; 
                            data.users.forEach(u => {
                                tbody.innerHTML += '<tr><td style="font-weight:bold; color:#f1f5f9;">👤 '+u.username+'</td><td style="color:#64748b;">'+u.shell+'</td><td style="text-align: right;"><div class="btn-action-group"><button class="btn-info" onclick="showAccountDetails(\\''+u.username+'\\')">👁️ INFO</button><button class="btn-del" onclick="deleteAccount(\\''+u.username+'\\')">HAPUS</button></div></td></tr>';
                            });
                            checkAdminUI();
                        } else { tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#64748b;">Belum ada akun SSH kustom</td></tr>'; }
                    } catch(e) {}
                }
                function showAccountDetails(username) { let userObj = savedUsersData.find(u => u.username === username); if(userObj) { alert("🕵️ DATA RAHASIA PEMBUAT AKUN:\\n===============================\\n👤 Username   : " + userObj.username + "\\n🔑 Password   : " + userObj.password + "\\n🌐 IP Address : " + userObj.ip + "\\n📱 User-Agent : " + userObj.user_agent); } }
                async function createAccount() {
                    let user = document.getElementById('ssh-user').value.trim(); let pass = document.getElementById('ssh-pass').value.trim(); let msg = document.getElementById('ssh-msg'); let resBox = document.getElementById('ssh-result'); let copyBtn = document.getElementById('btn-copy-acc');
                    if(!user || !pass) { msg.style.color = "#ef4444"; msg.innerText = "Isi username & password dulu!"; return; }
                    try {
                        let res = await fetch('/api/add?user='+user+'&pass='+pass); let data = await res.json();
                        if(data.status === "success") { msg.innerText = ""; resBox.innerText = data.message; resBox.style.display = "block"; copyBtn.style.display = "block"; document.getElementById('ssh-user').value = ""; document.getElementById('ssh-pass').value = ""; fetchAccounts(); } else { msg.style.color = "#ef4444"; msg.innerText = data.message; resBox.style.display = "none"; copyBtn.style.display = "none"; }
                    } catch(e) { msg.innerText = "Gagal memproses API"; }
                }
                function copyAccountText() { let txt = document.getElementById('ssh-result').innerText; navigator.clipboard.writeText(txt); let btn = document.getElementById('btn-copy-acc'); btn.innerText = "✅ STRUK AKUN BERHASIL DICOPY!"; btn.style.background = "#1f2937"; btn.style.color = "#4ade80"; setTimeout(() => { btn.innerText = "📋 COPY DETAIL AKUN"; btn.style.background = "#4ade80"; btn.style.color = "#090d16"; }, 1500); }
                async function deleteAccount(username) {
                    if(!adminToken) { alert("Aksi Ilegal! Lu harus Login Admin dulu Bos!"); return; }
                    if(confirm("Hapus akun SSH "+username+"?")) {
                        try {
                            let res = await fetch('/api/delete?user='+username+'&token='+adminToken); let data = await res.json();
                            if(data.status === "success") { fetchAccounts(); } else { alert(data.message); }
                        } catch(e) {}
                    }
                }
                
                function copyTxt(elementId, btnId) {
                    let elem = document.getElementById(elementId);
                    if(!elem) return;
                    let urlText = elem.tagName === "SELECT" ? elem.value : elem.innerText;
                    
                    if(!urlText.includes("Menunggu") && !urlText.includes("Tidak Aktif")) {
                        navigator.clipboard.writeText(urlText); let btn = document.getElementById(btnId); let oldText = btn.innerText; btn.innerText = "✅ COPIED!"; btn.style.background = "#4ade80"; btn.style.color = "#090d16";
                        setTimeout(() => { btn.innerText = oldText; if (elementId === 'named-url') { btn.style.background = '#a855f7'; btn.style.color = '#fff'; } else if (elementId === 'vmess-named-url') { btn.style.background = '#0284c7'; btn.style.color = '#fff'; } else if (elementId === 'railway-url') { btn.style.background = '#f43f5e'; btn.style.color = '#fff'; } else { btn.style.background = '#38bdf8'; btn.style.color = '#090d16'; } }, 1500);
                    }
                }

                async function fetchServerInfo() {
                  try {
                    const response = await fetch('/__info');
                    if (!response.ok) return;
                    const data = await response.json();
                    if (data.uuid) document.getElementById('uuidInput').value = data.uuid;
                    window.serverActivePaths = data.paths;
                  } catch (e) {}
                }

                function buildConfig(protocol, type, evt) {
                  document.querySelectorAll('.btn-blue').forEach(b => b.classList.remove('btn-active'));
                  if(evt && evt.target) evt.target.classList.add('btn-active');
                  
                  const uuid = document.getElementById('uuidInput').value.trim();
                  const hostSelect = document.getElementById('domainSelect');
                  const host = hostSelect.value.trim(); 
                  const bugHost = document.getElementById('bugInput').value.trim(); 
                  const engine = document.getElementById('engineSelect').value;
                  const area = document.getElementById('output-area');
                  const label = document.getElementById('out-type');
                  const txt = document.getElementById('configText');

                  if (!host || host.includes("Menunggu")) {
                    alert("Domain Tunnel belum siap / belum dipilih!");
                    return;
                  }

                  const pathsMapping = window.serverActivePaths || { vless: '/vless-argo', vmess: '/vmess-argo', trojan: '/trojan-argo' };
                  let basePath = pathsMapping[protocol] || '/' + protocol + '-argo';
                  
                  let remark = 'DDFATHU-' + protocol.toUpperCase() + '-' + type.toUpperCase() + '-' + engine.toUpperCase();
                  let configResult = '';
                  label.innerText = remark;

                  function safeBtoa(str) {
                    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(match, p1) {
                      return String.fromCharCode('0x' + p1);
                    }));
                  }

                  let netType = engine;

                  if (type === 'sni') {
                    if (protocol === 'vless') {
                      configResult = 'vless://' + uuid + '@' + bugHost + ':443?encryption=none&security=tls&sni=' + host + '&fp=randomized&type=' + netType + (netType === 'grpc' ? '&serviceName=grpc-service' : (netType === 'h2' ? '&path=/h2-path' : '&host=' + host + '&path=' + encodeURIComponent(basePath))) + '#' + encodeURIComponent(remark);
                    } else if (protocol === 'vmess') {
                      let jsonVmess = { v: "2", ps: remark, add: bugHost, port: 443, id: uuid, aid: 0, scy: "auto", net: netType, type: netType === 'grpc' ? 'multi' : 'none', host: host, path: netType === 'grpc' ? 'grpc-service' : (netType === 'h2' ? '/h2-path' : basePath), tls: "tls", sni: host };
                      configResult = 'vmess://' + safeBtoa(JSON.stringify(jsonVmess));
                    } else if (protocol === 'trojan') {
                      configResult = 'trojan://' + uuid + '@' + bugHost + ':443?security=tls&sni=' + host + '&type=' + netType + (netType === 'grpc' ? '&serviceName=grpc-service' : (netType === 'h2' ? '&path=/h2-path' : '&host=' + host + '&path=' + encodeURIComponent(basePath))) + '#' + encodeURIComponent(remark);
                    }
                  } 
                  else if (type === 'sni_reverse') {
                    if (protocol === 'vless') {
                      configResult = 'vless://' + uuid + '@' + host + ':443?encryption=none&security=tls&sni=' + bugHost + '&fp=randomized&type=' + netType + (netType === 'grpc' ? '&serviceName=grpc-service' : (netType === 'h2' ? '&path=/h2-path' : '&host=' + bugHost + '&path=' + encodeURIComponent(basePath))) + '#' + encodeURIComponent(remark);
                    } else if (protocol === 'vmess') {
                      let jsonVmess = { v: "2", ps: remark, add: host, port: 443, id: uuid, aid: 0, scy: "auto", net: netType, type: netType === 'grpc' ? 'multi' : 'none', host: bugHost, path: netType === 'grpc' ? 'grpc-service' : (netType === 'h2' ? '/h2-path' : basePath), tls: "tls", sni: bugHost };
                      configResult = 'vmess://' + safeBtoa(JSON.stringify(jsonVmess));
                    } else if (protocol === 'trojan') {
                      configResult = 'trojan://' + uuid + '@' + host + ':443?security=tls&sni=' + bugHost + '&type=' + netType + (netType === 'grpc' ? '&serviceName=grpc-service' : (netType === 'h2' ? '&path=/h2-path' : '&host=' + bugHost + '&path=' + encodeURIComponent(basePath))) + '#' + encodeURIComponent(remark);
                    }
                  } 
                  else if (type === 'cdn') {
                    let pathBug = '/' + bugHost + basePath;
                    if (protocol === 'vless') {
                      configResult = 'vless://' + uuid + '@' + host + ':443?encryption=none&security=tls&sni=' + host + '&fp=randomized&type=' + netType + (netType === 'grpc' ? '&serviceName=grpc-service' : (netType === 'h2' ? '&path=/h2-path' : '&host=' + host + '&path=' + encodeURIComponent(pathBug))) + '#' + encodeURIComponent(remark);
                    } else if (protocol === 'vmess') {
                      let jsonVmess = { v: "2", ps: remark, add: host, port: 443, id: uuid, aid: 0, scy: "auto", net: netType, type: netType === 'grpc' ? 'multi' : 'none', host: host, path: netType === 'grpc' ? 'grpc-service' : (netType === 'h2' ? '/h2-path' : pathBug), tls: "tls", sni: host };
                      configResult = 'vmess://' + safeBtoa(JSON.stringify(jsonVmess));
                    } else if (protocol === 'trojan') {
                      configResult = 'trojan://' + uuid + '@' + host + ':443?security=tls&sni=' + host + '&type=' + netType + (netType === 'grpc' ? '&serviceName=grpc-service' : (netType === 'h2' ? '&path=/h2-path' : '&host=' + host + '&path=' + encodeURIComponent(pathBug))) + '#' + encodeURIComponent(remark);
                    }
                  }

                  txt.innerText = configResult;
                  area.style.display = 'block';
                }

                function copyOutConfig() {
                  navigator.clipboard.writeText(document.getElementById('configText').innerText);
                  alert('Config Berhasil Disalin!');
                }

                setInterval(updateStats, 5000); 
                updateStats(); 
                fetchAccounts();
                fetchServerInfo();
            </script>
        </body>
        </html>
        `);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end("Not Found");
});

server.on('upgrade', (req, socket, head) => {
  const urlPath = req.url.split('?')[0];
  if (urlPath === '/ssh-ws') {
    const wsCfg = getWsProxyConfig();
    const targetPort = wsCfg.sshPort || 8880;
    const targetConn = require('net').createConnection({ port: targetPort, host: '127.0.0.1' }, () => {
      let rawHeaders = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
      for (let i = 0; i < req.rawHeaders.length; i += 2) { rawHeaders += `${req.rawHeaders[i]}: ${req.rawHeaders[i+1]}\r\n`; }
      rawHeaders += '\r\n';
      targetConn.write(rawHeaders);
      if (head && head.length > 0) targetConn.write(head);
      socket.pipe(targetConn).pipe(socket);
    });
    targetConn.on('error', () => socket.destroy());
    socket.on('error', () => targetConn.destroy());
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
    console.log(`[UI & Xray Gateway Engine] Running seamlessly on port ${PORT}`);
    generateConfig().then(() => downloadFilesAndRun()).then(() => extractDomains()).catch(e => console.error(e));
    
    if (fs.existsSync(ZT_SINGLE_TOKEN_FILE)) {
        try {
            const savedToken = fs.readFileSync(ZT_SINGLE_TOKEN_FILE, 'utf8').trim();
            if (savedToken) restartSingleTunnel(savedToken);
        } catch(e) {}
    }

    setInterval(() => {
        extractDomains();
    }, 3000);

    setInterval(() => {
        exec("df -h / | awk 'NR==2 {print $5}'", (err, stdout) => {
            if (!err && stdout.trim()) cachedDiskUsage = stdout.trim();
        });

        exec("netstat -anp 2>/dev/null | grep dropbear | grep ESTABLISHED | awk '{print $5}' | cut -d: -f1 | sort -u", (err, stdout) => {
            if (!err && stdout.trim()) {
                const ipLines = stdout.trim().split('\n').filter(Boolean);
                if (ipLines.length > 0) {
                    cachedSshOnline = "1 User";
                    cachedUserListDetails = `👤 IP Active: ${ipLines[0]}`;
                } else {
                    cachedSshOnline = "0 User";
                    cachedUserListDetails = "Semua user offline";
                }
            } else {
                cachedSshOnline = "0 User";
                cachedUserListDetails = "Semua user offline";
            }
        });
    }, 4000);
});
