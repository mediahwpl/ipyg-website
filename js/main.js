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
  try {
    const data = await fetchJSON('/api/news');
    const news = (data.news || []).slice(0, 6);
    if (!news.length) {
      grid.innerHTML = '<p class="news-empty">Одоогоор мэдээ нэмэгдээгүй байна.</p>';
      return;
    }
    const icons = ['🕊️', '🎓', '🤝', '🎤', '📚', '🤲'];
    grid.innerHTML = '';
    news.forEach((item, i) => {
      const card = document.createElement('article');
      card.className = 'news-item';
      card.innerHTML = `
        <div class="ph-img ph-${(i % 8) + 1}">${icons[i % icons.length]}</div>
        <div class="n-body">
          <h4></h4>
          <div class="n-date"></div>
          <p></p>
        </div>`;
      card.querySelector('.n-date').textContent = fmtDate(item.date);
      card.querySelector('h4').textContent = item.title || '';
      card.querySelector('p').textContent = item.text || '';
      grid.appendChild(card);
    });
  } catch {
    grid.innerHTML = '<p class="news-empty">Мэдээг уншихад алдаа гарлаа. Сервер ажиллаж байгаа эсэхийг шалгана уу.</p>';
  }
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
