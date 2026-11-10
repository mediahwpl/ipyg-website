import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const dataDir = resolve(root, 'data');
const certsDir = resolve(root, 'certs');

const port = Number(process.env.PORT) || 5173;
const httpsPort = Number(process.env.HTTPS_PORT) || 8443;
const useHttps = process.argv.includes('--https');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.pem': 'application/x-pem-file'
};

/* ================= Data ================= */
async function readJSON(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}
async function writeJSON(file, data) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

const authFile = resolve(dataDir, 'auth.json');
const newsFile = resolve(dataDir, 'news.json');
const settingsFile = resolve(dataDir, 'settings.json');
const newsUploadDir = resolve(root, 'uploads', 'news');

const defaultSettings = {
  email: 'ipyg.mon@gmail.com',
  instagram: 'ipyg_mongolia',
  facebook: 'IPYG Mongolia',
  fbGroup: '',
  phones: ['90407111', '96886200'],
  address: 'Улаанбаатар, Монгол'
};

/* ================= Auth ================= */
function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString('hex');
}
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
async function ensureAuth() {
  let auth = await readJSON(authFile, null);
  if (!auth) {
    const salt = randomBytes(16).toString('hex');
    auth = {
      username: 'admin',
      salt,
      hash: hashPassword('admin123', salt),
      mustChange: true
    };
    await writeJSON(authFile, auth);
    console.log('[auth] Шинэ админ үүсгэгдлээ -> утга: admin | нууц үг: admin123 (солихыг зөвлөж байна)');
  }
  return auth;
}

const sessions = new Map(); // token -> { username, expires }
const SESSION_TTL = 24 * 60 * 60 * 1000;
const loginAttempts = new Map(); // ip -> { fails, until }

function createSession(username) {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, { username, expires: Date.now() +SESSION_TTL });
  return token;
}
function getSession(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)ipyg_session=([a-f0-9]{64})/);
  if (!match) return null;
  const session = sessions.get(match[1]);
  if (!session || session.expires < Date.now()) {
    sessions.delete(match[1]);
    return null;
  }
  return { token: match[1], username: session.username };
}
function sessionCookie(token, secure) {
  return `ipyg_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL / 1000}${secure ? '; Secure' : ''}`;
}
function clearCookie(secure) {
  return `ipyg_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}
function ipOf(req) {
  return req.socket.remoteAddress || 'unknown';
}
function loginLocked(ip) {
  const entry = loginAttempts.get(ip);
  return entry && entry.until > Date.now();
}

/* ================= API helpers ================= */
function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}
async function readBody(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('body too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('bad json');
  }
}
function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
function cleanImageUrl(value) {
  const src = String(value || '').trim();
  if (/^https?:\/\//i.test(src)) return src;
  if (/^(\/?assets|\/?uploads)\/[\w./-]+$/i.test(src) && !src.includes('..')) return src;
  return '';
}

/* ================= News & Settings ================= */
async function getNews() {
  const news = await readJSON(newsFile, []);
  return Array.isArray(news) ? news : [];
}
async function getSettings() {
  const saved = await readJSON(settingsFile, null);
  return { ...defaultSettings, ...(saved || {}) };
}

/* ================= Request handler ================= */
async function handleRequest(req, res) {
  const secure = Boolean(req.socket.encrypted);
  const url = new URL(req.url, `${secure ? 'https' : 'http'}://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    /* ---------- API ---------- */
    if (pathname.startsWith('/api/')) {
      const session = getSession(req);

      // GET /api/me
      if (pathname === '/api/me' && req.method === 'GET') {
        if (!session) return json(res, 200, { loggedIn: false, username: null });
        const auth = await ensureAuth();
        return json(res, 200, { loggedIn: true, username: session.username, mustChange: Boolean(auth.mustChange) });
      }

      // POST /api/login
      if (pathname === '/api/login' && req.method === 'POST') {
        const ip = ipOf(req);
        if (loginLocked(ip)) {
          return json(res, 429, { error: 'Хэт олон оролдлого. 15 минутын дараа дахин оролдоно уу.' });
        }
        const body = await readBody(req);
        const auth = await ensureAuth();
        const usernameOk = safeEqual(String(body.username || ''), auth.username);
        const passwordOk = safeEqual(hashPassword(String(body.password || ''), auth.salt), auth.hash);
        if (!usernameOk || !passwordOk) {
          const entry = loginAttempts.get(ip) || { fails: 0, until: 0 };
          entry.fails += 1;
          if (entry.fails >= 10) {
            entry.until = Date.now() + 15 * 60 * 1000;
            entry.fails = 0;
          }
          loginAttempts.set(ip, entry);
          return json(res, 401, { error: 'Буруу хэрэглэгчийн нэр эсвэл нууц үг.' });
        }
        loginAttempts.delete(ip);
        const token = createSession(auth.username);
        return json(res, 200, { ok: true, mustChange: Boolean(auth.mustChange) }, {
          'Set-Cookie': sessionCookie(token, secure)
        });
      }

      // POST /api/logout
      if (pathname === '/api/logout' && req.method === 'POST') {
        if (session) sessions.delete(session.token);
        return json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie(secure) });
      }

      // Албан тушаалын API-ууд (login шаардлагатай)
      const requireAuth = () => {
        if (!session) {
          json(res, 401, { error: 'Нэвтрээгүй байна.' });
          return false;
        }
        return true;
      };

      // POST /api/uploads (authenticated image upload for news)
      if (pathname === '/api/uploads' && req.method === 'POST') {
        if (!requireAuth()) return;
        const body = await readBody(req, 7_000_000);
        const match = String(body.data || '').match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/);
        if (!match) return json(res, 400, { error: 'JPG, PNG, WebP эсвэл GIF зураг оруулна уу.' });
        const image = Buffer.from(match[2], 'base64');
        if (!image.length || image.length > 5 * 1024 * 1024) {
          return json(res, 400, { error: 'Зургийн хэмжээ 5 МБ-аас хэтэрч болохгүй.' });
        }
        const extension = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[match[1]];
        const filename = `${Date.now()}-${randomBytes(8).toString('hex')}${extension}`;
        await mkdir(newsUploadDir, { recursive: true });
        await writeFile(resolve(newsUploadDir, filename), image, { flag: 'wx' });
        return json(res, 201, { url: `/uploads/news/${filename}` });
      }

      // GET /api/news (нийтэд нээлттэй)
      if (pathname === '/api/news' && req.method === 'GET') {
        const news = await getNews();
        return json(res, 200, { news });
      }

      // POST /api/news
      if (pathname === '/api/news' && req.method === 'POST') {
        if (!requireAuth()) return;
        const body = await readBody(req);
        if (body.id) {
          const news = await getNews();
          const item = news.find(n => n.id === String(body.id));
          if (!item) return json(res, 404, { error: 'Мэдээ олдсонгүй.' });
          if (body.date !== undefined) item.date = String(body.date).trim();
          if (body.title !== undefined) item.title = String(body.title).trim();
          if (body.text !== undefined) item.text = String(body.text).trim();
          if (body.thumbnail !== undefined) item.thumbnail = cleanImageUrl(body.thumbnail);
          if (body.images !== undefined) item.images = Array.isArray(body.images) ? body.images.map(cleanImageUrl).filter(Boolean) : [];
          await writeJSON(newsFile, news);
          return json(res, 200, { ok: true, item });
        }
        const title = String(body.title || '').trim();
        const date = String(body.date || '').trim();
        const text = String(body.text || '').trim();
        if (!title || !date) return json(res, 400, { error: 'Огноо болон гарчиг шаардлагатай.' });
        const news = await getNews();
        const item = {
          id: `${Date.now()}-${randomBytes(3).toString('hex')}`,
          date,
          title,
          text,
          thumbnail: cleanImageUrl(body.thumbnail),
          images: Array.isArray(body.images) ? body.images.map(cleanImageUrl).filter(Boolean) : [],
          createdAt: new Date().toISOString()
        };
        news.unshift(item);
        await writeJSON(newsFile, news);
        return json(res, 201, { ok: true, item });
      }

      // PUT /api/news/:id
      const newsMatch = pathname.match(/^\/api\/news\/([^/]+)$/);
      if (newsMatch && req.method === 'PUT') {
        if (!requireAuth()) return;
        const id = decodeURIComponent(newsMatch[1]);
        const body = await readBody(req);
        const news = await getNews();
        const item = news.find(n => n.id === id);
        if (!item) return json(res, 404, { error: 'Мэдээ олдсонгүй.' });
        if (body.date !== undefined) item.date = String(body.date).trim();
        if (body.title !== undefined) item.title = String(body.title).trim();
        if (body.text !== undefined) item.text = String(body.text).trim();
        if (body.thumbnail !== undefined) item.thumbnail = cleanImageUrl(body.thumbnail);
        if (body.images !== undefined) item.images = Array.isArray(body.images) ? body.images.map(cleanImageUrl).filter(Boolean) : [];
        await writeJSON(newsFile, news);
        return json(res, 200, { ok: true, item });
      }

      // DELETE /api/news/:id
      if (newsMatch && req.method === 'DELETE') {
        if (!requireAuth()) return;
        const id = decodeURIComponent(newsMatch[1]);
        let news = await getNews();
        news = news.filter(n => n.id !== id);
        await writeJSON(newsFile, news);
        return json(res, 200, { ok: true });
      }

      // GET /api/settings (нийтэд)
      if (pathname === '/api/settings' && req.method === 'GET') {
        return json(res, 200, await getSettings());
      }

      // PUT /api/settings
      if (pathname === '/api/settings' && req.method === 'PUT') {
        if (!requireAuth()) return;
        const body = await readBody(req);
        const current = await getSettings();
        const next = { ...current };
        for (const key of ['email', 'instagram', 'facebook', 'fbGroup', 'address']) {
          if (body[key] !== undefined) next[key] = String(body[key]).trim();
        }
        if (body.phones !== undefined) {
          next.phones = String(body.phones)
            .split(/[,\s]+/)
            .map(p => p.trim())
            .filter(Boolean);
        }
        await writeJSON(settingsFile, next);
        return json(res, 200, { ok: true, settings: next });
      }

      // PUT /api/password
      if (pathname === '/api/password' && req.method === 'PUT') {
        if (!requireAuth()) return;
        const body = await readBody(req);
        const auth = await ensureAuth();
        if (!safeEqual(hashPassword(String(body.oldPassword || ''), auth.salt), auth.hash)) {
          return json(res, 401, { error: 'Хуучин нууц үг буруу байна.' });
        }
        const newPassword = String(body.newPassword || '');
        if (newPassword.length < 8) {
          return json(res, 400, { error: 'Шинэ нууц үг хамгийн багадаа 8 тэмдэгт байх ёстой.' });
        }
        const salt = randomBytes(16).toString('hex');
        await writeJSON(authFile, {
          ...auth,
          salt,
          hash: hashPassword(newPassword, salt),
          mustChange: false
        });
        sessions.clear(); // бүх session устгаж, шинээр нэвтрэхийг шаардана
        return json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie(secure) });
      }

      return json(res, 404, { error: 'API олдсонгүй.' });
    }

    /* ---------- Static ---------- */
    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filePath = resolve(root, relativePath);

    if (filePath !== root && !filePath.startsWith(root + sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Forbidden');
    }
    if (filePath.startsWith(certsDir + sep) || filePath === certsDir) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Forbidden');
    }

    try {
      const content = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream' });
      res.end(content);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  } catch (error) {
    if (res.headersSent) {
      res.destroy();
    } else {
      json(res, 500, { error: 'Серверийн алдаа: ' + error.message });
    }
  }
}

/* ================= HTTPS / HTTP ================= */
const keyPath = resolve(certsDir, 'key.pem');
const certPath = resolve(certsDir, 'cert.pem');

// Сервер унахаас сэргийлнэ (client abort зэрэг нөхцөлд гарах алдаанууд)
process.on('uncaughtException', (err) => console.error('[uncaught]', err));
process.on('unhandledRejection', (err) => console.error('[unhandled]', err));

async function start() {
  await ensureAuth();

  if (useHttps && !(existsSync(keyPath) && existsSync(certPath))) {
    console.log('[https] Сертификат олдсонгүй — шинээр үүсгэж байна...');
    const result = spawnSync('python', [resolve(root, 'scripts', 'gen_cert.py')], {
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });
    if (result.status !== 0 || !(existsSync(keyPath) && existsSync(certPath))) {
      console.error('Сертификат үүсгэж чадсангүй. `npm run cert` ажиллуулна уу.');
      process.exit(1);
    }
  }

  if (useHttps) {
    const [key, cert] = await Promise.all([readFile(keyPath), readFile(certPath)]);

    createHttpsServer({ key, cert }, handleRequest).listen(httpsPort, '0.0.0.0', () => {
      console.log(`IPYG Mongolia site (HTTPS) -> https://localhost:${httpsPort}`);
      console.log(`Админ панель -> https://localhost:${httpsPort}/admin.html`);
    });

    createHttpServer((req, res) => {
      const host = (req.headers.host || 'localhost').replace(/:\d+$/, '');
      res.writeHead(301, { Location: `https://${host}:${httpsPort}${req.url}` });
      res.end();
    }).listen(port, '0.0.0.0', () => {
      console.log(`HTTP -> HTTPS рүү шилжүүлнэ: http://localhost:${port} => https://localhost:${httpsPort}`);
    });
  } else {
    createHttpServer(handleRequest).listen(port, '0.0.0.0', () => {
      console.log(`IPYG Mongolia site -> http://localhost:${port}`);
      console.log(`Админ панель -> http://localhost:${port}/admin.html`);
      console.log('HTTPS идэвхжүүлэх: npm run dev:https');
    });
  }
}

start();
