/* ─── STATE ───────────────────────────────────────────────────────────── */
let token = localStorage.getItem('lp_token');
let currentUser = null;
let currentSection = 'home';
let currentCommentSection = null;
let currentCommentItemId = null;
let activeFilters = { dates: 'all', wishlist: 'all', talks: 'all', goals: 'all' };

/* ─── API ─────────────────────────────────────────────────────────────── */
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error del servidor');
  return data;
}
const GET   = p     => api('GET',    p);
const POST  = (p,b) => api('POST',   p, b);
const PATCH = (p,b) => api('PATCH',  p, b);
const DEL   = p     => api('DELETE', p);

/* ─── AUTH ────────────────────────────────────────────────────────────── */
async function initAuth() {
  if (!token) return renderLoggedOut();
  try {
    currentUser = await GET('/api/auth/me');
    renderLoggedIn();
  } catch {
    token = null;
    localStorage.removeItem('lp_token');
    renderLoggedOut();
  }
}

function renderLoggedIn() {
  const area = document.getElementById('auth-area');
  const name = esc(currentUser.display_name || currentUser.username);
  const initials = esc((currentUser.display_name || currentUser.username).slice(0,2).toUpperCase());
  area.innerHTML = `
    <div class="user-badge">
      <div class="user-avatar">${initials}</div>
      <span>${name}</span>
    </div>
    <button class="btn-outline" id="btn-logout">Salir</button>
  `;
  document.getElementById('btn-logout').addEventListener('click', logout);
  document.querySelectorAll('.auth-required').forEach(b => b.classList.remove('hidden'));
}

function renderLoggedOut() {
  currentUser = null;
  const area = document.getElementById('auth-area');
  area.innerHTML = `<button class="btn-outline" id="btn-login-open">Iniciar sesión</button>`;
  document.getElementById('btn-login-open').addEventListener('click', () => openModal('modal-login'));
  document.querySelectorAll('.auth-required').forEach(b => b.classList.add('hidden'));
}

function logout() {
  token = null; currentUser = null;
  localStorage.removeItem('lp_token');
  renderLoggedOut(); loadAll();
}

/* ─── LOGIN / REGISTER ────────────────────────────────────────────────── */
let isRegisterMode = false;

document.getElementById('switch-to-register').addEventListener('click', e => {
  e.preventDefault();
  isRegisterMode = !isRegisterMode;
  document.getElementById('auth-modal-title').textContent    = isRegisterMode ? 'Crear cuenta' : 'Iniciar sesión';
  document.getElementById('login-submit-btn').textContent    = isRegisterMode ? 'Registrarse' : 'Entrar';
  document.getElementById('switch-to-register').textContent  = isRegisterMode ? 'Ya tengo cuenta' : 'Regístrate';
  document.querySelector('.auth-switch').firstChild.textContent = isRegisterMode ? '¿Ya tienes cuenta? ' : '¿No tienes cuenta? ';
  document.getElementById('register-name-field').classList.toggle('hidden', !isRegisterMode);
  document.getElementById('login-error').classList.add('hidden');
});

document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const display_name = document.getElementById('login-displayname').value.trim();
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  try {
    const endpoint = isRegisterMode ? '/api/auth/register' : '/api/auth/login';
    const body = isRegisterMode ? { username, password, display_name } : { username, password };
    const data = await POST(endpoint, body);
    token = data.token; currentUser = data.user;
    localStorage.setItem('lp_token', token);
    closeModal('modal-login');
    renderLoggedIn(); loadAll();
  } catch(err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

/* ─── NAVIGATION ──────────────────────────────────────────────────────── */
function navigateTo(section) {
  currentSection = section;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('section-' + section).classList.add('active');

  // Update nav links active state
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.section === section);
  });

  window.scrollTo(0, 0);
}

/* Header nav links */
document.querySelectorAll('.nav-link').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.section));
});

/* Hero CTA buttons */
document.querySelectorAll('.cta-btn').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.section));
});

/* Footer links */
document.querySelectorAll('.footer-link').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.section));
});

/* Logo → home */
document.getElementById('logo-home-btn').addEventListener('click', () => navigateTo('home'));

/* ─── FAQ ACCORDION ───────────────────────────────────────────────────── */
document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.parentElement;
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  });
});

/* ─── MODAL HELPERS ───────────────────────────────────────────────────── */
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  const form = document.querySelector(`#${id} form`);
  if (form) form.reset();
}
document.querySelectorAll('.modal-close[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay.id); });
});

/* ─── ADD BUTTONS ─────────────────────────────────────────────────────── */
document.querySelectorAll('.btn-add').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!currentUser) { openModal('modal-login'); return; }
    openModal(btn.dataset.modal);
  });
});

/* ─── FILTER BUTTONS ──────────────────────────────────────────────────── */
document.querySelectorAll('.filter-row').forEach(row => {
  const section = row.closest('.section')?.id?.replace('section-', '');
  row.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      row.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (section) { activeFilters[section] = btn.dataset.filter; renderSection(section); }
    });
  });
});

function renderSection(s) {
  if (s === 'dates') renderDates();
  else if (s === 'wishlist') renderWishlist();
  else if (s === 'talks') renderTalks();
  else if (s === 'goals') renderGoals();
}

/* ─── GENERIC CARD RENDERER ───────────────────────────────────────────── */
function renderCards(containerId, items, renderFn) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  if (!items.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🌸</div><p>No hay nada aquí todavía. ¡Agrega algo!</p></div>`;
    return;
  }
  items.forEach(item => el.appendChild(renderFn(item)));
}

/* ─── DATE IDEAS ──────────────────────────────────────────────────────── */
let datesData = [];

async function loadDates() { datesData = await GET('/api/date-ideas'); renderDates(); }

function renderDates() {
  const f = activeFilters.dates;
  let items = datesData;
  if (f === 'pending') items = items.filter(i => !i.done);
  if (f === 'done')    items = items.filter(i => i.done);
  renderCards('dates-list', items, renderDateCard);
}

function renderDateCard(item) {
  const div = document.createElement('div');
  div.className = `card card-dates${item.done ? ' done-card' : ''}`;
  div.innerHTML = `
    <div class="card-header">
      <div class="card-title">${esc(item.title)}</div>
      <div class="card-actions">
        ${currentUser ? `<button class="icon-btn delete-btn" title="Eliminar">🗑️</button>` : ''}
        <button class="icon-btn comment-open-btn" title="Notas">💬</button>
      </div>
    </div>
    <div class="card-meta">
      ${item.location ? `<span class="tag tag-rose">📍 ${esc(item.location)}</span>` : ''}
      ${item.budget  ? `<span class="tag tag-peach">💰 ${esc(item.budget)}</span>` : ''}
    </div>
    ${item.description ? `<p class="card-desc">${esc(item.description)}</p>` : ''}
    <div class="card-footer">
      ${currentUser ? `
        <label class="checkbox-done">
          <input type="checkbox" class="toggle-done" ${item.done ? 'checked' : ''} />
          ${item.done ? '✅ Realizada' : 'Marcar como realizada'}
        </label>
      ` : `<span>${item.done ? '✅ Realizada' : '⏳ Pendiente'}</span>`}
      <button class="comment-btn comment-open-btn">💬</button>
    </div>
  `;
  if (currentUser) {
    div.querySelector('.toggle-done').addEventListener('change', async e => {
      await PATCH(`/api/date-ideas/${item.id}`, { done: e.target.checked }); loadDates();
    });
    div.querySelector('.delete-btn').addEventListener('click', async () => {
      if (confirm('¿Eliminar esta idea?')) { await DEL(`/api/date-ideas/${item.id}`); loadDates(); }
    });
  }
  div.querySelectorAll('.comment-open-btn').forEach(b =>
    b.addEventListener('click', () => openComments('date-ideas', item.id, item.title))
  );
  return div;
}

document.getElementById('form-date').addEventListener('submit', async e => {
  e.preventDefault();
  await POST('/api/date-ideas', formToObj(e.target));
  closeModal('modal-date'); loadDates();
});

/* ─── WISHLIST ────────────────────────────────────────────────────────── */
let wishData = [];

async function loadWishlist() { wishData = await GET('/api/wishlist'); renderWishlist(); }

function renderWishlist() {
  const f = activeFilters.wishlist;
  let items = wishData;
  if (f === 'alta')      items = items.filter(i => i.priority === 'alta'  && !i.purchased);
  if (f === 'media')     items = items.filter(i => i.priority === 'media' && !i.purchased);
  if (f === 'baja')      items = items.filter(i => i.priority === 'baja'  && !i.purchased);
  if (f === 'purchased') items = items.filter(i => i.purchased);
  renderCards('wishlist-list', items, renderWishCard);
}

function renderWishCard(item) {
  const div = document.createElement('div');
  div.className = `card card-wishlist${item.purchased ? ' done-card' : ''}`;
  const prioClass = { alta: 'tag-alta', media: 'tag-media', baja: 'tag-baja' }[item.priority] || 'tag-media';
  const prioLabel = { alta: '🔴 Alta', media: '🟡 Media', baja: '🟢 Baja' }[item.priority] || item.priority;
  div.innerHTML = `
    <div class="card-header">
      <div class="card-title">${esc(item.title)}</div>
      <div class="card-actions">
        ${currentUser ? `<button class="icon-btn delete-btn">🗑️</button>` : ''}
        <button class="icon-btn comment-open-btn">💬</button>
      </div>
    </div>
    <div class="card-meta">
      <span class="tag ${prioClass}">${prioLabel}</span>
      ${item.price ? `<span class="tag tag-mint">💵 ${esc(item.price)}</span>` : ''}
      ${item.purchased ? `<span class="tag tag-mint">✅ Comprado</span>` : ''}
    </div>
    ${item.notes ? `<p class="card-desc">${esc(item.notes)}</p>` : ''}
    ${item.url ? `<a href="${safeUrl(item.url)}" target="_blank" rel="noopener" class="card-link">${esc(truncUrl(item.url))}</a>` : ''}
    <div class="card-footer">
      ${currentUser ? `
        <label class="checkbox-done">
          <input type="checkbox" class="toggle-purchased" ${item.purchased ? 'checked' : ''} />
          ${item.purchased ? 'Comprado' : 'Marcar como comprado'}
        </label>
      ` : `<span>${item.purchased ? '✅ Comprado' : '🛒 Por comprar'}</span>`}
      <button class="comment-btn comment-open-btn">💬</button>
    </div>
  `;
  if (currentUser) {
    div.querySelector('.toggle-purchased').addEventListener('change', async e => {
      await PATCH(`/api/wishlist/${item.id}`, { purchased: e.target.checked }); loadWishlist();
    });
    div.querySelector('.delete-btn').addEventListener('click', async () => {
      if (confirm('¿Eliminar este deseo?')) { await DEL(`/api/wishlist/${item.id}`); loadWishlist(); }
    });
  }
  div.querySelectorAll('.comment-open-btn').forEach(b =>
    b.addEventListener('click', () => openComments('wishlist', item.id, item.title))
  );
  return div;
}

document.getElementById('form-wish').addEventListener('submit', async e => {
  e.preventDefault();
  await POST('/api/wishlist', formToObj(e.target));
  closeModal('modal-wish'); loadWishlist();
});

/* ─── TALKS ───────────────────────────────────────────────────────────── */
let talksData = [];

async function loadTalks() { talksData = await GET('/api/talks'); renderTalks(); }

function renderTalks() {
  const f = activeFilters.talks;
  let items = talksData;
  if (f === 'pending')  items = items.filter(i => !i.resolved);
  if (f === 'resolved') items = items.filter(i => i.resolved);
  renderCards('talks-list', items, renderTalkCard);
}

function renderTalkCard(item) {
  const div = document.createElement('div');
  div.className = `card card-talks${item.resolved ? ' done-card' : ''}`;
  const prioClass = { urgente: 'tag-urgente', normal: 'tag-normal', 'cuando puedan': 'tag-cuando' }[item.priority] || 'tag-normal';
  const prioLabel = { urgente: '🔴 Urgente', normal: '🟡 Normal', 'cuando puedan': '🟢 Sin prisa' }[item.priority] || item.priority;
  div.innerHTML = `
    <div class="card-header">
      <div class="card-title">${esc(item.title)}</div>
      <div class="card-actions">
        ${currentUser ? `<button class="icon-btn delete-btn">🗑️</button>` : ''}
        <button class="icon-btn comment-open-btn">💬</button>
      </div>
    </div>
    <div class="card-meta">
      <span class="tag ${prioClass}">${prioLabel}</span>
      ${item.resolved ? `<span class="tag tag-mint">✅ Resuelto</span>` : ''}
    </div>
    ${item.description ? `<p class="card-desc">${esc(item.description)}</p>` : ''}
    <div class="card-footer">
      ${currentUser ? `
        <label class="checkbox-done">
          <input type="checkbox" class="toggle-resolved" ${item.resolved ? 'checked' : ''} />
          ${item.resolved ? 'Resuelto' : 'Marcar como resuelto'}
        </label>
      ` : `<span>${item.resolved ? '✅ Resuelto' : '⏳ Pendiente'}</span>`}
      <button class="comment-btn comment-open-btn">💬</button>
    </div>
  `;
  if (currentUser) {
    div.querySelector('.toggle-resolved').addEventListener('change', async e => {
      await PATCH(`/api/talks/${item.id}`, { resolved: e.target.checked }); loadTalks();
    });
    div.querySelector('.delete-btn').addEventListener('click', async () => {
      if (confirm('¿Eliminar este tema?')) { await DEL(`/api/talks/${item.id}`); loadTalks(); }
    });
  }
  div.querySelectorAll('.comment-open-btn').forEach(b =>
    b.addEventListener('click', () => openComments('talks', item.id, item.title))
  );
  return div;
}

document.getElementById('form-talk').addEventListener('submit', async e => {
  e.preventDefault();
  await POST('/api/talks', formToObj(e.target));
  closeModal('modal-talk'); loadTalks();
});

/* ─── SAVINGS ─────────────────────────────────────────────────────────── */
let savingsData = [];

async function loadSavings() { savingsData = await GET('/api/savings'); renderSavings(); }

function renderSavings() {
  const container = document.getElementById('savings-list');
  container.innerHTML = '';
  if (!savingsData.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">✈️</div><p>Aún no hay metas de ahorro. ¡Empiecen a planear!</p></div>`;
    return;
  }
  savingsData.forEach(goal => container.appendChild(renderSavingCard(goal)));
}

function renderSavingCard(goal) {
  const pct = goal.target_amount > 0
    ? Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100))
    : 0;

  const div = document.createElement('div');
  div.className = 'saving-card';

  const contribsHtml = (goal.contributions || []).slice(0,6).map(c => `
    <div class="contrib-item">
      <span class="contrib-note">${esc(c.note || c.display_name || 'Aportación')}</span>
      <span class="contrib-amount">+$${Number(c.amount).toLocaleString()}</span>
    </div>
  `).join('');

  const canEdit = !!currentUser;
  const editAttr = canEdit ? 'contenteditable="true"' : '';

  div.innerHTML = `
    <!-- Top bar -->
    <div class="saving-card-top">
      <div class="saving-top-left">
        <span class="saving-emoji">${goal.emoji || '✈️'}</span>
        <div class="saving-info">
          <h3>${esc(goal.title)}</h3>
          ${goal.destination ? `<p class="destination">📍 ${esc(goal.destination)}</p>` : ''}
          ${goal.target_date ? `<p class="destination">📅 ${formatDate(goal.target_date)}</p>` : ''}
        </div>
      </div>
      ${currentUser ? `<button class="btn-ghost delete-saving-btn" style="padding:6px 10px;font-size:.8rem;">🗑️ Eliminar</button>` : ''}
    </div>

    <!-- Body: 2 columns -->
    <div class="saving-card-body">

      <!-- LEFT: progress + contributions -->
      <div class="saving-left">
        <h4>💰 Progreso de ahorro</h4>
        <div class="progress-wrap">
          <div class="progress-amounts">
            <span class="current">$${Number(goal.current_amount).toLocaleString()} ahorrado</span>
            <span class="target">meta: $${Number(goal.target_amount).toLocaleString()}</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          <div class="progress-pct">${pct}% completado</div>
        </div>

        ${contribsHtml ? `<div class="contributions-scroll">${contribsHtml}</div>` : '<p style="font-size:.82rem;color:var(--text-muted);margin-bottom:12px;">Sin aportaciones todavía</p>'}

        <div class="saving-btns">
          ${currentUser ? `<button class="btn-mint contribute-btn">+ Aportar</button>` : ''}
          <button class="btn-ghost comment-open-btn">💬 Notas</button>
        </div>
      </div>

      <!-- RIGHT: travel details -->
      <div class="saving-right">
        <h4>🗺️ Detalles del viaje</h4>

        <div class="travel-detail">
          <div class="travel-detail-label">📅 Mejores fechas para viajar</div>
          <div class="travel-detail-value" ${editAttr}
            data-field="best_dates" data-goal-id="${goal.id}"
            data-placeholder="Ej: Julio o agosto, temporada baja..."
          >${esc(goal.best_dates || '')}</div>
          ${canEdit ? `<div class="edit-note">Haz clic para editar</div>` : ''}
        </div>

        <div class="travel-detail">
          <div class="travel-detail-label">🎯 Lo que quiero hacer ahí</div>
          <div class="travel-detail-value" ${editAttr}
            data-field="activities" data-goal-id="${goal.id}"
            data-placeholder="Ej: Snorkel, cenotes, zona hotelera..."
          >${esc(goal.activities || '')}</div>
        </div>

        <div class="travel-detail">
          <div class="travel-detail-label">⏰ Cuándo se necesita el dinero</div>
          <div class="travel-detail-value" ${editAttr}
            data-field="deadline_note" data-goal-id="${goal.id}"
            data-placeholder="Ej: Antes de mayo para reservar vuelos..."
          >${esc(goal.deadline_note || '')}</div>
        </div>

        <div class="travel-detail">
          <div class="travel-detail-label">📊 Resumen</div>
          <div class="travel-stat">
            <span>Ahorrado</span>
            <span class="stat-val">$${Number(goal.current_amount).toLocaleString()} / $${Number(goal.target_amount).toLocaleString()}</span>
          </div>
          <div class="progress-bar" style="margin-top:6px;">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
          <div class="progress-pct">${pct}% — faltan $${Math.max(0, goal.target_amount - goal.current_amount).toLocaleString()}</div>
        </div>
      </div>

    </div>
  `;

  // Inline edit on blur for travel details
  if (currentUser) {
    div.querySelectorAll('.travel-detail-value[contenteditable]').forEach(el => {
      el.addEventListener('blur', async () => {
        const field = el.dataset.field;
        const goalId = el.dataset.goalId;
        const value = el.textContent.trim();
        try { await PATCH(`/api/savings/${goalId}`, { [field]: value }); }
        catch(e) { console.error(e); }
      });
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); }
      });
    });
    div.querySelector('.contribute-btn').addEventListener('click', () => {
      document.querySelector('#modal-contribute [name="goal_id"]').value = goal.id;
      document.getElementById('contribute-title').textContent = `Aportar a: ${goal.title} ${goal.emoji || '✈️'}`;
      openModal('modal-contribute');
    });
    div.querySelector('.delete-saving-btn').addEventListener('click', async () => {
      if (confirm(`¿Eliminar la meta "${goal.title}"?`)) { await DEL(`/api/savings/${goal.id}`); loadSavings(); }
    });
  }
  div.querySelector('.comment-open-btn').addEventListener('click', () =>
    openComments('savings', goal.id, goal.title)
  );
  return div;
}

document.getElementById('form-saving').addEventListener('submit', async e => {
  e.preventDefault();
  await POST('/api/savings', formToObj(e.target));
  closeModal('modal-saving'); loadSavings();
});

document.getElementById('form-contribute').addEventListener('submit', async e => {
  e.preventDefault();
  const data = formToObj(e.target);
  await POST(`/api/savings/${data.goal_id}/contribute`, { amount: data.amount, note: data.note });
  closeModal('modal-contribute'); loadSavings();
});

/* ─── GOALS ───────────────────────────────────────────────────────────── */
let goalsData = [];

async function loadGoals() { goalsData = await GET('/api/goals'); renderGoals(); }

function renderGoals() {
  const f = activeFilters.goals;
  let items = goalsData;
  if (f !== 'all') items = items.filter(i => i.status === f);
  const container = document.getElementById('goals-list');
  container.innerHTML = '';
  if (!items.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🌸</div><p>No hay metas aquí todavía.</p></div>`;
    return;
  }
  items.forEach(item => container.appendChild(renderGoalCard(item)));
}

function renderGoalCard(item) {
  const pct = item.progress_percent || 0;
  const statusClass = { pendiente: 'tag-pendiente', 'en progreso': 'tag-progreso', completada: 'tag-completada' }[item.status] || 'tag-pendiente';
  const catEmoji = { hogar: '🏠', viaje: '✈️', finanzas: '💰', salud: '💚', familia: '👨‍👩‍👧', general: '🎯' }[item.category] || '🎯';

  const div = document.createElement('div');
  div.className = 'goal-card';
  div.innerHTML = `
    <!-- Top -->
    <div class="goal-card-top">
      <div class="goal-top-info">
        <div class="goal-emoji-title">
          <span class="goal-emoji">${item.emoji || '🎯'}</span>
          <span class="goal-title">${esc(item.title)}</span>
        </div>
        ${item.description ? `<p class="goal-desc">${esc(item.description)}</p>` : ''}
        <div class="goal-meta">
          <span class="tag ${statusClass}">${{ pendiente: '⏳ Pendiente', 'en progreso': '🔄 En progreso', completada: '✅ Completada' }[item.status] || item.status}</span>
          ${item.category ? `<span class="tag tag-peach">${catEmoji} ${item.category}</span>` : ''}
        </div>
      </div>
      <div class="card-actions">
        ${currentUser ? `<button class="icon-btn delete-btn">🗑️</button>` : ''}
        <button class="icon-btn comment-open-btn">💬</button>
      </div>
    </div>

    <!-- Body -->
    <div class="goal-card-body">

      <!-- Photo -->
      <div class="goal-photo-area">
        <label class="photo-upload-label">
          ${item.photo
            ? `<img src="${item.photo}" class="goal-photo-preview" alt="Foto de la meta" />`
            : `<div class="photo-placeholder"><span>📷</span>${currentUser ? 'Agregar foto' : 'Sin foto'}</div>`
          }
          ${currentUser ? `<input type="file" accept="image/*" class="photo-input" />` : ''}
        </label>
      </div>

      <!-- Progress -->
      <div class="goal-progress">
        <div class="goal-progress-header">
          <span class="goal-progress-label">Progreso</span>
          <span class="goal-progress-pct progress-pct-display">${pct}%</span>
        </div>
        <div class="progress-bar-goal">
          <div class="progress-fill-goal progress-fill-display" style="width:${pct}%"></div>
        </div>
        ${currentUser ? `
          <input type="range" min="0" max="100" value="${pct}" class="progress-slider" style="margin-top:8px;" />
        ` : ''}
      </div>

      <!-- Dates -->
      <div class="goal-dates">
        <div class="goal-date-item">
          <div class="goal-date-label">📅 Fecha aproximada</div>
          <div class="goal-date-value">${item.target_date ? formatDate(item.target_date) : 'No definida'}</div>
        </div>
        <div class="goal-date-item">
          <div class="goal-date-label">🗓️ Cuándo quiero hacerlo</div>
          <div class="goal-date-value">${item.when_to_do ? esc(item.when_to_do) : 'No definido'}</div>
        </div>
      </div>

    </div>

    <!-- Footer -->
    <div class="goal-card-footer">
      ${currentUser ? `
        <select class="status-select goal-status-select">
          <option value="pendiente"   ${item.status === 'pendiente'   ? 'selected' : ''}>⏳ Pendiente</option>
          <option value="en progreso" ${item.status === 'en progreso' ? 'selected' : ''}>🔄 En progreso</option>
          <option value="completada"  ${item.status === 'completada'  ? 'selected' : ''}>✅ Completada</option>
        </select>
      ` : `<span>${item.status}</span>`}
      <span>${item.display_name || 'Demo'}</span>
    </div>
  `;

  if (currentUser) {
    // Status change
    div.querySelector('.goal-status-select').addEventListener('change', async e => {
      await PATCH(`/api/goals/${item.id}`, { status: e.target.value }); loadGoals();
    });

    // Delete
    div.querySelector('.delete-btn').addEventListener('click', async () => {
      if (confirm('¿Eliminar esta meta?')) { await DEL(`/api/goals/${item.id}`); loadGoals(); }
    });

    // Progress slider
    const slider = div.querySelector('.progress-slider');
    const pctDisplay = div.querySelector('.progress-pct-display');
    const fillDisplay = div.querySelector('.progress-fill-display');
    let saveTimeout;
    if (slider) {
      slider.addEventListener('input', () => {
        const val = slider.value;
        pctDisplay.textContent = val + '%';
        fillDisplay.style.width = val + '%';
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
          await PATCH(`/api/goals/${item.id}`, { progress_percent: Number(val) });
        }, 500);
      });
    }

    // Photo upload
    const photoInput = div.querySelector('.photo-input');
    if (photoInput) {
      photoInput.addEventListener('change', async () => {
        const file = photoInput.files[0];
        if (!file) return;
        const base64 = await compressImage(file);
        await PATCH(`/api/goals/${item.id}`, { photo: base64 });
        loadGoals();
      });
    }
  }

  div.querySelectorAll('.comment-open-btn').forEach(b =>
    b.addEventListener('click', () => openComments('goals', item.id, item.title))
  );

  return div;
}

document.getElementById('form-goal').addEventListener('submit', async e => {
  e.preventDefault();
  await POST('/api/goals', formToObj(e.target));
  closeModal('modal-goal'); loadGoals();
});

/* ─── COMMENTS ────────────────────────────────────────────────────────── */
async function openComments(section, itemId, title) {
  currentCommentSection = section;
  currentCommentItemId = String(itemId);
  document.getElementById('panel-title').textContent = `💬 ${title}`;
  document.getElementById('panel-comments').classList.remove('hidden');
  document.getElementById('panel-overlay').classList.remove('hidden');
  document.getElementById('comment-form-area').classList.toggle('hidden', !currentUser);
  document.getElementById('comment-login-note').classList.toggle('hidden', !!currentUser);
  await loadComments();
}

async function loadComments() {
  const list = document.getElementById('comments-list');
  list.innerHTML = '<p class="no-comments">Cargando...</p>';
  const comments = await GET(`/api/comments/${currentCommentSection}/${currentCommentItemId}`);
  list.innerHTML = '';
  if (!comments.length) { list.innerHTML = '<p class="no-comments">Sin comentarios aún.</p>'; return; }
  comments.forEach(c => {
    const div = document.createElement('div');
    div.className = 'comment-bubble';
    div.innerHTML = `
      <div class="comment-author">${esc(c.display_name || 'Anónimo')}</div>
      <div>${esc(c.text)}</div>
      <div class="comment-time">${formatDateTime(c.created_at)}</div>
    `;
    list.appendChild(div);
  });
}

function closeCommentPanel() {
  document.getElementById('panel-comments').classList.add('hidden');
  document.getElementById('panel-overlay').classList.add('hidden');
  currentCommentSection = null; currentCommentItemId = null;
}

document.getElementById('panel-overlay').addEventListener('click', closeCommentPanel);
document.getElementById('panel-close').addEventListener('click', closeCommentPanel);

document.getElementById('comment-submit').addEventListener('click', async () => {
  const text = document.getElementById('comment-input').value.trim();
  if (!text) return;
  await POST('/api/comments', { section: currentCommentSection, item_id: currentCommentItemId, text });
  document.getElementById('comment-input').value = '';
  await loadComments();
});

document.getElementById('comment-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) document.getElementById('comment-submit').click();
});

/* ─── IMAGE COMPRESSION ───────────────────────────────────────────────── */
function compressImage(file, maxW = 800, maxH = 600, quality = 0.75) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxW || h > maxH) {
          const r = Math.min(maxW / w, maxH / h);
          w = Math.round(w * r); h = Math.round(h * r);
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ─── UTILS ───────────────────────────────────────────────────────────── */
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function safeUrl(url) {
  if (!url) return '#';
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? url : '#';
  } catch { return '#'; }
}
function truncUrl(url) {
  try { const u = new URL(url); return u.hostname; } catch { return url.slice(0,30); }
}
function formToObj(form) {
  const o = {};
  new FormData(form).forEach((v,k) => { if (v !== '') o[k] = v; });
  return o;
}
function formatDate(str) {
  if (!str) return '';
  return new Date(str + 'T00:00:00').toLocaleDateString('es-MX', { year:'numeric', month:'short', day:'numeric' });
}
function formatDateTime(str) {
  if (!str) return '';
  return new Date(str).toLocaleDateString('es-MX', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}

/* ─── LOAD ALL + INIT ─────────────────────────────────────────────────── */
async function loadAll() {
  await Promise.all([loadDates(), loadWishlist(), loadTalks(), loadSavings(), loadGoals()]);
}

(async () => {
  await initAuth();
  await loadAll();
})();
