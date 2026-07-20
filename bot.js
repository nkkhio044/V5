const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    Browsers,
    DisconnectReason,
    downloadMediaMessage
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIG — ab yeh config.json se load hota hai
// Panel ke through form se update hota hai, script edit
// karne ki zaroorat nahi
// ============================================
const CONFIG_PATH = path.join(__dirname, 'config.json');

function loadConfig() {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
}

const CONFIG = loadConfig();

const startTime = Date.now();

// ============================================
// UPTIME HELPER
// ============================================
function getUptime() {
    const ms = Date.now() - startTime;
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d} din, ${h % 24} ghante, ${m % 60} minute`;
    if (h > 0) return `${h} ghante, ${m % 60} minute, ${s % 60} second`;
    if (m > 0) return `${m} minute, ${s % 60} second`;
    return `${s} second`;
}

function getStartTime() {
    return new Date(startTime).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: true
    });
}

function getCurrentTime() {
    return new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: true
    });
}

// ============================================
// USER DATA
// ============================================
const userHistory = new Map();
const adminList = new Set([CONFIG.ownerNumber]);
let totalMessages = 0;

function isOwner(sender) {
    return sender === CONFIG.ownerNumber + '@s.whatsapp.net' ||
           sender === CONFIG.ownerNumber;
}

function isAdmin(sender) {
    const num = sender.replace('@s.whatsapp.net', '').replace('@g.us', '');
    return adminList.has(num) || isOwner(sender);
}

function getUserHistory(userId) {
    if (!userHistory.has(userId)) userHistory.set(userId, []);
    return userHistory.get(userId);
}

// ============================================
// OPENROUTER AI — Text Reply
// ============================================
async function getGeminiReply(userId, userMessage) {
    try {
        const history = getUserHistory(userId);

        const systemInstruction = `Tu ${CONFIG.botName} hai — ${CONFIG.ownerName} ka WhatsApp AI assistant. Tu bilkul ${CONFIG.ownerName} ki tarah baat karta hai.

${CONFIG.ownerName} ki personality:
- Casual aur friendly hai, "bhai" aur "yaar" aksar use karta hai
- Hindi aur English mix karke baat karta hai (Hinglish)
- Technical cheezein simple karke samjhata hai
- Helpful hai, seedha answer deta hai
- Thoda funny bhi hai
- Short aur natural replies deta hai

Rules:
- Hamesha ${CONFIG.ownerName} ki tarah baat kar
- Kabhi mat bol ki tu AI hai
- Conversation natural rakho.`;

        const messages = [
            {
                role: "system",
                content: systemInstruction
            }
        ];

        const recentHistory = history.slice(-10);

        for (const h of recentHistory) {
            messages.push({
                role: h.role,
                content: h.content
            });
        }

        messages.push({
            role: "user",
            content: userMessage
        });

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CONFIG.openRouterApiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: CONFIG.openRouterModel,
                messages,
                temperature: 0.9,
                max_tokens: 500
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error("OpenRouter Error:", data.error);
            return null;
        }

        const reply = data.choices?.[0]?.message?.content;

        if (!reply) return null;

        history.push({ role: "user", content: userMessage });
        history.push({ role: "assistant", content: reply });

        if (history.length > 20) {
            history.splice(0, history.length - 20);
        }

        return reply;

    } catch (err) {
        console.error("OpenRouter Fetch Error:", err.message);
        return null;
    }
}

// ============================================
// GEMINI AI — Image Vision
// ============================================
async function getGeminiImageReply(userId, imageBase64, caption, mimeType) {
    try {
        const prompt = caption || 'Is image me kya hai? Detail me bata. Hinglish me baat kar.';

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent?key=${CONFIG.geminiApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: {
                        parts: [{ text: `Tu ${CONFIG.botName} hai — ${CONFIG.ownerName} ka WhatsApp AI. Image dekh ke casual Hinglish me bata ki usme kya hai. "bhai" use kar. Natural aur friendly reh.` }]
                    },
                    contents: [{
                        role: 'user',
                        parts: [
                            {
                                inline_data: {
                                    mime_type: mimeType || 'image/jpeg',
                                    data: imageBase64
                                }
                            },
                            { text: prompt }
                        ]
                    }],
                    generationConfig: { maxOutputTokens: 400 }
                })
            }
        );

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;

        const history = getUserHistory(userId);
        history.push({ role: 'user', content: `[Image bheja]: ${prompt}` });
        history.push({ role: 'assistant', content: reply });

        return reply || 'Bhai image theek se nahi dekh paa raha, dobara bhej 😅';

    } catch (err) {
        console.error('Gemini Image Error:', err.message);
        return 'Bhai image process nahi ho paayi 😅';
    }
}

// ============================================
// YOUTUBE SONG DOWNLOAD
// ============================================
async function sendYoutubeSong(sock, msg, query) {
const yts = require('yt-search');
const ytdl = require('@distube/ytdl-core');

async function sendYoutubeSong(sock, msg, query) {
    const jid = msg.key.remoteJid;

    try {
        await sock.sendMessage(jid, { text: `🔍 *"${query}"* dhundh raha hoon YouTube pe...` }, { quoted: msg });

        // 1. YouTube Search
        const searchResult = await yts(query);
        const video = searchResult.videos[0];

        if (!video) {
            return await sock.sendMessage(jid, { text: '❌ Song nahi mila bhai, doosra naam try karo 😅' }, { quoted: msg });
        }

        const title = video.title;
        const videoUrl = video.url;

        await sock.sendMessage(jid, {
            text: `🎵 Mila: *${title}*\n⏱️ Duration: *${video.timestamp}*\n⬇️ Audio download ho raha hai... thodi der ruko bhai`
        }, { quoted: msg });

        // 2. Audio Stream Download
        const stream = ytdl(videoUrl, {
            filter: 'audioonly',
            quality: 'highestaudio',
        });

        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        const audioBuffer = Buffer.concat(chunks);

        // 3. Audio Send
        await sock.sendMessage(jid, {
            audio: audioBuffer,
            mimetype: 'audio/mp4',
            ptt: false,
            fileName: `${title}.mp3`
        }, { quoted: msg });

        await sock.sendMessage(jid, {
            text: `✅ *${title}*\n\n_Enjoy bhai! 🎵_`
        }, { quoted: msg });

    } catch (err) {
        console.error('Song error:', err);
        await sock.sendMessage(jid, {
            text: '❌ Song download nahi hua bhai 😅\nServer error ya song available nahi hai. Dobara try karo.'
        }, { quoted: msg });
    }
}

// ============================================
// HELPER
// ============================================
async function sendMessage(sock, msg, text) {
    await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
}

// ============================================
// COMMANDS
// ============================================

async function cmdHelp(sock, msg, args, sender) {
    const owner = isOwner(sender);
    const admin = isAdmin(sender);

    let text = `╔═══════════════════╗\n`;
    text += `║  🤖 *${CONFIG.botName} BOT HELP*  ║\n`;
    text += `╚═══════════════════╝\n\n`;

    text += `*👤 General Commands:*\n`;
    text += `▸ ${CONFIG.prefix}help — Ye menu\n`;
    text += `▸ ${CONFIG.prefix}ping — Bot speed check\n`;
    text += `▸ ${CONFIG.prefix}about — Bot ki full info\n`;
    text += `▸ ${CONFIG.prefix}ai [sawaal] — AI se directly poochho\n`;
    text += `▸ ${CONFIG.prefix}song [naam] — Song download karo\n`;
    text += `▸ ${CONFIG.prefix}clear — Apni chat history clear karo\n`;
    text += `▸ ${CONFIG.prefix}time — Abhi ka time dekho\n\n`;

    if (admin) {
        text += `*🛡️ Admin Commands:*\n`;
        text += `▸ ${CONFIG.prefix}sticker — Image ko sticker banao\n`;
    }

    if (owner) {
        text += `\n*👑 Owner Commands:*\n`;
        text += `▸ ${CONFIG.prefix}addadmin [num] — Admin banao\n`;
        text += `▸ ${CONFIG.prefix}deladmin [num] — Admin hatao\n`;
        text += `▸ ${CONFIG.prefix}admins — Admin list dekho\n`;
    }

    text += `\n_💡 Ya seedha koi bhi message karo — AI reply karega!_`;
    await sendMessage(sock, msg, text);
}

async function cmdPing(sock, msg) {
    const start = Date.now();
    await sock.sendMessage(msg.key.remoteJid, { text: '🏓 Checking...' }, { quoted: msg });
    const ping = Date.now() - start;
    await sendMessage(sock, msg,
        `🏓 *Pong bhai!*\n\n` +
        `⚡ Speed: ${ping}ms\n` +
        `⏱ Uptime: ${getUptime()}\n` +
        `🕐 Time: ${getCurrentTime()}`
    );
}

async function cmdAbout(sock, msg) {
    const text =
`╔══════════════════════╗
║    🤖 *${CONFIG.botName.toUpperCase()} BOT v2.0*    ║
╚══════════════════════╝

👑 *Owner:* ${CONFIG.ownerName}
🤖 *Bot Name:* ${CONFIG.botName}
🧠 *AI Engine:* Google Gemini
📱 *Platform:* WhatsApp MD
⚡ *Library:* Baileys

━━━━━━━━━━━━━━━━━━━
📊 *Live Stats:*
━━━━━━━━━━━━━━━━━━━
🟢 *Status:* Online
⏱ *Uptime:* ${getUptime()}
🚀 *Online Since:* ${getStartTime()}
🕐 *Current Time:* ${getCurrentTime()}
💬 *Total Messages:* ${totalMessages}
👥 *Active Chats:* ${userHistory.size}
👑 *Total Admins:* ${adminList.size}

━━━━━━━━━━━━━━━━━━━
✨ *Features:*
━━━━━━━━━━━━━━━━━━━
• 🧠 AI Reply (Gemini)
• 🖼️ Image Vision & Analysis
• 🎵 YouTube Song Download
• 🎭 Sticker Maker (Admin)
• 👑 Admin Management
• 💬 Per-User Chat Memory
• 🔄 Auto Reconnect
• ⏱️ Real-time Uptime

_Powered by Google Gemini AI_ 🚀`;
    await sendMessage(sock, msg, text);
}

async function cmdAI(sock, msg, args, sender) {
    if (!args.length) {
        return await sendMessage(sock, msg, `Bhai kuch toh poochh! 😄\nExample: ${CONFIG.prefix}ai Python kya hai?`);
    }
    await sendMessage(sock, msg, '🤔 Gemini soch raha hai...');
    const reply = await getGeminiReply(sender, args.join(' '));
    await sendMessage(sock, msg, reply || 'Bhai Gemini ne koi reply nahi diya 😅');
}

async function cmdSong(sock, msg, args) {
    if (!args.length) {
        return await sendMessage(sock, msg, `❌ Song ka naam daalo!\nExample: ${CONFIG.prefix}song Kesariya`);
    }
    await sendYoutubeSong(sock, msg, args.join(' '));
}

async function cmdClear(sock, msg, args, sender) {
    userHistory.delete(sender);
    await sendMessage(sock, msg, '✅ Teri chat history clear ho gayi bhai! Fresh start 😄');
}

async function cmdTime(sock, msg) {
    await sendMessage(sock, msg,
        `🕐 *Abhi ka Time:*\n\n` +
        `📅 ${getCurrentTime()}\n` +
        `🌍 Timezone: IST (India)`
    );
}

async function cmdSticker(sock, msg, args, sender) {
    if (!isAdmin(sender)) {
        return await sendMessage(sock, msg, '❌ Ye command sirf admin ke liye hai bhai!');
    }

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imageMsg = msg.message?.imageMessage || quoted?.imageMessage;

    if (!imageMsg) {
        return await sendMessage(sock, msg, '❌ Pehle ek image bhejo ya image pe reply me !sticker likho!');
    }

    try {
        await sendMessage(sock, msg, '⏳ Sticker ban raha hai...');
        const targetMsg = msg.message?.imageMessage
            ? msg
            : { message: quoted, key: msg.key };
        const buffer = await downloadMediaMessage(targetMsg, 'buffer', {});
        await sock.sendMessage(msg.key.remoteJid, { sticker: buffer }, { quoted: msg });
    } catch (err) {
        console.error('Sticker error:', err.message);
        await sendMessage(sock, msg, '❌ Sticker nahi bana bhai, image dobara bhej 😅');
    }
}

async function cmdAddAdmin(sock, msg, args, sender) {
    if (!isOwner(sender)) {
        return await sendMessage(sock, msg, `❌ Ye sirf owner (${CONFIG.ownerName}) kar sakta hai!`);
    }
    if (!args.length) {
        return await sendMessage(sock, msg, `❌ Number daalo!\nExample: ${CONFIG.prefix}addadmin 919876543210`);
    }
    const num = args[0].replace(/[^0-9]/g, '');
    adminList.add(num);
    await sendMessage(sock, msg, `✅ *${num}* ko admin bana diya bhai! 👑`);
}

async function cmdDelAdmin(sock, msg, args, sender) {
    if (!isOwner(sender)) {
        return await sendMessage(sock, msg, `❌ Ye sirf owner (${CONFIG.ownerName}) kar sakta hai!`);
    }
    if (!args.length) {
        return await sendMessage(sock, msg, `❌ Number daalo!\nExample: ${CONFIG.prefix}deladmin 919876543210`);
    }
    const num = args[0].replace(/[^0-9]/g, '');
    if (num === CONFIG.ownerNumber) {
        return await sendMessage(sock, msg, '❌ Owner ko remove nahi kar sakte bhai! 😄');
    }
    adminList.delete(num);
    await sendMessage(sock, msg, `✅ *${num}* ko admin list se hata diya!`);
}

async function cmdAdmins(sock, msg, args, sender) {
    if (!isOwner(sender)) {
        return await sendMessage(sock, msg, '❌ Sirf owner dekh sakta hai!');
    }
    let text = `*👑 Admin List:*\n\n`;
    adminList.forEach((num) => {
        text += `${num === CONFIG.ownerNumber ? '👑' : '🛡️'} ${num}${num === CONFIG.ownerNumber ? ' (Owner)' : ''}\n`;
    });
    await sendMessage(sock, msg, text);
}

// ============================================
// COMMAND ROUTER
// ============================================
const commandMap = {
    'help': cmdHelp,
    'ping': cmdPing,
    'about': cmdAbout,
    'ai': cmdAI,
    'song': cmdSong,
    'clear': cmdClear,
    'time': cmdTime,
    'sticker': cmdSticker,
    'addadmin': cmdAddAdmin,
    'deladmin': cmdDelAdmin,
    'admins': cmdAdmins,
};

// ============================================
// MESSAGE HANDLER
// ============================================
async function handleMessage(sock, msg) {
    try {
        if (msg.key.fromMe) return;

        totalMessages++;
        const sender = msg.key.remoteJid;
        const senderNum = msg.key.participant || sender;

        const imageMsg = msg.message?.imageMessage;
        if (imageMsg) {
            console.log(`[IMAGE] From: ${senderNum}`);
            await sock.sendMessage(sender, { text: '👁️ Image dekh raha hoon bhai...' }, { quoted: msg });

            try {
                const buffer = await downloadMediaMessage(msg, 'buffer', {});
                const base64 = buffer.toString('base64');
                const mimeType = imageMsg.mimetype || 'image/jpeg';
                const caption = imageMsg.caption || '';
                const reply = await getGeminiImageReply(senderNum, base64, caption, mimeType);
                await sendMessage(sock, msg, reply);
            } catch (err) {
                console.error('Image error:', err.message);
                await sendMessage(sock, msg, 'Bhai image process nahi ho paayi 😅 Dobara try karo.');
            }
            return;
        }

        const body = msg.message?.conversation ||
                     msg.message?.extendedTextMessage?.text || '';

        if (!body) return;

        console.log(`[MSG] ${senderNum}: ${body}`);

        if (body.startsWith(CONFIG.prefix)) {
            const parts = body.slice(CONFIG.prefix.length).trim().split(' ');
            const cmdName = parts[0].toLowerCase();
            const args = parts.slice(1);

            const handler = commandMap[cmdName];
            if (handler) {
                console.log(`[CMD] ${cmdName}`);
                await handler(sock, msg, args, senderNum);
            } else {
                await sendMessage(sock, msg,
                    `Ye command nahi pata bhai 😅\nType *${CONFIG.prefix}help* for all commands.`
                );
            }
            return;
        }

        console.log(`[AI] Getting OpenRouter reply for: ${body}`);
        const aiReply = await getGeminiReply(senderNum, body);

        if (aiReply) {
            await sendMessage(sock, msg, aiReply);
        } else {
            await sendMessage(sock, msg, 'Bhai kuch technical issue ho gaya, dobara try karo 😅');
        }

    } catch (err) {
        console.error('[ERROR]', err.message);
    }
}

// ============================================
// BOT START
// ============================================
async function startBot() {
    const credsPath = path.join(CONFIG.sessionDir, 'creds.json');
    if (!fs.existsSync(credsPath)) {
        console.log('❌ creds.json nahi mila!');
        console.log(`👉 Panel se creds.json upload karo, ya ${CONFIG.sessionDir}/ folder me daalo`);
        process.exit(1);
    }

    const { version } = await fetchLatestBaileysVersion();
    console.log(`\n🤖 ${CONFIG.botName} Bot Starting...`);
    console.log(`✅ WA Version: ${version.join('.')}`);
    console.log(`🧠 AI: OpenRouter (${CONFIG.openRouterModel})`);

    const { state, saveCreds } = await useMultiFileAuthState(CONFIG.sessionDir);

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log(`\n✅ ${CONFIG.botName} Bot Connected!`);
            console.log(`👑 Owner: ${CONFIG.ownerName}`);
            console.log(`🕐 Online Since: ${getStartTime()}`);
            console.log(`🚀 Ready to reply!\n`);
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`❌ Disconnected. Code: ${statusCode}`);
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log('🔄 3 sec me reconnect ho raha hai...');
                setTimeout(startBot, 3000);
            } else {
                console.log('🚪 Logged out. Panel se dobara creds.json daalo.');
                process.exit(0);
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
            await handleMessage(sock, msg);
        }
    });
}

startBot().catch((err) => {
    console.error(err);
    process.exit(1);
});
