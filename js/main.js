const burger = document.getElementById('burger');
const mainNav = document.getElementById('mainNav');

burger?.addEventListener('click', () => {
  const isOpen = mainNav.classList.toggle('open');
  burger.setAttribute('aria-expanded', String(isOpen));
});

mainNav?.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => mainNav.classList.remove('open'));
});

/* ============================================================
   API-аас мэдээ, холбоо барих мэдээллийг татаж render хийнэ
   ============================================================ */
async function fetchJSON(path) {
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

/* ---------- Мэдээ (index.html #newsGrid) ---------- */
async function renderNews() {
  const grid = document.getElementById('newsGrid');
  if (!grid) return;
  const detail = document.getElementById('newsDetail');
  const heading = document.getElementById('newsHeading');
  try {
    let news = [];
    try {
      const data = await fetchJSON('/api/news');
      if (Array.isArray(data.news)) news = data.news;
    } catch {
      // Статик хостинг дээр API байхгүй үед нийтэд нээлттэй JSON файлыг ашиглана.
    }
    if (!news.length) {
      const data = await fetchJSON('data/news.json');
      news = Array.isArray(data) ? data : (Array.isArray(data.news) ? data.news : []);
    }
    if (!news.length) {
      grid.innerHTML = '<p class="news-empty">Одоогоор мэдээ нэмэгдээгүй байна.</p>';
      return;
    }
    const newsId = new URLSearchParams(location.search).get('id');
    if (newsId && detail) {
      const item = news.find((entry) => String(entry.id) === newsId);
      grid.hidden = true;
      if (heading) heading.hidden = true;
      detail.hidden = false;
      detail.replaceChildren();
      if (!item) {
        detail.textContent = 'Энэ мэдээ олдсонгүй.';
        return;
      }
      const back = document.createElement('a');
      back.className = 'news-back';
      back.href = 'news.html';
      back.textContent = '← Бүх мэдээ';
      const title = document.createElement('h2');
      title.textContent = item.title || '';
      const date = document.createElement('time');
      date.className = 'news-detail-date';
      date.textContent = fmtDate(item.date);
      detail.append(back);
      const thumbnail = safeNewsImage(item.thumbnail);
      if (thumbnail) {
        const hero = document.createElement('img');
        hero.className = 'news-detail-image';
        hero.src = thumbnail;
        hero.alt = item.title || 'Мэдээний зураг';
        detail.append(hero);
      }
      detail.append(title, date);
      const text = document.createElement('p');
      text.className = 'news-detail-text';
      text.textContent = item.text || '';
      detail.append(text);
      const gallery = document.createElement('div');
      gallery.className = 'news-gallery';
      (Array.isArray(item.images) ? item.images : []).map(safeNewsImage).filter(Boolean).forEach((src, index) => {
        const image = document.createElement('img');
        image.src = src;
        image.alt = `${item.title || 'Мэдээ'} — зураг ${index + 1}`;
        gallery.append(image);
      });
      if (gallery.childElementCount) detail.append(gallery);
      return;
    }
    if (detail) { detail.hidden = true; detail.replaceChildren(); }
    grid.hidden = false;
    if (heading) heading.hidden = false;
    news = news.slice(0, 6);
    const icons = ['🕊️', '🎓', '🤝', '🎤', '📚', '🤲'];
    grid.innerHTML = '';
    news.forEach((item, i) => {
      const card = document.createElement('article');
      card.className = 'news-item';
      const imageUrl = safeNewsImage(item.thumbnail);
      if (imageUrl) {
        const image = document.createElement('img');
        image.className = 'news-thumb';
        image.src = imageUrl;
        image.alt = item.title || 'Мэдээний зураг';
        card.append(image);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = `ph-img ph-${(i % 8) + 1}`;
        placeholder.textContent = icons[i % icons.length];
        card.append(placeholder);
      }
      const body = document.createElement('div');
      body.className = 'n-body';
      const title = document.createElement('h4');
      const titleLink = document.createElement('a');
      titleLink.href = `news.html?id=${encodeURIComponent(item.id || '')}`;
      titleLink.textContent = item.title || '';
      title.append(titleLink);
      const date = document.createElement('div');
      date.className = 'n-date';
      const excerpt = document.createElement('p');
      excerpt.textContent = item.text || '';
      const more = document.createElement('a');
      more.className = 'news-read-more';
      more.href = titleLink.href;
      more.textContent = 'Дэлгэрэнгүй →';
      body.append(title, date, excerpt, more);
      card.append(body);
      card.querySelector('.n-date').textContent = fmtDate(item.date);
      grid.appendChild(card);
    });
  } catch {
    grid.innerHTML = '<p class="news-empty">Мэдээг уншихад алдаа гарлаа. Сервер ажиллаж байгаа эсэхийг шалгана уу.</p>';
  }
}

function safeNewsImage(value) {
  const src = String(value || '').trim();
  if (/^https?:\/\//i.test(src)) return src;
  if (/^(\/?assets|\/?uploads)\/[\w./-]+$/i.test(src) && !src.includes('..')) return src;
  return '';
}

/* ---------- Холбоо барих тохиргоо ---------- */
async function renderContact() {
  try {
    const s = await fetchJSON('/api/settings');
    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    const label = (id, text) => { const el = document.getElementById(id); const l = el && el.querySelector('.b-label'); if (l) l.textContent = text; };
    const attr = (id, name, value) => { const el = document.getElementById(id); if (el) el.setAttribute(name, value); };
    const igHandle = String(s.instagram || '').replace(/^@/, '');
    const fbName = String(s.facebook || '');
    const phones = (s.phones || []).filter(Boolean);
    const phoneFirst = phones[0] || '';
    const mail = s.email || '';
    const fbGroup = s.fbGroup || '';

    if (mail) { attr('ctMail', 'href', `mailto:${mail}`); set('ftMail', mail); attr('ftMail', 'href', `mailto:${mail}`); }
    if (igHandle) { attr('ctIg', 'href', `https://instagram.com/${igHandle}`); attr('ftIg', 'href', `https://instagram.com/${igHandle}`); }
    if (fbName) { label('ctFb', fbName); attr('ftFb', 'href', 'https://facebook.com/' + encodeURIComponent(fbName).replace(/%20/g, '.')); }
    if (fbGroup) attr('ftFb', 'href', fbGroup);
    if (phoneFirst) { attr('ctPhone', 'href', `tel:+976${phoneFirst}`); label('ctPhone', phones.join(', ')); }
    if (phones.length) { set('ftPhones', phones.join(', ')); attr('ftPhones', 'href', `tel:+976${phoneFirst}`); }
    if (s.address) set('ftAddress', s.address);
    if (phones.length) set('contactPhones', 'Утас: ' + phones.join(' / '));
  } catch {
    /* Тохиргоо татагдаагүй бол анхдагч утга нь үлдэнэ */
  }
}

renderNews();
renderContact();
