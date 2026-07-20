# Bot Control Panel

Ab script edit karne ki zaroorat nahi. Sab kuch — Gemini API key, owner number,
bot name, prefix, aur WhatsApp session (`creds.json`) — ek website se set hota hai,
aur bot wahi se Start/Stop hota hai.

## Kaise chalayein

1. **Install karo:**
   ```
   npm install
   ```

2. **Password set karo:**
   `.env.example` ko `.env` me copy karo aur `PANEL_PASSWORD` change kar do:
   ```
   cp .env.example .env
   ```
   Isme apna khud ka strong password daalo — panel me Gemini key aur WhatsApp
   session hoga, isliye default password mat chhodo.

3. **Server start karo:**
   ```
   npm start
   ```
   Terminal me link milega: `http://localhost:3000`

4. **Browser me kholo, login karo** (wahi password jo `.env` me daala).

5. **Panel me:**
   - Bot name, owner name, owner number, prefix, Gemini API key aur model bhar ke
     **Save config** dabao.
   - **creds.json** upload karo (WhatsApp linked-device session file — ye tumhare
     paas already honi chahiye, jaise pairing se generate hui ho).
   - **Start bot** dabao. Live log neeche terminal box me dikhega.
   - Jab chaho **Stop bot** dabake process band kar sakte ho.

## Deploy karna hai (VPS / Render / Railway waghera)

- `PANEL_PASSWORD` env variable zaroor set karo (kabhi bhi `changeme` na chhodo).
- `config.json` aur `auth_info_baileys/` folder persistent disk pe rakhna —
  restart pe delete nahi hone chahiye.
- Agar public URL pe daal rahe ho, HTTPS ke peeche rakho (Gemini key aur WhatsApp
  session dono sensitive hain).

## File structure

```
server.js        → panel backend (config save, creds upload, start/stop, logs)
bot.js            → wahi bot logic, ab config.json se settings leta hai
config.json       → panel se update hone wali settings (git me commit mat karo)
public/index.html → dashboard UI
auth_info_baileys/→ WhatsApp session (creds.json yahan store hoti hai)
```
