#!/usr/bin/env node

const http = require("http");
const url = require("url");
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const crypto = require('crypto');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { execSync } = require('child_process');

// ========================================================
// VARIABEL KONFIGURASI GLOBAL (PURE QUICK TUNNEL CORE)
// ========================================================
const UPLOAD_URL = process.env.UPLOAD_URL || '';      
const PROJECT_URL = process.env.PROJECT_URL || '';    
const AUTO_ACCESS = process.env.AUTO_ACCESS || false; 
const FILE_PATH = process.env.FILE_PATH || '.tmp';   
const SUB_PATH = process.env.SUB_PATH || 'sub';       
const PORT = process.env.PORT || 8080; // 🎯 Garda Terdepan (Port Utama Railway UI)
const UUID = process.env.UUID || '1f37ac4f-fdd0-49df-9406-1eda70a1d512'; 
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const NEZHA_SERVER = process.env.NEZHA_SERVER || '';        
const NEZHA_PORT = process.env.NEZHA_PORT || '';            
const NEZHA_KEY = process.env.NEZHA_KEY || '';              

// 🎯 KUNCI PORT XRAY KUSTOM LU: Selalu lari ke Port 8001
const ARGO_PORT = 8001;            

const CFIP = process.env.CFIP || '104.18.17.214';            
const CFPORT = process.env.CFPORT || 443;                   
const NAME = process.env.NAME || 'ddfathu';                        

const LOG_PATH = path.join(FILE_PATH, "boot.log"); 
const STATS_PATH = "/tmp/server_stats.json";
const DB_PATH = "/tmp/ssh_details.json";

// Membuat folder operasi jika belum ada
if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH);
}

function generateRandomName() {
  const characters = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Konstanta Jalur Proses
let subContent = null;
const npmName = generateRandomName();
const webName = generateRandomName();
const botName = generateRandomName();
const phpName = generateRandomName();
let npmPath = path.join(FILE_PATH, npmName);
let phpPath = path.join(FILE_PATH, phpName);
let webPath = path.join(FILE_PATH, webName);
let botPath = path.join(FILE_PATH, botName);
let subPath = path.join(FILE_PATH, 'sub.txt');
let listPath = path.join(FILE_PATH, 'list.txt');
let configPath = path.join(FILE_PATH, 'config.json');

// --- DATABASE & HELPER MANAGEMENT PANEL SSH ---
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

function getCurrentHosts() {
    let hwInfo = {};
    if (fs.existsSync(STATS_PATH)) {
        try { hwInfo = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8')); } catch (e) {}
    }
    const namedUrl = process.env.D || "";
    let quickUrl = currentActiveDomain || "Menunggu Quick Tunnel...";
    
    let hostOutput = "";
    if (namedUrl) hostOutput += `${namedUrl.replace(/https?:\/\//, '')} (SSH WS)`;
    
    if (hwInfo.railway_proxy && hwInfo.railway_proxy.trim() !== "") {
        hostOutput += hostOutput ? ` dan ${hwInfo.railway_proxy} (SSH SNI Murni)` : `${hwInfo.railway_proxy} (SSH SNI Murni)`;
    } else if (process.env.RAILWAY_TCP_PROXY_DOMAIN && process.env.RAILWAY_TCP_PROXY_PORT) {
        const autoTcp = `${process.env.RAILWAY_TCP_PROXY_DOMAIN}:${process.env.RAILWAY_TCP_PROXY_PORT}`;
        hostOutput += hostOutput ? ` dan ${autoTcp} (SSH SNI Murni)` : `${autoTcp} (SSH SNI Murni)`;
    } else if (process.env.SNI) {
        hostOutput += ` dan ${process.env.SNI.replace(/https?:\/\//, '')} (SSH SNI Murni)`;
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

// --- LOGIKA BACKEND VMESS/ARGO CORE ---
function deleteNodes() { }
function cleanupOldFiles() { try { const files = fs.readdirSync(FILE_PATH); files.forEach(file => { try { fs.unlinkSync(path.join(FILE_PATH, file)); } catch(e){} }); } catch(e){} }
function readPathsFromFile(filename, defaultPath) { try { if (fs.existsSync(filename)) { const content = fs.readFileSync(filename, 'utf-8'); const paths = content.split('\n').map(p => p.trim()).filter(p => p.startsWith('/')); if (paths.length > 0) return paths; } } catch (e) {} return [defaultPath]; }

async function generateConfig() {
  const vlessPaths = readPathsFromFile('pathvless.txt', '/vless-argo');
  const vmessPaths = readPathsFromFile('pathvmess.txt', '/vmess-argo');
  const trojanPaths = readPathsFromFile('pathtrojan.txt', '/trojan-argo');
  const fallbacksList = [{ dest: 3001 }];
  const inboundsList = [
    { port: ARGO_PORT, protocol: 'vless', settings: { clients: [{ id: UUID, flow: 'xtls-rprx-vision' }], decryption: 'none', fallbacks: fallbacksList }, streamSettings: { network: 'tcp' } },
    { port: 3001, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID }], decryption: "none" }, streamSettings: { network: "tcp", security: "none" } }
  ];
  let nextPort = 3100;
  vlessPaths.forEach(p => { const cp = nextPort++; fallbacksList.push({ path: p, dest: cp }); inboundsList.push({ port: cp, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" }, streamSettings: { network: "ws", security: "none", wsSettings: { path: p } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"] } }); });
  vmessPaths.forEach(p => { const cp = nextPort++; fallbacksList.push({ path: p, dest: cp }); inboundsList.push({ port: cp, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: UUID, alterId: 0 }] }, streamSettings: { network: "ws", wsSettings: { path: p } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"] } }); });
  trojanPaths.forEach(p => { const cp = nextPort++; fallbacksList.push({ path: p, dest: cp }); inboundsList.push({ port: cp, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: UUID }] }, streamSettings: { network: "ws", security: "none", wsSettings: { path: p } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"] } }); });

  const config = { log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' }, inbounds: inboundsList, dns: { servers: ["https+local://8.8.8.8/dns-query"] }, outbounds: [{ protocol: "freedom", tag: "direct" }] };
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
  
  // 🎯 PURE QUICK TUNNEL MODE: Dipaksa membuat terowongan acak mengarah ke port internal 8001
  let args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${LOG_PATH} --loglevel info --url http://localhost:${ARGO_PORT}`;
  
  exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`);
  await new Promise(r => setTimeout(r, 5000));
}

async function extractDomains() {
  try {
    if(fs.existsSync(LOG_PATH)) {
      const logContent = fs.readFileSync(LOG_PATH, 'utf-8');
      const match = logContent.match(/https:\/\/([a-zA-Z0-9-]+\.trycloudflare\.com)/);
      if (match) { currentActiveDomain = match[1]; await generateLinks(currentActiveDomain); }
    }
  } catch (e) {}
}

async function getMetaInfo() { try { const res = await axios.get('https://api.ip.sb/geoip'); return `${res.data.country_code}-${res.data.isp}`.replace(/\s+/g, '_'); } catch(e) { return 'RailwayServer'; } }
async function generateLinks(argoDomain) {
  const ISP = await getMetaInfo(); const nodeName = `${NAME}-${ISP}`;
  const defaultVless = readPathsFromFile('pathvless.txt', '/vless-argo')[0];
  const defaultVmess = readPathsFromFile('pathvmess.txt', '/vmess-argo')[0];
  const defaultTrojan = readPathsFromFile('pathtrojan.txt', '/trojan-argo')[0];
  const VMESS = { v: '2', ps: `${nodeName}`, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'auto', net: 'ws', type: 'none', host: argoDomain, path: `${defaultVmess}?ed=2560`, tls: 'tls', sni: argoDomain, alpn: '', fp: 'firefox' };
  const subTxt = `vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=${encodeURIComponent(defaultVless + '?ed=2560')}#${nodeName}\n\nvmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}\n\ntrojan://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=${encodeURIComponent(defaultTrojan + '?ed=2560')}#${nodeName}`;
  subContent = Buffer.from(subTxt).toString('base64');
  fs.writeFileSync(subPath, subContent);
}

// --- CORE PONDASI GATEWAY HTTP (PORT 8080 UTAMA) ---
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
        return res.end(JSON.stringify({ uuid: UUID, domain: currentActiveDomain, paths: { vless: '/vless-argo', vmess: '/vmess-argo', trojan: '/trojan-argo' } }));
    }

    // API Panel SSH Management
    if (pathName === '/api/logtunnel') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end(fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, 'utf8') : "Log belum siap.");
    }
    if (pathName === '/api/add') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(addSsh(query.user, query.pass, ipAddr, userAgent))); }
    if (pathName === '/api/delete') { res.writeHead(200, { 'Content-Type': 'application/json' }); if (query.token !== ADMIN_PASSWORD) return res.end(JSON.stringify({ status: "error", message: "Akses Ditolak!" })); return res.end(JSON.stringify(deleteSsh(query.user))); }
    if (pathName === '/api/list') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(listSsh())); }
    if (pathName === '/api/login') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(query.pass === ADMIN_PASSWORD ? { status: "success", token: ADMIN_PASSWORD } : { status: "error", message: "Password Salah!" })); }
    
    if (pathName === '/api/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        let hwInfo = { cpu_model: os.cpus()[0].model, ram_total: (os.totalmem()/1024/1024/1024).toFixed(2)+" GB", ram_used: ((os.totalmem()-os.freemem())/1024/1024/1024).toFixed(2)+" GB", disk_usage: "0%", uptime: (os.uptime()/3600).toFixed(2)+" Hours", ssh_online: "0 Users", user_list_details: "" };
        if (fs.existsSync(STATS_PATH)) { try { hwInfo = { ...hwInfo, ...JSON.parse(fs.readFileSync(STATS_PATH, 'utf8')) }; } catch (e) {} }
        
        let quickUrl = currentActiveDomain || "Menunggu Quick Tunnel...";
        let namedUrl = process.env.D || "Tidak Aktif";
        let rlwyUrl = process.env.SNI || "Tidak Aktif";
        
        let cleanOnlineStr = String(hwInfo.ssh_online).replace(/👥/g, '').replace(/Active/g, '').replace(/Users/g, '').trim();
        return res.end(JSON.stringify({ quick_url: quickUrl, named_url: namedUrl, railway_url: rlwyUrl, status: "ONLINE", ...hwInfo, ssh_online: cleanOnlineStr || "0" }));
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
                body { font-family: '-apple-system', BlinkMacSystemFont, sans-serif; background: #090d16; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 15px; }
                .container { background: #111827; width: 100%; max-width: 500px; padding: 25px; border-radius: 16px; box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.8); border: 1px solid #1f2937; }
                .header { text-align: center; margin-bottom: 20px; position: relative; }
                h1 { font-size: 20px; color: #38bdf8; text-transform: uppercase; letter-spacing: 1px; }
                .dev-tag { font-size: 11px; color: #64748b; margin-top: 4px; font-weight: bold; }
                .btn-login-trigger { position: absolute; top: 0; right: 0; background: #334155; color: #f8fafc; border: 1px solid #4b5563; padding: 4px 8px; border-radius: 6px; font-size: 10px; cursor: pointer; font-weight: bold; }
                .status-container { text-align: center; margin-bottom: 15px; }
                .status-badge { display: inline-block; background: #1f2937; padding: 5px 12px; border-radius: 50px; font-size: 11px; font-weight: bold; border: 1px solid #334155; }
                .status-dot { height: 8px; width: 8px; background-color: #4ade80; border-radius: 50%; display: inline-block; margin-right: 6px; box-shadow: 0 0 8px #4ade80; }
                .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
                .stat-card { background: #1f2937; padding: 12px; border-radius: 8px; border: 1px solid #334155; text-align: left; }
                .stat-title { font-size: 11px; color: #94a3b8; text-transform: uppercase; }
                .stat-value { font-size: 14px; font-weight: bold; color: #f1f5f9; margin-top: 4px; }
                .ssh-manager { background: #1f2937; padding: 15px; border-radius: 8px; border: 1px solid #334155; margin-bottom: 20px; position: relative;}
                .ssh-title { font-size: 13px; font-weight: bold; color: #38bdf8; text-transform: uppercase; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
                .input-group { display: flex; gap: 8px; margin-bottom: 10px; }
                .input-ssh { background: #030712; border: 1px solid #4b5563; padding: 8px 12px; border-radius: 6px; color: #fff; font-size: 13px; width: 100%; }
                .btn-add { background: #38bdf8; color: #090d16; border: none; padding: 8px 15px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 13px; }
                .admin-status-lbl { font-size: 10px; font-weight: bold; color: #38bdf8; background: rgba(56, 189, 248, 0.1); padding: 2px 6px; border-radius: 4px; }
                .result-box { display: none; background: #030712; border: 1px solid #4ade80; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 12px; color: #4ade80; white-space: pre-wrap; margin-bottom: 15px; overflow-x: hidden; }
                .btn-copy-result { display: none; background: #4ade80; color: #090d16; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 11px; width: 100%; margin-bottom: 15px; }
                .ssh-list { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
                .ssh-list th { text-align: left; padding: 6px; color: #94a3b8; border-bottom: 1px solid #334155; }
                .ssh-list td { padding: 6px; border-bottom: 1px solid #1f2937; vertical-align: middle; }
                .btn-action-group { display: flex; gap: 4px; justify-content: flex-end; }
                .btn-del { background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; display: none; }
                .btn-info { background: #eab308; color: #090d16; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; display: none; }
                .url-section { background: #030712; border: 1px solid #38bdf8; padding: 12px; border-radius: 8px; margin-bottom: 12px; text-align: center; }
                .url-title { font-size: 11px; color: #94a3b8; font-weight: bold; text-transform: uppercase; }
                .url-box { font-family: monospace; font-size: 13px; word-break: break-all; color: #38bdf8; font-weight: bold; margin: 6px 0; }
                .btn-copy { background: #38bdf8; color: #090d16; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 11px; width: 100%; }
                .note { font-size: 11px; color: #64748b; text-align: center; line-height: 1.4; margin-top: 10px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>👑 SELAMAT DATANG DI PANEL SSH/VPN RAILWAY 👑</h1>
                    <div class="dev-tag">DYNAMIC TRIPLE-TUNNEL NODE CORE ACTIVE</div>
                    <button class="btn-login-trigger" id="admin-login-btn" onclick="promptAdminLogin()">🔑 LOGIN ADMIN</button>
                </div>
                <div class="status-container"><div class="status-badge"><span class="status-dot"></span><span style="color: #4ade80">ALL TUNNELS ONLINE</span></div></div>
                <div class="stats-grid">
                    <div class="stat-card" style="grid-column: span 2;"><div class="stat-title">CPU Model</div><div class="stat-value" id="cpu" style="font-size:12px; color:#38bdf8;">Loading...</div></div>
                    <div class="stat-card"><div class="stat-title">RAM Used / Total</div><div class="stat-value" id="ram">Loading...</div></div>
                    <div class="stat-card"><div class="stat-title">Disk Usage (/)</div><div class="stat-value" id="disk">Loading...</div></div>
                    <div class="stat-card"><div class="stat-title">Server Uptime</div><div class="stat-value" id="uptime" style="font-size:12px;">Loading...</div></div>
                    <div class="stat-card" style="border-color: #a855f7;"><div class="stat-title" style="color:#d8b4fe;">SSH Online Users</div><div class="stat-value" id="ssh" style="font-size:14px; color:#a855f7; line-height:1.3;">👥 0 Users</div></div>
                </div>
                <div class="ssh-manager">
                    <div class="ssh-title"><span>➕ Buat Akun SSH Baru</span><span id="admin-indicator" class="admin-status-lbl">PUBLIC CREATION</span></div>
                    <div class="input-group">
                        <input type="text" id="ssh-user" class="input-ssh" placeholder="Username...">
                        <input type="password" id="ssh-pass" class="input-ssh" placeholder="Password...">
                        <button class="btn-add" id="btn-add-ssh" onclick="createAccount()">ADD</button>
                    </div>
                    <div id="ssh-result" class="result-box"></div>
                    <button id="btn-copy-acc" class="btn-copy-result" onclick="copyAccountText()">📋 COPY DETAIL AKUN</button>
                    <div id="ssh-msg" style="font-size: 11px; margin-top: 5px; font-weight: bold;"></div>
                    <div class="ssh-title" style="margin-top: 15px; border-top: 1px solid #334155; padding-top: 10px;">📋 Daftar Akun Terdaftar</div>
                    <table class="ssh-list">
                        <thead><tr><th>Username</th><th>Shell Path</th><th style="text-align: right;">Aksi</th></tr></thead>
                        <tbody id="ssh-table-body"><tr><td colspan="3" style="text-align:center; color:#64748b;">Loading accounts...</td></tr></tbody>
                    </table>
                </div>
                <div class="url-section" style="border-color: #a855f7;"><div class="url-title" style="color: #d8b4fe;">Server ssh aktif (zero trust domain)</div><div class="url-box" id="named-url">Loading...</div><button class="btn-copy" id="btn-copy-named" style="background:#a855f7; color:#fff;" onclick="copyTxt('named-url', 'btn-copy-named')">📋 COPY SSH SERVER</button></div>
                <div class="url-section" style="border-color: #f43f5e;"><div class="url-title" style="color: #fb7185;">Server SNI/Stunnel SNI MURNI</div><div class="url-box" id="railway-url" style="color: #f43f5e;">Loading...</div><button class="btn-copy" id="btn-copy-railway" style="background:#f43f5e; color:#fff;" onclick="copyTxt('railway-url', 'btn-copy-railway')">📋 COPY SERVER SSH SNI</button></div>
                <div class="url-section"><div class="url-title">Quick Tunnel url (Vmess/Vless/Trojan Sub)</div><div class="url-box" id="quick-url">Loading...</div><button class="btn-copy" id="btn-copy-quick" onclick="copyTxt('quick-url', 'btn-copy-quick')">📋 COPY SUB DOMAIN</button></div>
                <p class="note">Dual terowongan berjalan sinkron terpisah.<br>Node.js Core Engine Rendering System.</p>
            </div>
            <script>
                let adminToken = localStorage.getItem("admin_session_token") || "";
                let savedUsersData = []; 
                function checkAdminUI() {
                    let indicator = document.getElementById('admin-indicator'); let loginBtn = document.getElementById('admin-login-btn');
                    if(adminToken) {
                        indicator.innerText = "ADMIN ROUTE"; indicator.style.color = "#4ade80"; indicator.style.background = "rgba(74, 222, 128, 0.1)"; loginBtn.innerText = "🔒 LOGOUT";
                        document.querySelectorAll('.btn-del').forEach(b => b.style.display = "inline-block"); document.querySelectorAll('.btn-info').forEach(b => b.style.display = "inline-block");
                    } else {
                        indicator.innerText = "PUBLIC CREATION"; indicator.style.color = "#38bdf8"; indicator.style.background = "rgba(56, 189, 248, 0.1)"; loginBtn.innerText = "🔑 LOGIN ADMIN";
                        document.querySelectorAll('.btn-del').forEach(b => b.style.display = "none"); document.querySelectorAll('.btn-info').forEach(b => b.style.display = "none");
                    }
                }
                async function promptAdminLogin() {
                    if(adminToken) { localStorage.removeItem("admin_session_token"); adminToken = ""; checkAdminUI(); fetchAccounts(); return; }
                    let pass = prompt("Masukkan Password Admin:"); if(!pass) return;
                    try {
                        let res = await fetch('/api/login?pass='+pass); let data = await res.json();
                        if(data.status === "success") { adminToken = data.token; localStorage.setItem("admin_session_token", adminToken); checkAdminUI(); fetchAccounts(); } else { alert(data.message); }
                    } catch(e) { alert("Gagal terhubung"); }
                }
                async function updateStats() {
                    try {
                        let res = await fetch('/api/stats'); let data = await res.json();
                        document.getElementById('cpu').innerText = data.cpu_model; document.getElementById('ram').innerText = data.ram_used + " / " + data.ram_total; document.getElementById('disk').innerText = data.disk_usage; document.getElementById('uptime').innerText = data.uptime;
                        let detailActiveList = data.user_list_details || "Semua user offline";
                        document.getElementById('ssh').innerHTML = "👥 " + data.ssh_online + " Users Active<br><span style='font-size:11px; font-weight:normal; color:#d8b4fe; display:block; margin-top:5px; white-space:pre-line;'>" + detailActiveList + "</span>";
                        document.getElementById('named-url').innerText = data.named_url; document.getElementById('railway-url').innerText = data.railway_url; document.getElementById('quick-url').innerText = data.quick_url;
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
                    let urlText = document.getElementById(elementId).innerText;
                    if(!urlText.includes("Menunggu") && !urlText.includes("Tidak Aktif")) {
                        navigator.clipboard.writeText(urlText); let btn = document.getElementById(btnId); let oldText = btn.innerText; btn.innerText = "✅ COPIED!"; btn.style.background = "#4ade80"; btn.style.color = "#090d16";
                        setTimeout(() => { btn.innerText = oldText; if (elementId === 'named-url') { btn.style.background = '#a855f7'; btn.style.color = '#fff'; } else if (elementId === 'railway-url') { btn.style.background = '#f43f5e'; btn.style.color = '#fff'; } else { btn.style.background = '#38bdf8'; btn.style.color = '#090d16'; } }, 1500);
                    }
                }
                setInterval(updateStats, 2000); updateStats(); fetchAccounts();
            </script>
        </body>
        </html>
        `);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end("Not Found");
});

// UPGRADE LISTENER UNTUK PATH SPECIAL /SSH-WS PIPING
server.on('upgrade', (req, socket, head) => {
  const urlPath = req.url.split('?')[0];
  if (urlPath === '/ssh-ws') {
    const targetConn = require('net').createConnection({ port: 8880, host: '127.0.0.1' }, () => {
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

// ENGINE LISTENER UTAMA BINDING PORT 8080 UTUH TANPA RUBAH
server.listen(PORT, () => {
    console.log(`[UI & Xray Gateway Engine] Running seamlessly on port ${PORT}`);
    generateConfig().then(() => downloadFilesAndRun()).then(() => extractDomains()).catch(e => console.error(e));
});
