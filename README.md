# ipyg-website

IPYG Mongolia-ийн вэбсайт + админ панель. Зөвхөн Node.js стандарт номын сан ашиглана (dependency байхгүй).

## Ажиллуулах

```bash
node server.mjs            # HTTP  -> http://localhost:5173
node server.mjs --https    # HTTPS -> https://localhost:8443 (HTTP :5173 → 301 redirect)
```

эсвэл

```bash
npm run dev
npm run dev:https
npm run cert               # сертификатыг дахин үүсгэх
```

`--https` анх удаа ажиллуулахад `certs/` хоосон байвал Python-оор (cryptography)
`localhost` зориулалттай self-signed сертификатыг автоматаар үүсгэнэ (365 өдөр).
Хөтөч "Аюулгүй бус" гэж анхааруулна — үүнийг `chrome://flags/#allow-insecure-localhost`
эсвэл сертификатыг хүлээн зөвшөөрч болно. Үйлдвэрлэлийн хаяг дээр Let's Encrypt
сертификат ашиглахыг зөвлөнө.

## Админ панель

- Хаяг: `/admin.html`
- Анхны утга: **`admin` / `admin123`** → нэвтсэний дараа **заавал нууц үг солих** шаардлагатай
- Нууц үг `data/auth.json`-д scrypt (salt) байдлаар хадгалагдана
- 10 удаа буруу оролдвол 15 минут түгжигдэнэ
- Session cookie: `ipyg_session` (HttpOnly, SameSite=Lax, HTTPS дээр Secure)

### Админаас удирдах зүйлс

| Цэс | API | Файл |
|---|---|---|
| Мэдээ (нэмэх/засах/устгах) | `GET/POST /api/news`, `PUT/DELETE /api/news/:id` | `data/news.json` |
| Холбоо барих тохиргоо | `GET /api/settings`, `PUT /api/settings` | `data/settings.json` |
| Нууц үг солих | `PUT /api/password` | `data/auth.json` |

Нээлттэй API (login шаардахгүй): `GET /api/news`, `GET /api/settings`, `GET /api/me`.

## Бүтэц

```
index.html          # Бид хэн бэ (мэдээ + холбоо барих хэсэгтэй)
what-we-do.html
our-history.html
partnership.html
admin.html          # Админ панель (login + dashboard)
css/style.css       # үндсэн загвар
css/admin.css       # админ загвар
js/main.js          # мэдээ/холбоо барих render
js/admin.js         # админ логик
server.mjs          # статик + API + auth + HTTPS
scripts/gen_cert.py # self-signed сертификат
assets/             # зургууд
data/               # news.json, settings.json, auth.json (нууц үг)
certs/              # key.pem, cert.pem (git-д орохгүй)
```
