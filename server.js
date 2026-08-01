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

// 🎯 FIX MURNI: Dikunci ke port 8081 agar tidak terhantam error EADDRINUSE saat TCP Proxy Railway aktif
const PORT = 8081; 

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

// 🛠️ PERBAIKAN 1: Menyelaraskan path log ke target ekstraksi domain (.tmp/boot.log)
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

// 🛠️ PERBAIKAN 2: Pengecekan variabel TCP Proxy bawaan Railway ke urutan teratas
function getCurrentHosts() {
    let hwInfo = {};
    if (fs.existsSync(STATS_PATH)) {
        try { hwInfo = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8')); } catch (e) {}
    }
    const namedUrl = process.env.D || "";
    let quickUrl = currentActiveDomain || "Menunggu Quick Tunnel...";
    
    let hostOutput = "";
    if (namedUrl) hostOutput += `${namedUrl.replace(/https?:\/\//, '')} (SSH WS)`;
    
    if (process.env.RAILWAY_TCP_PROXY_DOMAIN && process.env.RAILWAY_TCP_PROXY_PORT) {
        const autoTcp = `${process.env.RAILWAY_TCP_PROXY_DOMAIN}:${process.env.RAILWAY_TCP_PROXY_PORT}`;
        hostOutput += hostOutput ? ` dan ${autoTcp}` : `${autoTcp}`;
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
  
  // Pure Quick Tunnel Mode ke 8001
  let args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${LOG_PATH} --loglevel info --url http://localhost:${ARGO_PORT}`;
  
  exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`);
  await new Promise(r => setTimeout(r, 5000));
}

// 🎯 HAK PATEN LOOP TUNNEL: Mengekstrak domain secara realtime berulang-ulang
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
  const defaultVless = readPathsFromFile('pathvless.txt', '/vless-argo')[0];
  const defaultVmess = readPathsFromFile('pathvmess.txt', '/vmess-argo')[0];
  const defaultTrojan = readPathsFromFile('pathtrojan.txt', '/trojan-argo')[0];
  const VMESS = { v: '2', ps: `${nodeName}`, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'auto', net: 'ws', type: 'none', host: argoDomain, path: `${defaultVmess}?ed=2560`, tls: 'tls', sni: argoDomain, alpn: '', fp: 'firefox' };
  const subTxt = `vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=${encodeURIComponent(defaultVless + '?ed=2560')}#${nodeName}\n\nvmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}\n\ntrojan://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=${encodeURIComponent(defaultTrojan + '?ed=2560')}#${nodeName}`;
  subContent = Buffer.from(subTxt).toString('base64');
  fs.writeFileSync(subPath, subContent);
}

// --- CORE PONDASI GATEWAY HTTP (PORT KUSTOM INTERNAL 8081) ---
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

    // 🎯 OUTPUT EXTENSION UNTUK UI: Menyediakan token UUID dan domain tunnel realtime ke antarmuka web
    if (pathName === '/__info') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const defaultVless = readPathsFromFile('pathvless.txt', '/vless-argo')[0];
        const defaultVmess = readPathsFromFile('pathvmess.txt', '/vmess-argo')[0];
        const defaultTrojan = readPathsFromFile('pathtrojan.txt', '/trojan-argo')[0];
        return res.end(JSON.stringify({ 
            uuid: UUID, 
            domain: currentActiveDomain || "Menunggu Quick Tunnel...", 
            paths: { vless: defaultVless, vmess: defaultVmess, trojan: defaultTrojan } 
        }));
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
        
        let rlwyUrl = process.env.RAILWAY_TCP_PROXY_DOMAIN && process.env.RAILWAY_TCP_PROXY_PORT
            ? `${process.env.RAILWAY_TCP_PROXY_DOMAIN}:${process.env.RAILWAY_TCP_PROXY_PORT}`
            : (process.env.SNI || "Tidak Aktif");
        
        let cleanOnlineStr = String(hwInfo.ssh_online).replace(/👥/g, '').replace(/Active/g, '').replace(/Users/g, '').trim();
        return res.end(JSON.stringify({ quick_url: quickUrl, named_url: namedUrl, railway_url: rlwyUrl, status: "ONLINE", ...hwInfo, ssh_online: cleanOnlineStr || "0" }));
    }

    // 🎯 INJEKSI MANDIRI KODE UI BARU: JetBrains Mono Blue Terminal Integrated Engine
    if (pathName === '/' || pathName === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ddfathuvles // SERVER GATEWAY</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&display=swap');
    body { font-family: 'JetBrains Mono', monospace; background-color: #060919; }
    .card-blue { background-color: #0c132b; border: 1px solid #1e295b; }
    .btn-blue { background-color: #131d42; border: 1px solid #283c79; color: #93c5fd; }
    .btn-blue:hover { border-color: #3b82f6; color: #fff; background-color: #1a2756; }
    .btn-active { border-color: #60a5fa !important; color: #fff !important; background-color: #1d4ed8 !important; }
  </style>
</head>
<body class="text-blue-200 min-h-screen flex flex-col justify-between p-4 max-w-md mx-auto selection:bg-blue-600 selection:text-white">

  <main class="space-y-4 flex-grow mt-4">
    <!-- WELCOME TEXT BANNER -->
    <div class="text-center card-blue p-4 rounded-xl border-dashed border-blue-500">
      <h1 class="text-lg font-bold text-white tracking-wider mb-2">⚡ DDFATHUVLES<span class="text-blue-400">.sys</span></h1>
      <p class="text-xs text-blue-300 leading-relaxed">
        Selamat datang di server vless vmess trojan railway ddfathu. Silahkan buat config di bawah ini yang sesuai dengan bug mu.
      </p>
      <div class="flex justify-center items-center gap-2 mt-3 border-t border-blue-950/50 pt-3">
        <span class="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
        <p class="text-[11px] text-emerald-300 font-bold tracking-widest">ONLINE CLIENTS: 1 ORG</p>
      </div>
    </div>

    <!-- LIVE CONNECTED IP LIST BOX -->
    <div class="card-blue p-3 rounded-xl">
      <p class="text-[9px] text-blue-400 font-bold tracking-wider mb-1.5 uppercase">🌐 Active Connected IP Address</p>
      <div class="bg-[#040610] rounded-lg p-2 border border-blue-950">
        <div id="ip-list-area" class="text-[11px] text-blue-400/70 py-1 font-mono">● 127.0.0.1 <span class="text-emerald-400 font-bold">(You)</span></div>
      </div>
    </div>

    <!-- CONFIG CONTROL BOX -->
    <div class="card-blue p-4 rounded-xl space-y-4">
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div>
          <label class="text-[10px] text-blue-400 font-bold block mb-1">UUID/PASS</label>
          <input id="uuidInput" type="text" value="Loading..." class="w-full bg-[#060917] border border-blue-900 rounded p-1.5 text-white font-mono focus:outline-none focus:border-blue-500">
        </div>
        <div>
          <label class="text-[10px] text-blue-400 font-bold block mb-1">HOST DOMAIN</label>
          <input id="hostInput" type="text" value="Loading..." class="w-full bg-[#060917] border border-blue-900 rounded p-1.5 text-white font-mono focus:outline-none focus:border-blue-500">
        </div>
      </div>

      <!-- KOLOM INPUT BUG HOST -->
      <div>
        <label class="text-[10px] text-blue-400 font-bold block mb-1">BUG HOST (SNI / CDN)</label>
        <input id="bugInput" type="text" value="suporte.garena.com" class="w-full bg-[#060917] border border-blue-900 rounded p-1.5 text-white font-mono focus:outline-none focus:border-blue-500">
      </div>

      <!-- KATEGORI 1: NORMAL BUG SNI -->
      <div class="space-y-2">
        <div class="border-l-2 border-blue-500 pl-2">
          <p class="text-[11px] font-bold text-blue-200 tracking-wider">BUG SNI (NORMAL / STANDAR)</p>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <button onclick="buildConfig('vless', 'sni')" class="btn-blue py-2 rounded-lg text-xs font-bold tracking-widest transition-all">VLESS STD</button>
          <button onclick="buildConfig('vmess', 'sni')" class="btn-blue py-2 rounded-lg text-xs font-bold tracking-widest transition-all">VMESS STD</button>
          <button onclick="buildConfig('trojan', 'sni')" class="btn-blue py-2 rounded-lg text-xs font-bold tracking-widest transition-all">TROJAN STD</button>
        </div>
      </div>

      <!-- KATEGORI 2: REVERSE BUG SNI -->
      <div class="space-y-2">
        <div class="border-l-2 border-amber-500 pl-2">
          <p class="text-[11px] font-bold text-amber-200 tracking-wider">BUG SNI (REVERSE / GAMBAR 2 STYLE)</p>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <button onclick="buildConfig('vless', 'sni_reverse')" class="btn-blue py-2 rounded-lg text-xs font-bold tracking-widest transition-all text-amber-300 border-amber-950">VLESS REV</button>
          <button onclick="buildConfig('vmess', 'sni_reverse')" class="btn-blue py-2 rounded-lg text-xs font-bold tracking-widest transition-all text-amber-300 border-amber-950">VMESS REV</button>
          <button onclick="buildConfig('trojan', 'sni_reverse')" class="btn-blue py-2 rounded-lg text-xs font-bold tracking-widest transition-all text-amber-300 border-amber-950">TROJAN REV</button>
        </div>
      </div>

      <!-- KATEGORI 3: CDN WEBSOCKET WS -->
      <div class="space-y-2">
        <div class="border-l-2 border-indigo-500 pl-2">
          <p class="text-[11px] font-bold text-indigo-200 tracking-wider">BUG CDN (WEBSOCKET PROXY)</p>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <button onclick="buildConfig('vless', 'cdn')" class="btn-blue py-2 rounded-lg text-xs font-bold tracking-widest transition-all">VLESS</button>
          <button onclick="buildConfig('vmess', 'cdn')" class="btn-blue py-2 rounded-lg text-xs font-bold tracking-widest transition-all">VMESS</button>
          <button onclick="buildConfig('trojan', 'cdn')" class="btn-blue py-2 rounded-lg text-xs font-bold tracking-widest transition-all">TROJAN</button>
        </div>
      </div>

      <!-- AREA OUTPUT CONFIG -->
      <div id="output-area" class="hidden space-y-1.5 bg-[#040610] p-3 rounded-lg border border-blue-950">
        <div class="flex justify-between items-center">
          <span id="out-type" class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500 text-white">VLESS</span>
          <button onclick="copyOutConfig()" class="text-[10px] text-blue-400 font-bold hover:underline">COPY</button>
        </div>
        <p id="configText" class="text-[11px] font-mono text-blue-100 break-all bg-black/40 p-2 rounded border border-blue-950 max-h-24 overflow-y-auto">Loading...</p>
      </div>
    </div>
  </main>

  <footer class="text-center text-[10px] text-blue-500 mt-6">&copy; 2026 DDFATHUVLES BLUE TERMINAL.</footer>

  <script>
    async function fetchServerInfo() {
      try {
        const response = await fetch('/__info');
        if (!response.ok) return;
        const data = await response.json();
        
        if (data.uuid) document.getElementById('uuidInput').value = data.uuid;
        if (data.domain) document.getElementById('hostInput').value = data.domain;
        if (data.paths) window.serverActivePaths = data.paths;
      } catch (e) {
        console.error("Gagal sinkronisasi data dari backend server.");
      }
    }

    fetchServerInfo();

    try {
      fetch('https://api.ip.sb/geoip')
        .then(res => res.json())
        .then(data => {
          if(data.ip) {
            document.getElementById('ip-list-area').innerHTML = \`● \` + data.ip + \` <span class="text-emerald-400 font-bold">(You)</span>\`;
          }
        }).catch(e => {});
    } catch(e) {}

    function buildConfig(protocol, type) {
      document.querySelectorAll('button').forEach(b => b.classList.remove('btn-active'));
      if(event && event.target) event.target.classList.add('btn-active');
      
      const uuid = document.getElementById('uuidInput').value.trim();
      const host = document.getElementById('hostInput').value.trim(); 
      const bugHost = document.getElementById('bugInput').value.trim(); 
      const area = document.getElementById('output-area');
      const label = document.getElementById('out-type');
      const txt = document.getElementById('configText');

      const pathsMapping = window.serverActivePaths || { vless: '/vless-argo', vmess: '/vmess-argo', trojan: '/trojan-argo' };
      let basePath = pathsMapping[protocol] || '/' + protocol + '-argo';
      
      let remark = 'DDFATHU-' + protocol.toUpperCase() + '-' + type.toUpperCase();
      let configResult = '';
      label.innerText = remark;

      if (type === 'sni') {
        if (protocol === 'vless') {
          configResult = 'vless://' + uuid + '@' + bugHost + ':443?encryption=none&security=tls&sni=' + host + '&fp=randomized&type=ws&host=' + host + '&path=' + encodeURIComponent(basePath) + '#' + encodeURIComponent(remark);
        } else if (protocol === 'vmess') {
          let jsonVmess = { v: "2", ps: remark, add: bugHost, port: "443", id: uuid, aid: "0", scy: "auto", net: "ws", type: "none", host: host, path: basePath, tls: "tls", sni: host };
          configResult = 'vmess://' + btoa(JSON.stringify(jsonVmess));
        } else if (protocol === 'trojan') {
          configResult = 'trojan://' + uuid + '@' + bugHost + ':443?security=tls&sni=' + host + '&type=ws&host=' + host + '&path=' + encodeURIComponent(basePath) + '#' + encodeURIComponent(remark);
        }
      } 
      else if (type === 'sni_reverse') {
        if (protocol === 'vless') {
          configResult = 'vless://' + uuid + '@' + host + ':443?encryption=none&security=tls&sni=' + bugHost + '&fp=randomized&type=ws&host=' + bugHost + '&path=' + encodeURIComponent(basePath) + '#' + encodeURIComponent(remark);
        } else if (protocol === 'vmess') {
          let jsonVmess = { v: "2", ps: remark, add: host, port: "443", id: uuid, aid: "0", scy: "auto", net: "ws", type: "none", host: bugHost, path: basePath, tls: "tls", sni: bugHost };
          configResult = 'vmess://' + btoa(JSON.stringify(jsonVmess));
        } else if (protocol === 'trojan') {
          configResult = 'trojan://' + uuid + '@' + host + ':443?security=tls&sni=' + bugHost + '&type=ws&host=' + bugHost + '&path=' + encodeURIComponent(basePath) + '#' + encodeURIComponent(remark);
        }
      } 
      else if (type === 'cdn') {
        let pathBug = '/' + bugHost + basePath;
        if (protocol === 'vless') {
          configResult = 'vless://' + uuid + '@' + host + ':443?encryption=none&security=tls&sni=' + host + '&fp=randomized&type=ws&host=' + host + '&path=' + encodeURIComponent(pathBug) + '#' + encodeURIComponent(remark);
        } else if (protocol === 'vmess') {
          let jsonVmess = { v: "2", ps: remark, add: host, port: "443", id: uuid, aid: "0", scy: "none", net: "ws", type: "none", host: host, path: pathBug, tls: "tls", sni: host };
          configResult = 'vmess://' + btoa(JSON.stringify(jsonVmess));
        } else if (protocol === 'trojan') {
          configResult = 'trojan://' + uuid + '@' + host + ':443?security=tls&sni=' + host + '&type=ws&host=' + host + '&path=' + encodeURIComponent(pathBug) + '#' + encodeURIComponent(remark);
        }
      }

      txt.innerText = configResult;
      area.classList.remove('hidden');
    }

    function copyOutConfig() {
      navigator.clipboard.writeText(document.getElementById('configText').innerText);
      alert('Config Berhasil Disalin!');
    }
  </script>
</body>
</html>`);
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

// ENGINE LISTENER UTAMA BINDING PORT 8081 UTUH DAN KONSISTEN
server.listen(PORT, () => {
    console.log(`[UI & Xray Gateway Engine] Running seamlessly on port ${PORT}`);
    generateConfig().then(() => downloadFilesAndRun()).then(() => extractDomains()).catch(e => console.error(e));
    
    // Memicu fungsi pencari domain secara berulang setiap 3 detik
    setInterval(() => {
        extractDomains();
    }, 3000);
});
