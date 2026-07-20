require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const PANEL_PASSWORD = process.env.PANEL_PASSWORD || 'changeme';
const CONFIG_PATH = path.join(__dirname, 'config.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// AUTH — simple token gate so the panel (and
// the API key / creds it holds) isn't wide open
// ============================================
let activeToken = null;

function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.replace('Bearer ', '');
    if (!activeToken || token !== activeToken) {
        return res.status(401).json({ error: 'Login required' });
    }
    next();
}

app.post('/api/login', (req, res) => {
    const { password } = req.body || {};
    if (password !== PANEL_PASSWORD) {
        return res.status(401).json({ error: 'Galat password' });
    }
    activeToken = crypto.randomBytes(24).toString('hex');
    res.json({ token: activeToken });
});

// ============================================
// CONFIG — get / save
// ============================================
function readConfig() {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function writeConfig(cfg) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

app.get('/api/config', requireAuth, (req, res) => {
    res.json(readConfig());
});

app.post('/api/config', requireAuth, (req, res) => {
    const current = readConfig();
    const allowed = ['ownerNumber', 'botName', 'ownerName', 'prefix', 'geminiApiKey', 'geminiModel'];
    for (const key of allowed) {
        if (req.body[key] !== undefined && req.body[key] !== '') {
            current[key] = req.body[key];
        }
    }
    writeConfig(current);
    res.json({ ok: true, config: current });
});

// ============================================
// CREDS.JSON UPLOAD
// ============================================
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

app.post('/api/creds', requireAuth, upload.single('creds'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Koi file nahi mili' });

    let parsed;
    try {
        parsed = JSON.parse(req.file.buffer.toString('utf8'));
    } catch (e) {
        return res.status(400).json({ error: 'Ye valid JSON file nahi hai' });
    }

    const cfg = readConfig();
    const sessionDir = path.join(__dirname, cfg.sessionDir.replace('./', ''));
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'creds.json'), JSON.stringify(parsed, null, 2));

    res.json({ ok: true });
});

app.get('/api/creds/status', requireAuth, (req, res) => {
    const cfg = readConfig();
    const sessionDir = path.join(__dirname, cfg.sessionDir.replace('./', ''));
    const exists = fs.existsSync(path.join(sessionDir, 'creds.json'));
    res.json({ exists });
});

// ============================================
// BOT PROCESS CONTROL
// ============================================
let botProcess = null;
let botStartedAt = null;
const logBuffer = [];
const MAX_LOG_LINES = 500;
const logClients = [];

function pushLog(line) {
    const entry = { time: new Date().toISOString(), line };
    logBuffer.push(entry);
    if (logBuffer.length > MAX_LOG_LINES) logBuffer.shift();
    for (const client of logClients) {
        client.write(`data: ${JSON.stringify(entry)}\n\n`);
    }
}

app.post('/api/start', requireAuth, (req, res) => {
    if (botProcess) {
        return res.status(400).json({ error: 'Bot pehle se chal raha hai' });
    }

    const cfg = readConfig();
    const sessionDir = path.join(__dirname, cfg.sessionDir.replace('./', ''));
    if (!fs.existsSync(path.join(sessionDir, 'creds.json'))) {
        return res.status(400).json({ error: 'creds.json missing — pehle upload karo' });
    }
    if (!cfg.geminiApiKey || cfg.geminiApiKey === 'YOUR_GEMINI_API_KEY') {
        return res.status(400).json({ error: 'Gemini API key set nahi hai' });
    }

    botProcess = spawn('node', ['bot.js'], { cwd: __dirname });
    botStartedAt = Date.now();
    pushLog('▶️ Bot process start kiya gaya');

    botProcess.stdout.on('data', (data) => {
        data.toString().split('\n').filter(Boolean).forEach(pushLog);
    });
    botProcess.stderr.on('data', (data) => {
        data.toString().split('\n').filter(Boolean).forEach((l) => pushLog(`[ERR] ${l}`));
    });
    botProcess.on('exit', (code) => {
        pushLog(`⏹️ Bot process exit ho gaya (code ${code})`);
        botProcess = null;
        botStartedAt = null;
    });

    res.json({ ok: true });
});

app.post('/api/stop', requireAuth, (req, res) => {
    if (!botProcess) {
        return res.status(400).json({ error: 'Bot chal hi nahi raha' });
    }
    botProcess.kill();
    res.json({ ok: true });
});

app.get('/api/status', requireAuth, (req, res) => {
    res.json({
        running: !!botProcess,
        pid: botProcess ? botProcess.pid : null,
        startedAt: botStartedAt,
    });
});

app.get('/api/logs', requireAuth, (req, res) => {
    res.json(logBuffer);
});

app.get('/api/logs/stream', (req, res) => {
    // token passed as query param since EventSource can't set headers
    const token = req.query.token;
    if (!activeToken || token !== activeToken) {
        return res.status(401).end();
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    logClients.push(res);
    req.on('close', () => {
        const idx = logClients.indexOf(res);
        if (idx !== -1) logClients.splice(idx, 1);
    });
});

app.listen(PORT, () => {
    console.log(`\n🖥️  Bot control panel: http://localhost:${PORT}`);
    console.log(`🔑 Panel password: ${PANEL_PASSWORD === 'changeme' ? 'changeme (env me PANEL_PASSWORD set karo!)' : '(set)'}\n`);
});
