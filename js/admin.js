/* ============================================================
   IPYG Mongolia — Админ панель (client)
   API: /api/me, /api/login, /api/logout, /api/news, /api/settings, /api/password
   ============================================================ */
const $ = (sel) => document.querySelector(sel);

const loginView = $('#loginView');
const dashView = $('#dashView');

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options
  });
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Алдаа (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function showMsg(el, text, isError = false) {
  el.textContent = text;
  el.classList.toggle('err', isError);
  if (text) {
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.textContent = ''; }, 4000);
  }
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

/* ================= AUTH ================= */
async function checkSession() {
  try {
    const me = await api('/api/me');
    if (me.loggedIn) {
      $('#whoUser').textContent = me.username;
      loginView.hidden = true;
      dashView.hidden = false;
      await Promise.all([loadNews(), loadSettings()]);
      if (me.mustChange) showPwNotice();
      return;
    }
  } catch { /* fall through to login */ }
  loginView.hidden = false;
  dashView.hidden = true;
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = $('#loginError');
  errBox.hidden = true;
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        username: $('#loginUser').value.trim(),
        password: $('#loginPass').value
      })
    });
    $('#loginPass').value = '';
    await checkSession();
    if (data.mustChange) showPwNotice();
    switchTab('news');
  } catch (err) {
    errBox.textContent = err.message;
    errBox.hidden = false;
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); } catch { /* ignore */ }
  location.reload();
});

/* ================= TABS ================= */
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle('on', on);
    t.setAttribute('aria-selected', String(on));
  });
  document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = p.id !== `tab-${name}`; });
}
document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => switchTab(t.dataset.tab));
});

/* Анхны нууц үг солих мэдэгдэл */
function showPwNotice() {
  const notice = document.getElementById('pwNotice');
  if (notice) notice.hidden = false;
}
document.getElementById('pwNoticeBtn')?.addEventListener('click', () => switchTab('password'));

/* ================= NEWS ================= */
async function loadNews() {
  const tbody = $('#newsTableBody');
  try {
    const data = await api('/api/news');
    const news = data.news || [];
    if (!news.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty">Мэдээ байхгүй байна. "Шинэ мэдээ" товч дарж нэмнэ үү.</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    news.forEach((item) => {
      const tr = document.createElement('tr');

      const tdDate = document.createElement('td');
      tdDate.className = 'c-date';
      tdDate.textContent = fmtDate(item.date);

      const tdTitle = document.createElement('td');
      tdTitle.className = 'c-title';
      tdTitle.textContent = item.title;

      const tdText = document.createElement('td');
      tdText.className = 'c-text';
      tdText.textContent = item.text || '—';

      const tdActions = document.createElement('td');
      tdActions.className = 'c-actions';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-ghost btn-sm';
      editBtn.textContent = 'Засах';
      editBtn.addEventListener('click', () => fillNewsForm(item));
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-danger btn-sm';
      delBtn.textContent = 'Устгах';
      delBtn.addEventListener('click', async () => {
        if (!confirm(`"${item.title}" мэдээг устгах уу?`)) return;
        try {
          await api(`/api/news/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
          await loadNews();
        } catch (err) {
          alert(err.message);
        }
      });
      tdActions.append(editBtn, delBtn);

      tr.append(tdDate, tdTitle, tdText, tdActions);
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty">${err.message}</td></tr>`;
  }
}

function fillNewsForm(item) {
  $('#newsForm').hidden = false;
  $('#newsId').value = item.id || '';
  $('#newsDate').value = item.date || '';
  $('#newsTitle').value = item.title || '';
  $('#newsText').value = item.text || '';
  $('#newsTitle').focus();
}

function resetNewsForm() {
  $('#newsForm').hidden = true;
  $('#newsForm').reset();
  $('#newsId').value = '';
  showMsg($('#newsFormMsg'), '');
}

$('#newsNewBtn').addEventListener('click', () => fillNewsForm({ date: new Date().toISOString().slice(0, 10) }));
$('#newsCancelBtn').addEventListener('click', resetNewsForm);

$('#newsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('#newsId').value;
  const payload = {
    date: $('#newsDate').value,
    title: $('#newsTitle').value.trim(),
    text: $('#newsText').value.trim()
  };
  try {
    if (id) {
      await api(`/api/news/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) });
      showMsg($('#newsFormMsg'), 'Шинэчлэгдлээ ✓');
    } else {
      await api('/api/news', { method: 'POST', body: JSON.stringify(payload) });
      showMsg($('#newsFormMsg'), 'Нэмэгдлээ ✓');
    }
    resetNewsForm();
    await loadNews();
  } catch (err) {
    showMsg($('#newsFormMsg'), err.message, true);
  }
});

/* ================= SETTINGS ================= */
async function loadSettings() {
  try {
    const s = await api('/api/settings');
    $('#setEmail').value = s.email || '';
    $('#setPhones').value = (s.phones || []).join(', ');
    $('#setInstagram').value = s.instagram || '';
    $('#setFacebook').value = s.facebook || '';
    $('#setFbGroup').value = s.fbGroup || '';
    $('#setAddress').value = s.address || '';
    $('#setMembership').value = s.membership || '';
  } catch (err) {
    showMsg($('#settingsMsg'), err.message, true);
  }
}

$('#settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({
        email: $('#setEmail').value.trim(),
        phones: $('#setPhones').value,
        instagram: $('#setInstagram').value.trim(),
        facebook: $('#setFacebook').value.trim(),
        fbGroup: $('#setFbGroup').value.trim(),
        address: $('#setAddress').value.trim(),
        membership: $('#setMembership').value.trim()
      })
    });
    showMsg($('#settingsMsg'), 'Хадгалагдлаа ✓');
  } catch (err) {
    showMsg($('#settingsMsg'), err.message, true);
  }
});

/* ================= PASSWORD ================= */
$('#passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#passwordMsg');
  const np = $('#newPassword').value;
  if (np !== $('#newPassword2').value) {
    showMsg(msg, 'Шинэ нууц үгүүд таарахгүй байна.', true);
    return;
  }
  try {
    await api('/api/password', {
      method: 'PUT',
      body: JSON.stringify({ oldPassword: $('#oldPassword').value, newPassword: np })
    });
    showMsg(msg, 'Нууц үг солигдлоо. Да нэвтрэнэ үү…');
    setTimeout(() => location.reload(), 1200);
  } catch (err) {
    showMsg(msg, err.message, true);
  }
});

/* ================= INIT ================= */
checkSession();
