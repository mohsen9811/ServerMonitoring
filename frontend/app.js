const API = '/api';
let currentServer = null;
let allServicesList = [];
let searchTimeout = null;
let currentServerHost = '';
let currentServerMeta = null;
let serverSortMode = false;
let systemAutoRefreshInterval = null;
let systemAutoRefreshEnabled = false;
let latestAlerts = [];
let linkedServerTestState = {};
let currentLinkedServers = [];
let currentJobs = [];
let liveRefreshTimer = null;
let liveEventSource = null;
let latestLiveSnapshot = null;



async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  const contentType = res.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const error = new Error(formatApiError(payload, res.status));
    error.payload = payload;
    error.status = res.status;
    throw error;
  }

  // Business objects can legitimately contain status: 'Failed' (for example a failed Linked Server test).
  // Do not throw on payload.status === 'Failed'. Only HTTP failures or explicit success:false are errors.
  if (payload && payload.success === false) {
    const error = new Error(formatApiError(payload, res.status));
    error.payload = payload;
    error.status = res.status;
    throw error;
  }

  return payload;
}

function formatApiError(payload, status = 500) {
  if (typeof payload === 'string') return payload || `HTTP ${status}`;
  if (!payload) return `HTTP ${status}`;
  const main = payload.error || payload.message || `HTTP ${status}`;
  const hint = payload.hint ? `\nراهنما: ${payload.hint}` : '';
  return `${main}${hint}`;
}

function escapeAttr(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function jsString(str) {
  return JSON.stringify(String(str ?? '')).replace(/</g, '\\u003C').replace(/>/g, '\\u003E');
}


function serverHasSql(server = currentServerMeta) {
  if (!server) return true;
  if (server.features && server.features.sql === false) return false;
  if (server.sql && server.sql.enabled === false) return false;
  if (server.sql === null) return false;
  return true;
}


function serverHasIis(server = currentServerMeta) {
  if (!server) return false;
  if (server.features && server.features.iis === true) return true;
  if (server.iis && server.iis.enabled === true) return true;
  if (server.hasIis === true) return true;
  return false;
}


function serverHasCredit(server = currentServerMeta) {
  if (!server) return false;
  if (server.features && server.features.credit === true) return true;
  if (server.credit && server.credit.enabled === true) return true;
  if (server.hasCredit === true) return true;
  return false;
}

function creditDisabledHtml() {
  return `
    <div class="feature-disabled-card">
      <i class="fa-solid fa-credit-card"></i>
      <h3>سامانه اعتباری برای این سرور فعال نیست</h3>
      <p>این سرور هنگام ثبت به عنوان میزبان SPهای سامانه اعتباری مشخص نشده است.</p>
      <button class="action-btn" onclick="openTab('settings')"><i class="fa-solid fa-sliders-h"></i> تغییر در تنظیمات</button>
    </div>
  `;
}

function iisDisabledHtml() {
  return `
    <div class="feature-disabled-card">
      <i class="fa-solid fa-globe"></i>
      <h3>IIS برای این سرور فعال نیست</h3>
      <p>این سرور هنگام ثبت به عنوان Web Server/IIS Server مشخص نشده؛ بنابراین تب IIS و هشدارهای IIS برای آن غیرفعال است.</p>
      <button class="action-btn" onclick="openTab('settings')"><i class="fa-solid fa-sliders-h"></i> تغییر در تنظیمات</button>
    </div>
  `;
}

function sqlDisabledHtml(section = 'SQL') {
  return `
    <div class="feature-disabled-card">
      <i class="fa-solid fa-database"></i>
      <h3>${section} برای این سرور فعال نیست</h3>
      <p>این سرور در زمان ثبت به عنوان سرور بدون SQL ذخیره شده؛ بنابراین هشدارهای Database / Jobs / Linked برای آن ساخته نمی‌شود.</p>
      <button class="action-btn" onclick="openTab('settings')"><i class="fa-solid fa-sliders-h"></i> تغییر در تنظیمات</button>
    </div>
  `;
}

function applyServerFeatureVisibility() {
  const hasSql = serverHasSql();
  const hasIis = serverHasIis();
  const hasCredit = serverHasCredit();
  document.body.classList.toggle('server-no-sql', !hasSql);
  document.body.classList.toggle('server-no-iis', !hasIis);
  document.body.classList.toggle('server-no-credit', !hasCredit);
  document.querySelectorAll('.sql-tab').forEach(btn => {
    btn.classList.toggle('is-hidden', !hasSql);
    btn.classList.toggle('disabled', !hasSql);
    btn.title = hasSql ? '' : 'SQL برای این سرور فعال نیست';
    btn.disabled = !hasSql;
  });
  document.querySelectorAll('.iis-tab').forEach(btn => {
    btn.classList.toggle('is-hidden', !hasIis);
    btn.classList.toggle('disabled', !hasIis);
    btn.title = hasIis ? '' : 'IIS برای این سرور فعال نیست';
    btn.disabled = !hasIis;
  });
  document.querySelectorAll('.credit-tab').forEach(btn => {
    btn.classList.toggle('is-hidden', !hasCredit);
    btn.classList.toggle('disabled', !hasCredit);
    btn.title = hasCredit ? '' : 'سامانه اعتباری برای این سرور فعال نیست';
    btn.disabled = !hasCredit;
  });
  const badge = document.getElementById('current-server-sql-badge');
  if (badge) {
    badge.className = `server-feature-badge ${hasSql ? 'enabled' : 'disabled'}`;
    badge.innerHTML = hasSql ? '<i class="fa-solid fa-database"></i> SQL فعال' : '<i class="fa-solid fa-ban"></i> بدون SQL';
  }
  const iisBadge = document.getElementById('current-server-iis-badge');
  if (iisBadge) {
    iisBadge.className = `server-feature-badge ${hasIis ? 'enabled web' : 'disabled'}`;
    iisBadge.innerHTML = hasIis ? '<i class="fa-solid fa-globe"></i> IIS فعال' : '<i class="fa-solid fa-ban"></i> بدون IIS';
  }
  const creditBadge = document.getElementById('current-server-credit-badge');
  if (creditBadge) {
    creditBadge.className = `server-feature-badge ${hasCredit ? 'enabled credit' : 'disabled'}`;
    creditBadge.innerHTML = hasCredit ? '<i class="fa-solid fa-credit-card"></i> سامانه فعال' : '<i class="fa-solid fa-ban"></i> بدون سامانه';
  }
}

function statusClass(status) {
  const value = String(status || '').toLowerCase();
  if (['running', 'succeeded', 'healthy', 'connected', 'synchronized', 'synchronizing', 'idle', 'online'].includes(value)) return 'status-running';
  if (['failed', 'critical', 'notfound', 'not found', 'disabled', 'offline', 'suspect', 'emergency', 'not synced'].includes(value)) return 'status-stopped';
  if (['warning', 'retry', 'cancelled', 'unknown', 'not tested', 'restoring', 'recovering', 'recovery pending'].includes(value)) return 'status-warning';
  return 'status-notfound';
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(String(value));
  return date.toLocaleString('fa-IR');
}

function truncateText(value, max = 120) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function showLoading(show) {
  const loader = document.getElementById('global-loading');
  if (show) loader.classList.remove('hidden');
  else loader.classList.add('hidden');
}

async function doubleConfirm(actionName) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'glass-modal job-manager-modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal-window" style="max-width:350px; text-align:center;">
        <div class="modal-header"><span>${actionName}</span><span class="modal-close" id="cancel-first">&times;</span></div>
        <div class="modal-body"><p style="margin:20px 0">آیا مطمئنی؟</p><div style="display:flex; gap:10px; justify-content:center;"><button id="confirm-first" class="primary-btn">بله</button><button id="cancel-first-btn" class="action-btn">خیر</button></div></div>
      </div>
    `;
    document.body.appendChild(modal);
    const firstConfirm = () => {
      modal.remove();
      const modal2 = document.createElement('div');
      modal2.className = 'glass-modal';
      modal2.style.display = 'flex';
      modal2.innerHTML = `
        <div class="modal-window" style="max-width:350px; text-align:center;">
          <div class="modal-header"><span>${actionName}</span><span class="modal-close" id="cancel-second">&times;</span></div>
          <div class="modal-body"><p style="margin:20px 0">تأیید نهایی انجام شود؟</p><div style="display:flex; gap:10px; justify-content:center;"><button id="confirm-second" class="primary-btn">بله</button><button id="cancel-second-btn" class="action-btn">خیر</button></div></div>
        </div>
      `;
      document.body.appendChild(modal2);
      document.getElementById('confirm-second').onclick = () => { modal2.remove(); resolve(true); };
      document.getElementById('cancel-second').onclick = () => { modal2.remove(); resolve(false); };
      document.getElementById('cancel-second-btn').onclick = () => { modal2.remove(); resolve(false); };
    };
    document.getElementById('confirm-first').onclick = firstConfirm;
    document.getElementById('cancel-first').onclick = () => { modal.remove(); resolve(false); };
    document.getElementById('cancel-first-btn').onclick = () => { modal.remove(); resolve(false); };
  });
}


async function loadCurrentServerMeta() {
  if (!currentServer) return null;
  try {
    currentServerMeta = await apiFetch(`${API}/servers/${currentServer}`);
    currentServerHost = currentServerMeta.host || '';
    applyServerFeatureVisibility();
    renderDashboardOverview();
    return currentServerMeta;
  } catch (e) {
    console.warn('server meta failed', e);
    currentServerMeta = null;
    applyServerFeatureVisibility();
    return null;
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

function setDashboardCard(id, state, sub, level = 'neutral') {
  const stateEl = document.getElementById(`${id}-state`);
  const subEl = document.getElementById(`${id}-sub`);
  const card = stateEl?.closest('.ops-status-card');
  if (stateEl) stateEl.innerText = state;
  if (subEl) subEl.innerText = sub;
  if (card) {
    card.classList.remove('is-ok', 'is-warning', 'is-danger', 'is-neutral');
    card.classList.add(`is-${level}`);
  }
}

function renderDashboardOverview() {
  const title = document.getElementById('dashboard-server-title');
  const subtitle = document.getElementById('dashboard-server-subtitle');
  const note = document.getElementById('dashboard-sql-note');
  const hostLine = document.getElementById('current-server-host-line');
  const host = currentServerMeta?.host || '--';
  if (title) title.innerText = currentServerMeta?.name || 'داشبورد سرور';
  if (subtitle) subtitle.innerText = currentServerMeta?.name ? `Host: ${host} | ${serverHasSql() ? 'SQL فعال' : 'بدون SQL'}` : 'یک سرور را از منوی سمت راست انتخاب کن.';
  if (hostLine) hostLine.innerText = `Host: ${host}`;
  setText('stat-current-host', host);
  if (note) note.style.display = serverHasSql() ? 'none' : 'flex';
}

function renderDashboardAlertsPreview(alerts) {
  const el = document.getElementById('dashboard-alert-preview');
  const headerCount = document.getElementById('header-alert-count');
  if (headerCount) headerCount.innerText = Array.isArray(alerts) ? alerts.length : 0;
  if (!el) return;
  if (!Array.isArray(alerts) || alerts.length === 0) {
    el.innerHTML = '<div class="preview-empty"><i class="fa-solid fa-circle-check"></i><strong>همه چیز پایدار است</strong><span>هشدار فعالی برای این سرور وجود ندارد.</span></div>';
    return;
  }
  el.innerHTML = alerts.slice(0, 4).map(a => `
    <button class="preview-alert ${a.severity === 'critical' ? 'critical' : 'warning'}" data-server-id="${escapeAttr(a.serverId || currentServer || '')}" data-target-tab="${escapeAttr(a.targetTab || 'alerts')}" data-key="${escapeAttr(a.key || '')}">
      <span>${a.severity === 'critical' ? 'Critical' : 'Warning'}</span>
      <strong>${escapeHtml(a.title || '-')}</strong>
      <em>${escapeHtml(truncateText(a.message || '', 70))}</em>
    </button>
  `).join('');
  el.querySelectorAll('.preview-alert').forEach(btn => {
    btn.addEventListener('click', async () => {
      await navigateToAlert(btn.dataset.serverId, btn.dataset.targetTab, btn.dataset.key);
    });
  });
}


window.refreshDashboardOverview = async function refreshDashboardOverview() {
  await loadCurrentServerMeta();
  await updateDashboardStats();
  await loadAlerts(false).catch(() => {});
};

async function updateDashboardStats() {
  if (!currentServer) return;
  try {
    const servers = await apiFetch(`${API}/servers`);
    setText('stat-servers', servers.length);
    setText('stat-current-host', currentServerMeta?.host || '--');

    let servicesCount = '?';
    try {
      const services = await apiFetch(`${API}/services/${currentServer}`);
      if (Array.isArray(services)) {
        servicesCount = services.length;
        const stopped = services.filter(s => String(s.Status || '').toLowerCase() !== 'running').length;
        setDashboardCard('dash-services', stopped ? `${stopped} مورد نیاز بررسی` : 'پایدار', `${services.length} سرویس مانیتور می‌شود`, stopped ? 'warning' : 'ok');
      }
    } catch (e) {
      setDashboardCard('dash-services', 'خطا در دریافت', truncateText(e.message, 60), 'danger');
    }
    setText('stat-services', servicesCount);

    try {
      const system = await apiFetch(`${API}/system/${currentServer}`);
      const cpu = clampPercent(system.cpuPercent);
      const ram = clampPercent(system.ramPercent);
      const worst = Math.max(cpu, ram);
      const level = worst >= 85 ? 'danger' : (worst >= 70 ? 'warning' : 'ok');
      setDashboardCard('dash-system', `${worst.toFixed(0)}% مصرف`, `CPU ${cpu.toFixed(0)}% | RAM ${ram.toFixed(0)}% | ${formatUptime(system)}`, level);
    } catch (e) {
      setDashboardCard('dash-system', 'خطا در دریافت', truncateText(e.message, 60), 'danger');
    }

    try {
      const disks = await apiFetch(`${API}/disk/${currentServer}`);
      if (Array.isArray(disks) && disks.length) {
        const worstDisk = disks.reduce((max, d) => clampPercent(d.UsedPercent) > clampPercent(max.UsedPercent) ? d : max, disks[0]);
        const percent = clampPercent(worstDisk.UsedPercent);
        const critical = disks.filter(d => clampPercent(d.UsedPercent) >= 90).length;
        const warning = disks.filter(d => clampPercent(d.UsedPercent) >= 80 && clampPercent(d.UsedPercent) < 90).length;
        const level = critical ? 'danger' : (warning ? 'warning' : 'ok');
        setDashboardCard('dash-disk', critical ? `${critical} بحرانی` : (warning ? `${warning} هشدار` : 'پایدار'), `${disks.length} Drive | بیشترین مصرف ${escapeHtml(worstDisk.Drive || '')}: ${percent}%`, level);
      } else {
        setDashboardCard('dash-disk', 'بدون داده', 'درایوی دریافت نشد', 'neutral');
      }
    } catch (e) {
      setDashboardCard('dash-disk', 'خطا در دریافت', truncateText(e.message, 60), 'danger');
    }

    if (!serverHasSql()) {
      setText('stat-databases', '-');
      setDashboardCard('dash-sql', 'غیرفعال', 'این سرور SQL ندارد', 'neutral');
    } else {
      try {
        const dbs = await apiFetch(`${API}/databases/${currentServer}`);
        const count = Array.isArray(dbs) ? dbs.length : '?';
        setText('stat-databases', count);
        if (Array.isArray(dbs)) {
          const bad = dbs.filter(db => {
            const status = String(db.status || '').toLowerCase();
            return status !== 'online' || (db.ha_type !== 'Standalone' && db.is_synchronized === false);
          }).length;
          setDashboardCard('dash-sql', bad ? `${bad} مورد نیاز بررسی` : 'پایدار', `${dbs.length} دیتابیس / HA`, bad ? 'warning' : 'ok');
        }
      } catch (e) {
        setText('stat-databases', '?');
        setDashboardCard('dash-sql', 'خطا در دریافت', truncateText(e.message, 60), 'danger');
      }
    }

    try {
      const alerts = await apiFetch(`${API}/alerts/${currentServer}`);
      latestAlerts = Array.isArray(alerts) ? alerts : [];
      setText('stat-alerts', latestAlerts.length);
      renderDashboardAlertsPreview(latestAlerts);
    } catch (e) {
      setText('stat-alerts', '?');
      renderDashboardAlertsPreview([]);
    }
  } catch(e) { console.warn(e); }
}

async function loadServices() {
  const el = document.getElementById('services-list');
  el.innerHTML = '<div class="loading">در حال بارگذاری...</div>';
  showLoading(true);
  try {
    const res = await fetch(`${API}/services/${currentServer}`);
    if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
    const services = await res.json();
    if (!Array.isArray(services)) throw new Error('پاسخ سرور معتبر نیست');
    if (services.length === 0) {
      el.innerHTML = '<div class="loading">سرویسی ثبت نشده.</div>';
      return;
    }
    el.innerHTML = services.map(s => `
      <div class="service-card" data-key="${escapeAttr(s.Name)}">
        <div class="svc-name"><i class="fa-regular fa-circle"></i> ${escapeHtml(s.Name)}</div>
        <div class="svc-display">${escapeHtml(s.DisplayName)}</div>
        <span class="status-badge ${s.Status === 'Running' ? 'status-running' : (s.Status === 'NotFound' ? 'status-notfound' : 'status-stopped')}">${s.Status === 'NotFound' ? 'Not Found' : s.Status}</span>
        <div class="svc-actions">
          <button class="btn-action btn-start" onclick="serviceAction('${escapeHtml(s.Name)}','Start', false)"><i class="fa-solid fa-play"></i> شروع</button>
          <button class="btn-action btn-stop" onclick="serviceAction('${escapeHtml(s.Name)}','Stop', false)"><i class="fa-solid fa-stop"></i> توقف</button>
          <button class="btn-action btn-restart" onclick="serviceAction('${escapeHtml(s.Name)}','Restart', false)"><i class="fa-solid fa-arrow-rotate-right"></i> ریستارت</button>
          <button class="btn-action btn-stop-force" onclick="serviceAction('${escapeHtml(s.Name)}','Stop', true)"><i class="fa-solid fa-skull"></i> توقف اجباری</button>
          <button class="btn-action btn-restart-force" onclick="serviceAction('${escapeHtml(s.Name)}','Restart', true)"><i class="fa-solid fa-bolt"></i> ریستارت اجباری</button>
          <button class="btn-action btn-remove" onclick="removeService('${escapeHtml(s.Name)}')"><i class="fa-solid fa-trash"></i> حذف</button>
        </div>
      </div>
    `).join('');
    await updateDashboardStats();
  } catch(e) {
    el.innerHTML = `<div class="loading">خطا: ${escapeHtml(e.message)}</div>`;
    showToast(e.message, 'error');
  } finally { showLoading(false); }
}

window.serviceAction = async (name, action, force = false) => {
  let confirmMessage = `${action} سرویس ${name}`;
  if (force && (action === 'Stop' || action === 'Restart')) {
    confirmMessage = `${action} اجباری سرویس ${name} (همراه با وابستگی‌ها)`;
  }
  const confirmed = await doubleConfirm(confirmMessage);
  if (!confirmed) return;
  showLoading(true);
  try {
    const res = await fetch(`${API}/services/${currentServer}/action`, {
      method: 'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ service: name, action, force })
    });
    const data = await res.json();
    if (!res.ok) {
      let errorMsg = data.error || 'عملیات ناموفق';
      if (errorMsg.includes('Access denied') || errorMsg.includes('WinRM')) showWinRMHelp(currentServerHost);
      showToast(`خطا: ${errorMsg}`, 'error');
      return;
    }
    showToast(`${action}${force ? ' اجباری' : ''} روی ${name}: ${data.Status}`, 'success');
    setTimeout(() => { loadServices(); updateDashboardStats(); }, 1000);
  } catch(e) {
    if (e.message.includes('Access denied')) showWinRMHelp(currentServerHost);
    showToast(e.message, 'error');
  } finally { showLoading(false); }
};

window.removeService = async (name) => {
  const confirmed = await doubleConfirm(`حذف سرویس ${name} از نظارت`);
  if (!confirmed) return;
  showLoading(true);
  try {
    const res = await fetch(`${API}/services/${currentServer}/monitor/${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (res.ok) {
      showToast(`سرویس ${name} از لیست نظارت حذف شد`, 'success');
      loadServices();
    } else { const err = await res.json(); showToast('خطا: ' + (err.error || 'نامشخص'), 'error'); }
  } catch(e) { showToast(e.message, 'error'); } finally { showLoading(false); }
};

async function loadAllServicesForSearch() {
  if (!currentServer) return;
  showLoading(true);
  const resultsDiv = document.getElementById('search-results');
  resultsDiv.innerHTML = '<div class="loading">در حال بارگذاری سرویس‌ها...</div>';
  try {
    const res = await fetch(`${API}/services/all/${currentServer}`);
    if (!res.ok) throw new Error(await res.text());
    allServicesList = await res.json();
    if (!Array.isArray(allServicesList)) allServicesList = [];
    filterServiceResults();
    const searchInput = document.getElementById('service-search-input');
    if (searchInput) {
      const newInput = searchInput.cloneNode(true);
      searchInput.parentNode.replaceChild(newInput, searchInput);
      document.getElementById('service-search-input').addEventListener('input', (e) => {
        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => filterServiceResults(), 300);
      });
    }
  } catch(e) { resultsDiv.innerHTML = `<div class="loading">خطا: ${e.message}</div>`; } finally { showLoading(false); }
}

function filterServiceResults() {
  const search = document.getElementById('service-search-input')?.value.toLowerCase() || '';
  const filtered = search ? allServicesList.filter(s => s.Name.toLowerCase().includes(search) || (s.DisplayName && s.DisplayName.toLowerCase().includes(search))) : allServicesList;
  const resultsDiv = document.getElementById('search-results');
  if (!filtered.length) { resultsDiv.innerHTML = '<div class="loading">سرویسی یافت نشد</div>'; return; }
  resultsDiv.innerHTML = filtered.map(s => `
    <div class="service-item" onclick="addServiceToMonitor('${escapeHtml(s.Name)}')">
      <div><span class="service-name">${escapeHtml(s.Name)}</span><br><span class="service-display">${escapeHtml(s.DisplayName || '')}</span></div>
      <span class="status-badge ${s.Status === 'Running' ? 'status-running' : 'status-stopped'}">${s.Status}</span>
    </div>
  `).join('');
}

window.addServiceToMonitor = async (serviceName) => {
  showLoading(true);
  try {
    const res = await fetch(`${API}/services/${currentServer}/monitor`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceName })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`سرویس ${serviceName} به لیست نظارت اضافه شد`, 'success');
      document.getElementById('service-modal').style.display = 'none';
      await loadServices();
    } else { showToast('خطا: ' + (data.error || 'نامعتبر'), 'error'); }
  } catch(e) { showToast(e.message, 'error'); } finally { showLoading(false); }
};

function showWinRMHelp(host) {
  const modal = document.createElement('div');
  modal.className = 'glass-modal';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal-window" style="max-width:550px;">
      <div class="modal-header"><span><i class="fa-solid fa-shield-halved"></i> تنظیمات WinRM</span><span class="modal-close close-help">&times;</span></div>
      <div class="modal-body">
        <p>اتصال به <strong>${escapeHtml(host)}</strong> با خطا مواجه شد. لطفاً مراحل زیر را انجام دهید:</p>
        <hr><p><strong>مرحله 1 (روی ماشین محلی - PowerShell Admin):</strong></p>
        <pre style="background:#0a0c10; padding:10px; border-radius:12px; overflow-x:auto;">Set-Item WSMan:\localhost\Client\TrustedHosts -Value "${escapeHtml(host)}" -Force</pre>
        <p><strong>مرحله 2 (روی سرور مقصد - PowerShell Admin):</strong></p>
        <pre style="background:#0a0c10; padding:10px; border-radius:12px;">winrm set winrm/config/client/auth @{Basic="true"}
winrm set winrm/config/service/auth @{Basic="true"}
winrm set winrm/config/service @{AllowUnencrypted="true"}
Restart-Service WinRM</pre>
        <button id="close-help-btn" class="primary-btn" style="margin-top:15px;">متوجه شدم</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const closeModal = () => modal.remove();
  modal.querySelector('.close-help').onclick = closeModal;
  modal.querySelector('#close-help-btn').onclick = closeModal;
  modal.onclick = (e) => { if (e.target === modal) closeModal(); };
}

async function loadJobs() {
  const tbody = document.getElementById('jobs-body');
  const countEl = document.getElementById('jobs-count');
  if (!tbody) return;
  if (!serverHasSql()) {
    currentJobs = [];
    if (countEl) countEl.innerText = '0 Job';
    tbody.innerHTML = `<tr><td colspan="7">${sqlDisabledHtml('SQL Agent Jobs')}</td></tr>`;
    return;
  }
  tbody.innerHTML = '<tr><td colspan="7" class="loading">در حال بارگذاری...</td></tr>';
  showLoading(true);
  try {
    const jobs = await apiFetch(`${API}/jobs/${currentServer}`);
    currentJobs = Array.isArray(jobs) ? jobs : [];
    if (countEl) countEl.innerText = `${currentJobs.length} Job`;
    renderJobsTable();
  } catch(e) {
    currentJobs = [];
    if (countEl) countEl.innerText = '0 Job';
    tbody.innerHTML = `<tr><td colspan="7" class="error-cell">${escapeHtml(e.message)}</td></tr>`;
    showToast(e.message, 'error', 5000);
  } finally { showLoading(false); }
}

function getJobUiState(job) {
  const running = !!job.is_running;
  const enabled = !!job.enabled;
  const last = String(job.last_run_status || 'Never Run');
  if (running) return 'Running';
  if (!enabled) return 'Disabled';
  return last;
}

function jobMatchesFilter(job, term, filter) {
  const haystack = [
    job.name,
    job.category,
    job.owner_name,
    job.last_run_status,
    job.last_message
  ].map(x => String(x || '').toLowerCase()).join(' ');
  const textOk = !term || haystack.includes(term);
  const state = getJobUiState(job).toLowerCase();
  let filterOk = true;
  if (filter === 'failed') filterOk = state.includes('fail');
  if (filter === 'running') filterOk = state.includes('running');
  if (filter === 'succeeded') filterOk = state.includes('succeed');
  if (filter === 'disabled') filterOk = state.includes('disabled');
  return textOk && filterOk;
}

function renderJobsTable() {
  const tbody = document.getElementById('jobs-body');
  const countEl = document.getElementById('jobs-count');
  if (!tbody) return;
  const term = String(document.getElementById('job-search')?.value || '').trim().toLowerCase();
  const filter = String(document.getElementById('job-status-filter')?.value || 'all').toLowerCase();
  const rows = currentJobs.filter(j => jobMatchesFilter(j, term, filter));
  if (countEl) countEl.innerText = `${rows.length}/${currentJobs.length} Job`;
  if (!currentJobs.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Jobای یافت نشد.</td></tr>';
    return;
  }
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">موردی با این فیلتر پیدا نشد.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(j => {
    const state = getJobUiState(j);
    const lastStatus = j.is_running ? 'Running' : (j.last_run_status || 'Never Run');
    const message = truncateText(j.last_message || '', 130);
    const rowClass = /fail/i.test(lastStatus) ? 'row-danger' : '';
    return `
      <tr class="job-row ${rowClass}" data-key="${escapeAttr(j.name)}" data-job-name="${escapeAttr(j.name)}" title="${escapeAttr(j.last_message || '')}">
        <td class="job-name-cell">
          <strong>${escapeHtml(j.name)}</strong>
          ${message ? `<span>${escapeHtml(message)}</span>` : ''}
        </td>
        <td class="nowrap"><span class="status-badge ${statusClass(state)}">${escapeHtml(state)}</span></td>
        <td class="job-run-cell">
          <span class="status-dot-text ${/fail/i.test(lastStatus) ? 'dot-fail' : (/succeed/i.test(lastStatus) ? 'dot-ok' : 'dot-muted')}">${escapeHtml(lastStatus)}</span>
          <small>${formatDate(j.last_run_datetime)}</small>
        </td>
        <td class="nowrap">${formatDate(j.next_run_datetime)}</td>
        <td class="nowrap">${escapeHtml(j.last_run_duration || '-')}</td>
        <td class="job-category-cell">${escapeHtml(j.category || '-')}</td>
        <td class="job-actions-cell compact-actions">
          <button class="icon-action btn-start" title="Run" onclick="event.stopPropagation(); jobAction(${jsString(j.name)},'Start')" ${j.is_running || !j.enabled ? 'disabled' : ''}><i class="fa-solid fa-play"></i></button>
          <button class="icon-action btn-stop" title="Stop" onclick="event.stopPropagation(); jobAction(${jsString(j.name)},'Stop')" ${!j.is_running ? 'disabled' : ''}><i class="fa-solid fa-stop"></i></button>
          <button class="icon-action" title="${j.enabled ? 'Disable' : 'Enable'}" onclick="event.stopPropagation(); jobAction(${jsString(j.name)},${j.enabled ? jsString('Disable') : jsString('Enable')})"><i class="fa-solid ${j.enabled ? 'fa-toggle-off' : 'fa-toggle-on'}"></i></button>
          <button class="btn-action compact-manage" onclick="event.stopPropagation(); showJobManager(${jsString(j.name)})"><i class="fa-solid fa-screwdriver-wrench"></i> مدیریت</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.job-row').forEach(row => {
    row.addEventListener('dblclick', () => showJobManager(row.dataset.jobName));
  });
}


function isEndpointNotFound(err) {
  const message = String(err?.message || '');
  const code = err?.payload?.code;
  return err?.status === 404 || code === 'NOT_FOUND' || message.includes('API endpoint not found');
}

async function fetchJobDetails(jobName) {
  const encoded = encodeURIComponent(jobName);
  try {
    return await apiFetch(`${API}/jobs/${currentServer}/details/${encoded}`);
  } catch (err) {
    // Compatibility with a backend that was not fully replaced yet.
    if (!isEndpointNotFound(err)) throw err;
    const history = await apiFetch(`${API}/jobs/${currentServer}/history/${encoded}?top=120`);
    const jobs = await apiFetch(`${API}/jobs/${currentServer}`);
    const job = (Array.isArray(jobs) ? jobs : []).find(x => x.name === jobName) || { name: jobName };
    return { job, history: Array.isArray(history) ? history : [], failures: (Array.isArray(history) ? history : []).filter(h => Number(h.run_status) === 0), steps: [], schedules: [] };
  }
}

function normalizeJobActionName(action) {
  const raw = String(action || '').trim().toLowerCase();
  const map = {
    start: 'Start',
    run: 'Start',
    stop: 'Stop',
    enable: 'Enable',
    enabled: 'Enable',
    disable: 'Disable',
    disabled: 'Disable'
  };
  return map[raw] || String(action || '').trim();
}

async function postJobAction(jobName, action) {
  const cleanJobName = String(jobName || '').trim();
  const normalizedAction = normalizeJobActionName(action);
  if (!cleanJobName || !normalizedAction) {
    throw new Error('نام Job یا نوع عملیات مشخص نیست.');
  }

  const payload = { jobName: cleanJobName, name: cleanJobName, action: normalizedAction };
  const encodedJob = encodeURIComponent(cleanJobName);
  const encodedAction = encodeURIComponent(normalizedAction);
  const attempts = [
    [`${API}/jobs/${currentServer}/action`, payload],
    [`${API}/jobs/${currentServer}/job/action`, payload],
    [`${API}/jobs/${currentServer}/jobs/action`, payload],
    [`${API}/jobs/${currentServer}/${encodedJob}/action`, payload],
    [`${API}/jobs/${currentServer}/${encodedJob}/${encodedAction}`, payload],
    [`${API}/jobs/${currentServer}/job/${encodedJob}/${encodedAction}`, payload]
  ];

  let lastError = null;
  for (const [url, body] of attempts) {
    try {
      return await apiFetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
      });
    } catch (err) {
      lastError = err;
      const msg = String(err.message || '');
      const endpointMissing = isEndpointNotFound(err);
      const oldValidation = err.status === 400 && /Start|Stop|action|Invalid job/i.test(msg);
      if (!endpointMissing && !oldValidation) break;
    }
  }

  throw lastError || new Error('عملیات Job ناموفق بود.');
}


window.jobAction = async (name, action) => {
  if (!serverHasSql()) { showToast('برای این سرور SQL فعال نیست.', 'warning'); return; }
  const cleanName = String(name || '').trim();
  const normalizedAction = normalizeJobActionName(action);
  if (!cleanName || !normalizedAction) {
    showToast('نام Job یا عملیات مشخص نیست.', 'error', 6000);
    return;
  }

  const actionLabel = { Start: 'اجرای', Stop: 'توقف', Enable: 'فعال‌سازی', Disable: 'غیرفعال‌سازی' }[normalizedAction] || normalizedAction;
  const confirmed = await doubleConfirm(`${actionLabel} جاب ${cleanName}`);
  if (!confirmed) return;
  showLoading(true);
  try {
    const data = await postJobAction(cleanName, normalizedAction);
    if (data.success === false) throw new Error(data.error || data.message || 'عملیات ناموفق بود');
    showToast(data.message || `${actionLabel} روی Job ${cleanName} انجام شد`, 'success', 5000);
    await loadJobs();
    await updateDashboardStats();
    const openModal = document.querySelector('.job-manager-modal[data-job-name]');
    if (openModal && openModal.dataset.jobName === cleanName) {
      openModal.remove();
      await showJobManager(cleanName);
    }
  } catch(e) {
    showToast(e.message, 'error', 8000);
  } finally {
    showLoading(false);
  }
};


function renderJobHistoryRows(history) {
  return (history || []).map(h => `
    <tr class="${h.run_status_text === 'Failed' ? 'row-danger' : ''}">
      <td>${formatDate(h.run_datetime)}</td>
      <td>${escapeHtml(h.step_id)} - ${escapeHtml(h.step_name || '-')}</td>
      <td><span class="status-badge ${statusClass(h.run_status_text)}">${escapeHtml(h.run_status_text || '-')}</span></td>
      <td>${escapeHtml(h.run_duration || '-')}</td>
      <td>${escapeHtml(h.retries_attempted ?? 0)}</td>
      <td class="history-message">${escapeHtml(h.message || '-')}</td>
    </tr>
  `).join('') || '<tr><td colspan="6" class="loading">History موجود نیست.</td></tr>';
}

window.showJobHistory = async (jobName) => {
  // سازگاری با نسخه‌های قبلی: History قبلی حالا داخل پنجره مدیریت کامل باز می‌شود.
  return showJobManager(jobName);
};

window.showJobManager = async (jobName) => {
  if (!serverHasSql()) { showToast('برای این سرور SQL فعال نیست.', 'warning'); return; }
  showLoading(true);
  try {
    const details = await fetchJobDetails(jobName);
    const job = details.job || {};
    const history = details.history || [];
    const failures = details.failures || [];
    const steps = details.steps || [];
    const schedules = details.schedules || [];
    const state = job.is_running ? 'Running' : (job.enabled ? 'Idle' : 'Disabled');
    const modal = document.createElement('div');
    modal.className = 'glass-modal job-manager-modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal-window job-manager-window">
        <div class="modal-header">
          <span><i class="fa-solid fa-screwdriver-wrench"></i> ${escapeHtml(jobName)}</span>
          <span class="modal-close close-job-manager">&times;</span>
        </div>
        <div class="modal-body">
          <div class="details-grid job-summary-grid">
            <div class="mini-card"><small>State</small><strong><span class="status-badge ${statusClass(state)}">${escapeHtml(state)}</span></strong></div>
            <div class="mini-card"><small>Enabled</small><strong>${job.enabled ? 'فعال' : 'غیرفعال'}</strong></div>
            <div class="mini-card"><small>Last Run</small><strong>${escapeHtml(job.last_run_status || 'Never Run')}</strong><span>${formatDate(job.last_run_datetime)}</span></div>
            <div class="mini-card"><small>Running Since</small><strong>${formatDate(job.running_since)}</strong></div>
            <div class="mini-card"><small>Owner</small><strong>${escapeHtml(job.owner_name || '-')}</strong></div>
            <div class="mini-card"><small>Category</small><strong>${escapeHtml(job.category || '-')}</strong></div>
          </div>

          <div class="manager-actions">
            <button class="btn-action btn-start job-modal-action" data-action="Start" ${job.is_running || !job.enabled ? 'disabled' : ''}><i class="fa-solid fa-play"></i> Run</button>
            <button class="btn-action btn-stop job-modal-action" data-action="Stop" ${!job.is_running ? 'disabled' : ''}><i class="fa-solid fa-stop"></i> Stop</button>
            <button class="btn-action job-modal-action" data-action="${job.enabled ? 'Disable' : 'Enable'}"><i class="fa-solid ${job.enabled ? 'fa-toggle-off' : 'fa-toggle-on'}"></i> ${job.enabled ? 'Disable' : 'Enable'}</button>
            <button class="action-btn refresh-job-manager"><i class="fa-solid fa-rotate"></i> رفرش</button>
          </div>

          ${job.last_message ? `<div class="info-note job-last-message"><i class="fa-solid fa-message"></i> ${escapeHtml(job.last_message)}</div>` : ''}

          <section class="modal-section">
            <h3><i class="fa-solid fa-triangle-exclamation"></i> خطاهای اخیر</h3>
            <div class="table-wrap history-table-wrap">
              <table class="data-table compact-table">
                <thead><tr><th>زمان</th><th>Step</th><th>وضعیت</th><th>مدت</th><th>Retry</th><th>Message</th></tr></thead>
                <tbody>${renderJobHistoryRows(failures)}</tbody>
              </table>
            </div>
          </section>

          <section class="modal-section">
            <h3><i class="fa-solid fa-list-ol"></i> Stepها</h3>
            <div class="table-wrap">
              <table class="data-table compact-table">
                <thead><tr><th>#</th><th>نام Step</th><th>Subsystem</th><th>DB</th><th>آخرین وضعیت</th><th>Retry</th><th>Command</th></tr></thead>
                <tbody>
                  ${steps.map(st => `
                    <tr class="${st.last_run_outcome_text === 'Failed' ? 'row-danger' : ''}">
                      <td>${escapeHtml(st.step_id)}</td>
                      <td>${escapeHtml(st.step_name || '-')}</td>
                      <td>${escapeHtml(st.subsystem || '-')}</td>
                      <td>${escapeHtml(st.database_name || '-')}</td>
                      <td><span class="status-badge ${statusClass(st.last_run_outcome_text)}">${escapeHtml(st.last_run_outcome_text || '-')}</span><div class="muted-line">${formatDate(st.last_run_datetime)}</div></td>
                      <td>${escapeHtml(st.retry_attempts ?? 0)} / ${escapeHtml(st.retry_interval ?? 0)} دقیقه</td>
                      <td><details><summary>نمایش Command</summary><pre class="job-step-command">${escapeHtml(st.command || '-')}</pre></details></td>
                    </tr>
                  `).join('') || '<tr><td colspan="7" class="loading">Stepای تعریف نشده است.</td></tr>'}
                </tbody>
              </table>
            </div>
          </section>

          <section class="modal-section">
            <h3><i class="fa-solid fa-calendar-days"></i> Scheduleها</h3>
            <div class="table-wrap">
              <table class="data-table compact-table">
                <thead><tr><th>نام</th><th>فعال</th><th>نوع</th><th>Interval</th><th>اجرای بعدی</th></tr></thead>
                <tbody>
                  ${schedules.map(sc => `
                    <tr>
                      <td>${escapeHtml(sc.name || '-')}</td>
                      <td>${sc.enabled ? '✅' : '❌'}</td>
                      <td>${escapeHtml(sc.freq_type_text || '-')}</td>
                      <td>${escapeHtml(sc.freq_interval ?? '-')} / ${escapeHtml(sc.freq_subday_interval ?? '-')}</td>
                      <td>${formatDate(sc.next_run_datetime)}</td>
                    </tr>
                  `).join('') || '<tr><td colspan="5" class="loading">Scheduleای تعریف نشده است.</td></tr>'}
                </tbody>
              </table>
            </div>
          </section>

          <section class="modal-section">
            <h3><i class="fa-solid fa-clock-rotate-left"></i> History کامل</h3>
            <div class="table-wrap history-table-wrap">
              <table class="data-table compact-table">
                <thead><tr><th>زمان</th><th>Step</th><th>وضعیت</th><th>مدت</th><th>Retry</th><th>Message</th></tr></thead>
                <tbody>${renderJobHistoryRows(history)}</tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const closeModal = () => modal.remove();
    modal.querySelector('.close-job-manager').onclick = closeModal;
    modal.querySelector('.refresh-job-manager').onclick = () => { closeModal(); showJobManager(jobName); };
    modal.querySelectorAll('.job-modal-action').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        closeModal();
        await jobAction(jobName, action);
        setTimeout(() => showJobManager(jobName), 900);
      });
    });
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };
  } catch(e) { showToast(e.message, 'error', 6000); } finally { showLoading(false); }
};

async function loadDisk() {
  const el = document.getElementById('disk-cards');
  el.innerHTML = '<div class="loading">در حال شناسایی درایوها...</div>';
  showLoading(true);
  try {
    const disks = await apiFetch(`${API}/disk/${currentServer}`);
    if (!Array.isArray(disks) || disks.length === 0) {
      el.innerHTML = '<div class="loading">هیچ درایوی شناسایی نشد.</div>';
      return;
    }
    el.innerHTML = disks.map(d => {
      const percent = clampPercent(d.UsedPercent);
      return `
        <div class="disk-card ${d.Status === 'Critical' ? 'disk-critical' : (d.Status === 'Warning' ? 'disk-warning' : '')}" data-key="${escapeAttr(d.Drive)}">
          <div class="drive-letter"><i class="fa-solid fa-hard-drive"></i> ${escapeHtml(d.Drive)}</div>
          <div class="disk-volume">${escapeHtml(d.VolumeName || '-')} | ${escapeHtml(d.FileSystem || '-')} | ${escapeHtml(d.DriveType || '-')}</div>
          <div class="disk-stats">
            <span>Used: ${escapeHtml(d.UsedGB)} GB (${percent}%)</span>
            <span>Free: ${escapeHtml(d.FreeGB)} GB</span>
            <span>Total: ${escapeHtml(d.TotalGB)} GB</span>
          </div>
          <div class="disk-bar-bg"><div class="disk-bar-fill ${percent>85?'high':percent>60?'medium':'low'}" style="width:${percent}%"></div></div>
          ${d.ProviderName ? `<div class="muted-line">Provider: ${escapeHtml(d.ProviderName)}</div>` : ''}
        </div>
      `;
    }).join('');
  } catch(e) { el.innerHTML = `<div class="loading error-cell">خطا: ${escapeHtml(e.message)}</div>`; showToast(e.message, 'error', 6000); } finally { showLoading(false); }
}

async function loadDatabases() {
  const tbody = document.getElementById('databases-body');
  if (!serverHasSql()) {
    tbody.innerHTML = `<tr><td colspan="9">${sqlDisabledHtml('Database')}</td></tr>`;
    document.getElementById('stat-databases').innerText = '-';
    return;
  }
  tbody.innerHTML = '<tr><td colspan="9" class="loading">در حال بررسی دیتابیس‌ها و وضعیت HA...</td></tr>';
  showLoading(true);
  try {
    const dbs = await apiFetch(`${API}/databases/${currentServer}`);
    if (!Array.isArray(dbs) || dbs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="loading">دیتابیسی یافت نشد.</td></tr>';
      return;
    }
    tbody.innerHTML = dbs.map(db => {
      const haLabel = db.ha_type === 'Standalone' ? 'Standalone' : `${db.availability_group || 'AG'} (${db.replica_summary?.length || 0} Replica)`;
      const syncLabel = db.ha_type === 'Standalone' ? '-' : (db.is_synchronized ? 'Synced' : 'Not Synced');
      const syncClass = db.ha_type === 'Standalone' ? 'status-notfound' : (db.is_synchronized ? 'status-running' : 'status-stopped');
      const queue = db.ha_type === 'Standalone' ? '-' : `Log: ${db.log_send_queue_size ?? 0} | Redo: ${db.redo_queue_size ?? 0}`;
      const replicaTip = (db.replica_summary || []).map(r => `${r.replica_server_name}: ${r.role || '-'} / ${r.sync_state || '-'} / ${r.health || '-'}`).join('\n');
      return `
        <tr class="db-row" data-key="${escapeAttr(db.name)}" data-db-name="${escapeAttr(db.name)}" title="${escapeAttr(replicaTip || 'برای جزئیات دیتابیس دابل‌کلیک کنید')}">
          <td><strong>${escapeHtml(db.name)}</strong><div class="muted-line">Compat: ${escapeHtml(db.compatibility_level || '-')}</div></td>
          <td><span class="status-badge ${statusClass(db.status)}">${escapeHtml(db.status)}</span></td>
          <td>${escapeHtml(db.recovery_model || '-')}</td>
          <td>${escapeHtml(db.size_mb || 0)}</td>
          <td>${escapeHtml(haLabel)}</td>
          <td>${escapeHtml(db.local_role || '-')}</td>
          <td><span class="status-badge ${syncClass}">${syncLabel}</span><div class="muted-line">${escapeHtml(db.synchronization_state || '')} ${escapeHtml(db.synchronization_health || '')}</div></td>
          <td>${escapeHtml(queue)}</td>
          <td class="table-actions"><button class="btn-action" onclick="event.stopPropagation(); showDatabaseDetails(${jsString(db.name)})"><i class="fa-solid fa-circle-info"></i> جزئیات</button></td>
        </tr>
      `;
    }).join('');
    tbody.querySelectorAll('.db-row').forEach(row => {
      row.addEventListener('dblclick', () => showDatabaseDetails(row.dataset.dbName));
    });
    document.getElementById('stat-databases').innerText = dbs.length;
  } catch(e) { tbody.innerHTML = `<tr><td colspan="9" class="error-cell">❌ ${escapeHtml(e.message)}</td></tr>`; showToast(`خطا: ${e.message}`, 'error', 6000); } finally { showLoading(false); }
}

function renderSimpleRows(rows, emptyColspan, mapper) {
  return (rows || []).map(mapper).join('') || `<tr><td colspan="${emptyColspan}" class="loading">داده‌ای برای نمایش وجود ندارد.</td></tr>`;
}

window.showDatabaseDetails = async (databaseName) => {
  if (!serverHasSql()) { showToast('برای این سرور SQL فعال نیست.', 'warning'); return; }
  showLoading(true);
  try {
    const details = await apiFetch(`${API}/databases/${currentServer}/details/${encodeURIComponent(databaseName)}`);
    const db = details.database || {};
    const files = details.files || [];
    const backups = details.backups || [];
    const replicas = details.ha_replicas || [];
    const haState = db.ha_type === 'Standalone' ? 'Standalone' : (db.is_synchronized ? 'Synced' : 'Not Synced');
    const modal = document.createElement('div');
    modal.className = 'glass-modal job-manager-modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal-window database-details-window">
        <div class="modal-header">
          <span><i class="fa-solid fa-database"></i> جزئیات دیتابیس: ${escapeHtml(databaseName)}</span>
          <span class="modal-close close-db-details">&times;</span>
        </div>
        <div class="modal-body">
          <div class="details-grid db-summary-grid">
            <div class="mini-card"><small>Status</small><strong><span class="status-badge ${statusClass(db.status)}">${escapeHtml(db.status || '-')}</span></strong></div>
            <div class="mini-card"><small>Recovery</small><strong>${escapeHtml(db.recovery_model || '-')}</strong></div>
            <div class="mini-card"><small>Total Size</small><strong>${escapeHtml(db.total_size_mb ?? '-')} MB</strong><span>Data: ${escapeHtml(db.data_size_mb ?? '-')} | Log: ${escapeHtml(db.log_size_mb ?? '-')}</span></div>
            <div class="mini-card"><small>HA</small><strong><span class="status-badge ${statusClass(haState)}">${escapeHtml(haState)}</span></strong></div>
            <div class="mini-card"><small>Last CHECKDB</small><strong>${formatDate(db.last_good_checkdb_time)}</strong></div>
            <div class="mini-card"><small>Log Reuse Wait</small><strong>${escapeHtml(db.log_reuse_wait_desc || '-')}</strong></div>
          </div>

          <section class="modal-section">
            <h3><i class="fa-solid fa-sliders"></i> تنظیمات و وضعیت</h3>
            <div class="kv-grid">
              <div><b>Collation:</b> ${escapeHtml(db.collation_name || '-')}</div>
              <div><b>User Access:</b> ${escapeHtml(db.user_access_desc || '-')}</div>
              <div><b>Compatibility:</b> ${escapeHtml(db.compatibility_level || '-')}</div>
              <div><b>Page Verify:</b> ${escapeHtml(db.page_verify_option_desc || '-')}</div>
              <div><b>Snapshot Isolation:</b> ${escapeHtml(db.snapshot_isolation_state_desc || '-')}</div>
              <div><b>Read Committed Snapshot:</b> ${db.is_read_committed_snapshot_on ? 'ON' : 'OFF'}</div>
              <div><b>Read Only:</b> ${db.is_read_only ? 'YES' : 'NO'}</div>
              <div><b>Auto Close:</b> ${db.is_auto_close_on ? 'ON' : 'OFF'}</div>
              <div><b>Auto Shrink:</b> ${db.is_auto_shrink_on ? 'ON' : 'OFF'}</div>
              <div><b>Create Date:</b> ${formatDate(db.create_date)}</div>
            </div>
          </section>

          <section class="modal-section">
            <h3><i class="fa-solid fa-diagram-project"></i> Availability Group / Replica Health</h3>
            <div class="table-wrap">
              <table class="data-table compact-table">
                <thead><tr><th>AG</th><th>Replica</th><th>Role</th><th>Sync State</th><th>Health</th><th>Queue</th><th>Last Commit</th></tr></thead>
                <tbody>
                  ${renderSimpleRows(replicas, 7, r => `
                    <tr class="${r.synchronization_health_desc && r.synchronization_health_desc !== 'HEALTHY' ? 'row-danger' : ''}">
                      <td>${escapeHtml(r.availability_group || '-')}</td>
                      <td>${escapeHtml(r.replica_server_name || '-')} ${r.is_local ? '<span class="mini-status mini-ok">Local</span>' : ''}</td>
                      <td>${escapeHtml(r.replica_role || '-')}</td>
                      <td>${escapeHtml(r.synchronization_state_desc || '-')}</td>
                      <td><span class="status-badge ${statusClass(r.synchronization_health_desc)}">${escapeHtml(r.synchronization_health_desc || '-')}</span></td>
                      <td>Log: ${escapeHtml(r.log_send_queue_size ?? 0)} | Redo: ${escapeHtml(r.redo_queue_size ?? 0)}</td>
                      <td>${formatDate(r.last_commit_time)}</td>
                    </tr>
                  `)}
                </tbody>
              </table>
            </div>
          </section>

          <section class="modal-section">
            <h3><i class="fa-solid fa-file-circle-info"></i> فایل‌های دیتابیس</h3>
            <div class="table-wrap">
              <table class="data-table compact-table">
                <thead><tr><th>Logical Name</th><th>Type</th><th>State</th><th>Size MB</th><th>Growth</th><th>Path</th></tr></thead>
                <tbody>
                  ${renderSimpleRows(files, 6, f => `
                    <tr>
                      <td>${escapeHtml(f.name || '-')}</td>
                      <td>${escapeHtml(f.type_desc || '-')}</td>
                      <td>${escapeHtml(f.state_desc || '-')}</td>
                      <td>${escapeHtml(f.size_mb ?? '-')}</td>
                      <td>${f.is_percent_growth ? `${escapeHtml(f.growth)}%` : `${escapeHtml(f.growth)} pages`}</td>
                      <td class="path-cell">${escapeHtml(f.physical_name || '-')}</td>
                    </tr>
                  `)}
                </tbody>
              </table>
            </div>
          </section>

          <section class="modal-section">
            <h3><i class="fa-solid fa-clock-rotate-left"></i> آخرین Backupها</h3>
            <div class="table-wrap">
              <table class="data-table compact-table">
                <thead><tr><th>نوع</th><th>شروع</th><th>پایان</th><th>Size MB</th><th>Compressed MB</th><th>Path</th></tr></thead>
                <tbody>
                  ${renderSimpleRows(backups, 6, b => `
                    <tr>
                      <td>${escapeHtml(b.backup_type || '-')}</td>
                      <td>${formatDate(b.backup_start_date)}</td>
                      <td>${formatDate(b.backup_finish_date)}</td>
                      <td>${escapeHtml(b.backup_size_mb ?? '-')}</td>
                      <td>${escapeHtml(b.compressed_size_mb ?? '-')}</td>
                      <td class="path-cell">${escapeHtml(b.physical_device_name || '-')}</td>
                    </tr>
                  `)}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const closeModal = () => modal.remove();
    modal.querySelector('.close-db-details').onclick = closeModal;
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };
  } catch(e) { showToast(e.message, 'error', 7000); } finally { showLoading(false); }
};

async function loadConnectivity() {
  const el = document.getElementById('connectivity-list');
  if (!serverHasSql()) {
    el.innerHTML = sqlDisabledHtml('Linked Server');
    return;
  }
  el.innerHTML = '<div class="loading">در حال بارگذاری...</div>';
  showLoading(true);
  try {
    linkedServerTestState = {};
    const linked = await apiFetch(`${API}/connectivity/${currentServer}`);
    currentLinkedServers = Array.isArray(linked) ? linked : [];
    if (!currentLinkedServers.length) {
      el.innerHTML = '<div class="loading">Linked Serverای تعریف نشده است.</div>';
      return;
    }
    renderLinkedServers(currentLinkedServers);
  } catch(e) {
    el.innerHTML = `<div class="loading error-cell">${escapeHtml(e.message)}</div>`;
    showToast(e.message, 'error', 6000);
  } finally { showLoading(false); }
}

function getLinkedName(item) {
  return String(item?.name || item?.linkedName || item?.server || item?.linked_server_name || item?.data_source || '').trim();
}

function pickLinkedValue(source, ...keys) {
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
  }
  return '';
}

function normalizeLinkedTestValue(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['passed', 'pass', 'ok', 'success', 'succeeded', 'true', '1'].includes(raw)) return 'Passed';
  if (['failed', 'fail', 'error', 'false', '0'].includes(raw)) return 'Failed';
  if (['skipped', 'skip'].includes(raw)) return 'Skipped';
  if (['nottested', 'not tested', 'unknown', ''].includes(raw)) return 'NotTested';
  return String(value || 'NotTested');
}

function normalizeLinkedState(c) {
  const linkedName = getLinkedName(c);
  const override = linkedServerTestState[linkedName] || linkedServerTestState[c?.name] || linkedServerTestState[c?.server] || linkedServerTestState[c?.linkedName] || null;
  const source = override ? { ...c, ...override, name: linkedName, server: linkedName, linkedName } : { ...c, name: linkedName, server: linkedName, linkedName };

  const spTestStatus = normalizeLinkedTestValue(pickLinkedValue(source, 'spTestStatus', 'sp_test_status', 'ssmsTestStatus', 'ssms_test_status'));
  const remoteQueryStatus = normalizeLinkedTestValue(pickLinkedValue(source, 'remoteQueryStatus', 'remote_query_status', 'queryStatus', 'query_status'));
  const rawStatus = String(pickLinkedValue(source, 'status', 'connectionStatus', 'connection_status', 'finalVerdict', 'final_verdict') || 'NotTested');
  const rawStatusLower = rawStatus.toLowerCase();

  let status = 'NotTested';
  if (spTestStatus === 'Failed') {
    status = 'Failed';
  } else if (spTestStatus === 'Passed') {
    // معیار اصلی Connected بودن همان sp_testlinkedserver / Test Connection در SSMS است.
    // Remote Query فقط تست تکمیلی است و مخصوصاً برای Oracle نباید کارت را Failed کند.
    status = 'Connected';
  } else if (rawStatusLower === 'failed') {
    status = 'Failed';
  } else if (rawStatusLower === 'connected') {
    // جلوگیری از سبز شدن غلط: status=Connected بدون spTestStatus=Passed معتبر نیست.
    status = 'NotTested';
  } else if (rawStatusLower === 'warning' || rawStatusLower.includes('dataaccess') || rawStatusLower.includes('querywarning')) {
    status = 'Warning';
  }

  let message = pickLinkedValue(source, 'message', 'lastTestMessage', 'last_test_message', 'error') || '';
  if (rawStatusLower === 'connected' && spTestStatus !== 'Passed') {
    message = 'تست معتبر نیست.';
  }
  if (spTestStatus === 'Passed' && remoteQueryStatus === 'Failed' && !message) {
    message = 'Linked Server وصل است؛ فقط Remote Query تکمیلی ناموفق بود.';
  }

  return {
    name: linkedName,
    status,
    connectionStatus: status,
    finalVerdict: pickLinkedValue(source, 'finalVerdict', 'final_verdict') || status,
    message,
    hint: pickLinkedValue(source, 'hint') || '',
    details: pickLinkedValue(source, 'details', 'detail') || '',
    failedStage: pickLinkedValue(source, 'failedStage', 'failed_stage') || '',
    spTestStatus,
    spTestMessage: pickLinkedValue(source, 'spTestMessage', 'sp_test_message') || '',
    remoteQueryStatus,
    remoteQueryMessage: pickLinkedValue(source, 'remoteQueryMessage', 'remote_query_message') || '',
    tcpStatus: normalizeLinkedTestValue(pickLinkedValue(source, 'tcpStatus', 'tcp_status')) || 'Skipped',
    tcpMessage: pickLinkedValue(source, 'tcpMessage', 'tcp_message') || 'TCP در نتیجه نهایی دخیل نیست؛ معیار اتصال تست SQL است.',
    remoteServerName: pickLinkedValue(source, 'remoteServerName', 'remote_server_name') || '',
    remoteDatabaseName: pickLinkedValue(source, 'remoteDatabaseName', 'remote_database_name') || '',
    remoteTime: pickLinkedValue(source, 'remoteTime', 'remote_time') || '',
    testedAt: pickLinkedValue(source, 'testedAt', 'tested_at', 'lastTestedAt', 'last_tested_at') || null
  };
}

function miniStatusClass(value) {
  if (value === 'Passed') return 'mini-ok';
  if (value === 'Failed') return 'mini-fail';
  if (value === 'Skipped') return 'mini-skip';
  return '';
}

function linkedStatusLabel(state) {
  if (state.status === 'Connected') return 'Connected';
  if (state.status === 'Failed') return 'Failed';
  if (state.status === 'Warning') return 'Warning';
  return 'Not tested';
}

function linkedVerdictHtml(state) {
  if (state.status === 'Connected') {
    return '<i class="fa-solid fa-circle-check"></i> وصل است';
  }
  if (state.status === 'Warning') {
    return '<i class="fa-solid fa-triangle-exclamation"></i> ناقص';
  }
  if (state.status === 'Failed') {
    return '<i class="fa-solid fa-circle-xmark"></i> قطع است';
  }
  return '<i class="fa-solid fa-circle-question"></i> تست نشده';
}

function linkedMatchesFilter(item, term, filter) {
  const linkedName = getLinkedName(item);
  const state = normalizeLinkedState({ ...item, name: linkedName, server: linkedName, linkedName });
  const haystack = [
    linkedName,
    item.provider,
    item.product,
    item.data_source,
    item.catalog,
    state.message,
    state.spTestMessage,
    state.remoteQueryMessage,
    state.remoteServerName,
    state.failedStage
  ].map(x => String(x || '').toLowerCase()).join(' ');
  const textOk = !term || haystack.includes(term);
  const status = String(state.status || 'NotTested').toLowerCase().replace(/\s+/g, '');
  let filterOk = true;
  if (filter === 'connected') filterOk = status === 'connected';
  if (filter === 'failed') filterOk = status === 'failed';
  if (filter === 'warning') filterOk = status === 'warning';
  if (filter === 'nottested') filterOk = status === 'nottested' || status === 'unknown' || !status;
  return { ok: textOk && filterOk, state };
}

function renderLinkedServers(linked) {
  const el = document.getElementById('connectivity-list');
  const countEl = document.getElementById('linked-count');
  if (!el) return;
  const term = String(document.getElementById('linked-search')?.value || '').trim().toLowerCase();
  const filter = String(document.getElementById('linked-status-filter')?.value || 'all').toLowerCase();
  const normalized = (Array.isArray(linked) ? linked : []).map((c, index) => {
    const linkedName = getLinkedName(c);
    const safeName = linkedName || `linked-${index}`;
    const match = linkedMatchesFilter(c, term, filter);
    return { raw: c, linkedName, safeName, state: match.state, visible: match.ok };
  });
  const visibleRows = normalized.filter(x => x.visible);
  if (countEl) countEl.innerText = `${visibleRows.length}/${normalized.length} Linked`;

  if (!normalized.length) {
    el.innerHTML = '<div class="loading">Linked Serverای تعریف نشده است.</div>';
    return;
  }
  if (!visibleRows.length) {
    el.innerHTML = '<div class="loading">موردی با این فیلتر پیدا نشد.</div>';
    return;
  }

  el.innerHTML = `
    <div class="table-wrap ops-table-wrap linked-table-wrap">
      <table class="data-table compact-ops-table linked-table">
        <thead>
          <tr>
            <th>Linked Server</th>
            <th>وضعیت</th>
            <th>Provider / Data Source</th>
            <th>تست‌ها</th>
            <th>آخرین تست</th>
            <th>عملیات</th>
          </tr>
        </thead>
        <tbody>
          ${visibleRows.map(({ raw: c, linkedName, safeName, state }) => {
            const ok = state.status === 'Connected';
            const failed = state.status === 'Failed';
            const queryWarning = ok && state.remoteQueryStatus === 'Failed';
            const warning = state.status === 'Warning' || queryWarning;
            const badgeClass = ok ? 'status-running' : (failed ? 'status-stopped' : 'status-warning');
            const rowClass = failed ? 'row-danger' : (warning ? 'row-warning' : '');
            const detailsText = state.details || state.spTestMessage || state.remoteQueryMessage || state.message || '';
            const remoteIdentity = state.remoteServerName
              ? `<div class="muted-line ltr-line">${escapeHtml(state.remoteServerName)} / ${escapeHtml(state.remoteDatabaseName || '-')} ${escapeHtml(state.remoteTime || '')}</div>`
              : '';
            return `
              <tr class="linked-row ${rowClass}" data-key="${escapeAttr(safeName)}">
                <td class="linked-name-cell">
                  <strong><i class="fa-solid fa-link"></i> ${escapeHtml(linkedName || 'Linked Server بدون نام')}</strong>
                  ${state.failedStage ? `<span class="muted-line">Stage: ${escapeHtml(state.failedStage)}</span>` : ''}
                </td>
                <td class="nowrap"><span class="status-badge ${badgeClass}">${escapeHtml(linkedStatusLabel(state))}</span></td>
                <td class="linked-meta-cell">
                  <span>${escapeHtml(c.provider || '-')}</span>
                  <small>${escapeHtml(c.data_source || '-')}</small>
                  <small>Data Access: ${c.is_data_access_enabled ? 'Enabled' : 'Disabled'} / RPC Out: ${c.is_rpc_out_enabled ? 'Enabled' : 'Disabled'}</small>
                </td>
                <td class="linked-tests-cell">
                  <span class="mini-status ${miniStatusClass(state.spTestStatus)}">SSMS: ${escapeHtml(state.spTestStatus)}</span>
                  <span class="mini-status ${miniStatusClass(state.remoteQueryStatus)}">Query: ${escapeHtml(state.remoteQueryStatus)}</span>
                </td>
                <td class="linked-message-cell">
                  <strong>${escapeHtml(state.message || '-')}</strong>
                  ${remoteIdentity}
                  ${detailsText ? `<details><summary>جزئیات</summary><pre>${escapeHtml(detailsText)}</pre></details>` : ''}
                </td>
                <td class="compact-actions">
                  <button class="primary-btn small-primary linked-test-btn" type="button" data-action="test-linked" data-linked-name="${escapeAttr(linkedName)}" ${!linkedName ? 'disabled' : ''}><i class="fa-solid fa-vial"></i> تست</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  el.querySelectorAll('[data-action="test-linked"]').forEach(btn => {
    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await testLinkedServer(btn.dataset.linkedName);
    });
  });
}


window.testLinkedServer = async (linkedName) => {
  const cleanName = String(linkedName || '').trim();
  if (!cleanName) return showToast('نام Linked Server مشخص نیست.', 'error', 5000);
  const card = [...document.querySelectorAll('.linked-row, .conn-card')].find(x => x.dataset.key === cleanName);
  const btn = card?.querySelector('[data-action="test-linked"]');
  if (card) card.classList.add('testing');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> در حال تست...';
  }
  showLoading(true);
  try {
    const result = await apiFetch(`${API}/connectivity/${currentServer}/test`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ linkedName: cleanName, name: cleanName, server: cleanName })
    });

    const normalizedResult = { ...result, name: cleanName, server: cleanName, linkedName: cleanName };
    linkedServerTestState[cleanName] = normalizedResult;
    currentLinkedServers = currentLinkedServers.map(item => {
      const itemName = getLinkedName(item);
      return itemName === cleanName ? { ...item, ...normalizedResult, name: cleanName, server: cleanName, linkedName: cleanName } : item;
    });
    renderLinkedServers(currentLinkedServers);

    const state = normalizeLinkedState(normalizedResult);
    if (state.status === 'Connected') {
      showToast('✅ Linked Server وصل است و Query واقعی هم پاس شد', 'success', 7000);
    } else if (state.status === 'Warning') {
      showToast(`⚠️ تست اصلی پاس شد ولی Query عملیاتی کامل نیست: ${state.message || ''}`, 'warning', 9000);
    } else {
      showToast(`❌ Linked Server وصل/قابل استفاده نیست: ${state.message || 'تست Fail شد'}`, 'error', 9000);
    }
    await updateDashboardStats();
  } catch(e) {
    showToast(e.message, 'error', 9000);
  } finally {
    if (card) card.classList.remove('testing');
    showLoading(false);
  }
};


async function loadConnectivityKeepState() {
  renderLinkedServers(currentLinkedServers);
}

window.testAllLinkedServers = async () => {
  if (!serverHasSql()) { showToast('برای این سرور SQL فعال نیست.', 'warning'); return; }
  showLoading(true);
  try {
    const previous = currentLinkedServers.slice();
    const results = await apiFetch(`${API}/connectivity/${currentServer}/test`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({})
    });

    const resultArray = Array.isArray(results) ? results : [];
    currentLinkedServers = resultArray.map((r, index) => {
      const old = previous[index] || {};
      const name = getLinkedName(r) || getLinkedName(old);
      return { ...old, ...r, name, server: name, linkedName: name };
    });

    linkedServerTestState = {};
    for (const r of currentLinkedServers) {
      const name = getLinkedName(r);
      if (name) linkedServerTestState[name] = r;
    }
    renderLinkedServers(currentLinkedServers);
    const failed = currentLinkedServers.filter(r => normalizeLinkedState(r).status === 'Failed').length;
    const warnings = currentLinkedServers.filter(r => normalizeLinkedState(r).status === 'Warning').length;
    if (failed) showToast(`❌ ${failed} Linked Server Fail است`, 'error', 9000);
    else if (warnings) showToast(`⚠️ ${warnings} Linked Server فقط بخشی از تست را پاس کرده است`, 'warning', 9000);
    else showToast('✅ همه Linked Serverها وصل و قابل Query هستند', 'success', 8000);
    await updateDashboardStats();
  } catch(e) {
    showToast(e.message, 'error', 9000);
  } finally { showLoading(false); }
};


async function loadAlerts(global = false) {
  const list = document.getElementById('alerts-list');
  const summary = document.getElementById('alerts-summary');
  if (!list || !summary) return;
  list.innerHTML = '<div class="loading">در حال جمع‌آوری هشدارها...</div>';
  summary.innerHTML = '';
  showLoading(true);
  try {
    const url = global ? `${API}/alerts` : `${API}/alerts/${currentServer}`;
    const alerts = await apiFetch(url);
    latestAlerts = Array.isArray(alerts) ? alerts : [];
    renderAlerts(latestAlerts, global);
    document.getElementById('stat-alerts').innerText = latestAlerts.filter(a => !currentServer || a.serverId === currentServer).length;
  } catch(e) {
    list.innerHTML = `<div class="loading error-cell">${escapeHtml(e.message)}</div>`;
    showToast(e.message, 'error', 6000);
  } finally { showLoading(false); }
}

function renderAlerts(alerts, global = false) {
  const list = document.getElementById('alerts-list');
  const summary = document.getElementById('alerts-summary');
  const critical = alerts.filter(a => a.severity === 'critical').length;
  const warning = alerts.filter(a => a.severity === 'warning').length;
  summary.innerHTML = `
    <div class="alert-counter critical"><strong>${critical}</strong><span>Critical</span></div>
    <div class="alert-counter warning"><strong>${warning}</strong><span>Warning</span></div>
    <div class="alert-counter"><strong>${alerts.length}</strong><span>کل هشدارها${global ? ' / همه سرورها' : ''}</span></div>
  `;
  if (!alerts.length) {
    list.innerHTML = '<div class="empty-alerts"><i class="fa-solid fa-circle-check"></i> هشدار فعالی وجود ندارد.</div>';
    return;
  }
  list.innerHTML = alerts.map(a => `
    <div class="alert-card ${a.severity === 'critical' ? 'alert-critical' : 'alert-warning'}" data-alert-tab="${escapeAttr(a.targetTab || 'alerts')}" data-alert-key="${escapeAttr(a.key || '')}">
      <div class="alert-head">
        <span class="alert-severity">${a.severity === 'critical' ? 'Critical' : 'Warning'}</span>
        <span class="alert-category">${escapeHtml(a.category)}</span>
        <span class="alert-time">${formatDate(a.timestamp)}</span>
      </div>
      <h3>${escapeHtml(a.title)}</h3>
      <p>${escapeHtml(a.message)}</p>
      <div class="alert-foot">
        <span><i class="fa-solid fa-server"></i> ${escapeHtml(a.serverName || a.serverId || '-')}</span>
        <button class="primary-btn small-primary alert-nav-btn" data-server-id="${escapeAttr(a.serverId || '')}" data-target-tab="${escapeAttr(a.targetTab || 'alerts')}" data-key="${escapeAttr(a.key || '')}"><i class="fa-solid fa-arrow-left"></i> ${escapeHtml(a.actionLabel || 'رفتن به بخش')}</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.alert-nav-btn').forEach(btn => {
    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await navigateToAlert(btn.dataset.serverId, btn.dataset.targetTab, btn.dataset.key);
    });
  });
}

window.navigateToAlert = async (serverId, targetTab, key) => {
  const tab = targetTab || 'alerts';
  showLoading(true);
  try {
    if (serverId && serverId !== currentServer) await selectServer(serverId);
    await openTab(tab);
    setTimeout(() => focusTargetInTab(tab, key), 450);
    if (tab === 'jobs' && key && !key.endsWith('-error')) setTimeout(() => showJobManager(key), 700);
    if (tab === 'databases' && key && !key.endsWith('-error')) setTimeout(() => showDatabaseDetails(key), 700);
  } catch (e) {
    showToast(`خطا در رفتن به بخش مربوطه: ${e.message}`, 'error', 6000);
  } finally {
    showLoading(false);
  }
};

async function openTab(tab) {
  if (!serverHasSql() && ['jobs', 'databases', 'connectivity'].includes(tab)) {
    showToast('این سرور بدون SQL ثبت شده است.', 'warning');
    tab = 'dashboard';
  }
  if (!serverHasIis() && tab === 'iis') {
    showToast('برای این سرور IIS فعال نیست.', 'warning');
    tab = 'dashboard';
  }
  if (!serverHasCredit() && tab === 'credit') {
    showToast('برای این سرور سامانه اعتباری فعال نیست.', 'warning');
    tab = 'dashboard';
  }
  const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  const pane = document.getElementById(`tab-${tab}`);
  if (!btn || !pane) return;
  document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  pane.classList.add('active');
  btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  if (currentServer) await loadTab(tab);
}

function focusTargetInTab(tab, key) {
  if (!key) return;
  let selector = `[data-key="${cssEscapeValue(key)}"]`;
  const scope = document.getElementById(`tab-${tab}`) || document;
  const target = scope.querySelector(selector);
  if (!target) return;
  target.classList.add('target-highlight');
  target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  setTimeout(() => target.classList.remove('target-highlight'), 3500);
}

function cssEscapeValue(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value));
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ========== system metrics ==========
function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampPercent(value) {
  const n = toFiniteNumber(value, 0);
  return Math.max(0, Math.min(100, n));
}

function formatUptime(data) {
  const days = Number(data?.uptimeDays);
  const hours = Number(data?.uptimeHours);
  const minutes = Number(data?.uptimeMinutes);

  if ([days, hours, minutes].every(Number.isFinite)) {
    const parts = [];
    if (days > 0) parts.push(`${days} روز`);
    if (hours > 0 || days > 0) parts.push(`${hours} ساعت`);
    parts.push(`${minutes} دقیقه`);
    return parts.join(' و ');
  }

  if (typeof data?.uptime === 'string' && data.uptime.trim() && !data.uptime.includes('?')) {
    const match = data.uptime.match(/(\d+)\s*d\s*(\d+)\s*h\s*(\d+)\s*m/i);
    if (match) return formatUptime({ uptimeDays: match[1], uptimeHours: match[2], uptimeMinutes: match[3] });
    return data.uptime;
  }

  return 'نامشخص';
}

function formatBootTime(value) {
  if (!value) return 'آخرین بوت: --';
  return `آخرین بوت: ${value}`;
}

function setMetricBar(bar, percent) {
  const safePercent = clampPercent(percent);
  bar.style.width = `${safePercent}%`;
  bar.style.background = safePercent > 80 ? 'var(--error)' : (safePercent > 60 ? 'var(--warning)' : 'var(--success)');
  return safePercent;
}

function startSystemAutoRefresh() {
  if (systemAutoRefreshInterval) clearInterval(systemAutoRefreshInterval);
  systemAutoRefreshInterval = setInterval(() => {
    if (document.getElementById('tab-system')?.classList.contains('active')) loadSystemMetrics();
  }, 5000);
}

function stopSystemAutoRefresh() {
  if (systemAutoRefreshInterval) clearInterval(systemAutoRefreshInterval);
  systemAutoRefreshInterval = null;
}

function handleSystemAutoRefreshChange(e) {
  systemAutoRefreshEnabled = e.target.checked;
  if (systemAutoRefreshEnabled) startSystemAutoRefresh();
  else stopSystemAutoRefresh();
}

async function loadSystemMetrics() {
  if (!currentServer) return;
  const cpuVal = document.getElementById('cpu-value');
  const ramVal = document.getElementById('ram-value');
  const ramDetail = document.getElementById('ram-detail');
  const uptimeVal = document.getElementById('uptime-value');
  const bootTimeEl = document.getElementById('boot-time');
  const cpuBar = document.getElementById('cpu-bar');
  const ramBar = document.getElementById('ram-bar');
  if (!cpuVal) return;
  try {
    const res = await fetch(`${API}/system/${currentServer}`);
    if (!res.ok) throw new Error((await res.json()).error || 'خطا');
    const data = await res.json();
    const cpuPercent = setMetricBar(cpuBar, data.cpuPercent);
    const ramPercent = setMetricBar(ramBar, data.ramPercent);
    cpuVal.innerText = `${cpuPercent.toFixed(cpuPercent % 1 === 0 ? 0 : 1)}%`;
    ramVal.innerText = `${ramPercent.toFixed(ramPercent % 1 === 0 ? 0 : 1)}%`;
    ramDetail.innerText = `${toFiniteNumber(data.usedRAM_GB, 0)} GB / ${toFiniteNumber(data.totalRAM_GB, 0)} GB`;
    uptimeVal.innerText = formatUptime(data);
    bootTimeEl.innerText = formatBootTime(data.bootTime);
  } catch(e) {
    cpuVal.innerText = 'خطا';
    ramVal.innerText = 'خطا';
    uptimeVal.innerText = e.message;
    console.error(e);
  }
}

window.loadFiles = async () => {
  const path = document.getElementById('file-path').value;
  if (!path) { showToast('لطفاً مسیر را وارد کنید', 'error'); return; }
  const tbody = document.getElementById('files-body');
  const errorDiv = document.getElementById('file-error-msg');
  errorDiv.innerHTML = '';
  tbody.innerHTML = '<tr><td colspan="3" class="loading">در حال بارگذاری...</td></tr>';
  showLoading(true);
  try {
    const res = await fetch(`${API}/files/${currentServer}?path=${encodeURIComponent(path)}`);
    if (res.status === 403) {
      const errorData = await res.json();
      const allowedRoots = errorData.error.match(/Allowed roots: (.*)/)?.[1] || 'نامشخص';
      errorDiv.innerHTML = `<div class="warning-note"><strong>⛔ دسترسی غیرمجاز</strong><br>مسیر: ${escapeHtml(path)}<br>روت‌های مجاز: ${escapeHtml(allowedRoots)}<br><button id="add-path-btn" class="action-btn" style="margin-top:8px;">➕ افزودن به لیست مجاز</button></div>`;
      document.getElementById('add-path-btn')?.addEventListener('click', () => addAllowedPath(path));
      tbody.innerHTML = '<tr><td colspan="3">برای دسترسی، مسیر را به لیست مجاز اضافه کنید.</td></tr>';
      return;
    }
    if (!res.ok) throw new Error(await res.text());
    const files = await res.json();
    tbody.innerHTML = files.map(f => `<tr><td>${escapeHtml(f.Name)}</td><td>${f.SizeMB}</td><td>${f.LastModified}</td></tr>`).join('');
  } catch(e) { tbody.innerHTML = `<tr><td colspan="3">❌ ${escapeHtml(e.message)}</td></tr>`; } finally { showLoading(false); }
};

async function addAllowedPath(path) {
  showLoading(true);
  try {
    let normalizedPath = path.trim().replace(/\\+$/, '');
    const res = await fetch(`${API}/servers/${currentServer}/allowed-paths`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: normalizedPath, type: 'logs' })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`✅ مسیر ${normalizedPath} به لیست مجاز اضافه شد`, 'success');
      document.getElementById('file-path').value = path;
      await loadFiles();
    } else { showToast(`❌ خطا: ${data.error || 'ناشناخته'}`, 'error'); }
  } catch(e) { showToast(`خطا: ${e.message}`, 'error'); } finally { showLoading(false); }
}

async function loadServerSettings() {
  if (!currentServer) return;
  showLoading(true);
  try {
    const server = currentServerMeta || await apiFetch(`${API}/servers/${currentServer}`);
    currentServerMeta = server;
    currentServerHost = server.host;
    const hasSql = serverHasSql(server);
    const hasIis = serverHasIis(server);
    const div = document.getElementById('server-settings');
    div.innerHTML = `
      <div class="settings-grid">
        <div class="input-group"><label>نام سرور</label><input type="text" id="edit-name" value="${escapeAttr(server.name)}" class="neo-input"></div>
        <div class="input-group"><label>Host</label><input type="text" id="edit-host" value="${escapeAttr(server.host)}" class="neo-input"></div>
      </div>
      <div class="settings-section-card">
        <h3><i class="fa-solid fa-terminal"></i> WinRM / Windows</h3>
        <div class="settings-grid">
          <div class="input-group"><label>WinRM Auth Type</label><select id="edit-winrm-auth" class="neo-select"><option value="local" ${server.winrm?.authType==='local'?'selected':''}>Local</option><option value="default" ${server.winrm?.authType==='default'?'selected':''}>Default</option><option value="credential" ${server.winrm?.authType==='credential'?'selected':''}>Credential</option></select></div>
        </div>
        <div id="winrm-cred-fields" class="cred-fields" style="display:${server.winrm?.authType==='credential'?'block':'none'}"><div class="credential-grid"><div class="input-group"><label>Windows Computer Name</label><input type="text" id="edit-winrm-computer" value="${escapeAttr(server.winrm?.computerName||'')}" class="neo-input ltr-input"></div><div class="input-group"><label>Username</label><input type="text" id="edit-winrm-user" value="${escapeAttr(server.winrm?.username||'')}" class="neo-input ltr-input"></div><div class="input-group"><label>Password</label><input type="password" id="edit-winrm-pass" value="${escapeAttr(server.winrm?.password||'')}" class="neo-input ltr-input"></div></div></div>
      </div>
      <div class="settings-section-card">
        <h3><i class="fa-solid fa-database"></i> SQL Server</h3>
        <label class="switch-row"><input type="checkbox" id="edit-has-sql" ${hasSql ? 'checked' : ''}><span>این سرور SQL Server دارد</span></label>
        <div id="edit-sql-fields" style="display:${hasSql ? 'block' : 'none'}">
          <div class="settings-grid">
            <div class="input-group"><label>SQL Auth Type</label><select id="edit-sql-auth" class="neo-select"><option value="windows" ${server.sql?.authType==='windows'?'selected':''}>Windows</option><option value="sql" ${server.sql?.authType==='sql'?'selected':''}>SQL</option></select></div>
            <div class="input-group"><label>SQL Server</label><input type="text" id="edit-sql-server" value="${escapeAttr(server.sql?.server||server.host||'')}" class="neo-input"></div>
            <div class="input-group"><label>SQL Port</label><input type="text" id="edit-sql-port" value="${server.sql?.port||1433}" class="neo-input"></div>
          </div>
          <div id="sql-cred-fields" class="cred-fields" style="display:${server.sql?.authType==='sql'?'block':'none'}"><div class="credential-grid"><div class="input-group"><label>SQL User</label><input type="text" id="edit-sql-user" value="${escapeAttr(server.sql?.username||'')}" class="neo-input"></div><div class="input-group"><label>SQL Password</label><input type="password" id="edit-sql-pass" value="${escapeAttr(server.sql?.password||'')}" class="neo-input"></div></div></div>
        </div>
      </div>
      <div class="settings-section-card">
        <h3><i class="fa-solid fa-globe"></i> IIS / Web Server</h3>
        <label class="switch-row"><input type="checkbox" id="edit-has-iis" ${hasIis ? 'checked' : ''}><span>این سرور IIS / Web Server دارد</span></label>
      </div>
      <div class="settings-section-card">
        <h3><i class="fa-solid fa-credit-card"></i> سامانه اعتباری</h3>
        <label class="switch-row"><input type="checkbox" id="edit-has-credit" ${serverHasCredit(server) ? 'checked' : ''}><span>این سرور میزبان سامانه اعتباری / SPهای اعتباری است</span></label>
      </div>
      <div class="input-group"><label>Allowed Paths (one per line)</label><textarea id="edit-allowed-paths" rows="3" class="neo-input">${[...(server.paths?.logs||[]),...(server.paths?.backups||[])].join('\n')}</textarea></div>
      <button id="save-settings-btn" class="primary-btn">ذخیره تنظیمات</button>
    `;
    document.getElementById('edit-winrm-auth').onchange = (e) => document.getElementById('winrm-cred-fields').style.display = e.target.value==='credential'?'block':'none';
    document.getElementById('edit-has-sql').onchange = (e) => document.getElementById('edit-sql-fields').style.display = e.target.checked ? 'block' : 'none';
    document.getElementById('edit-sql-auth')?.addEventListener('change', (e) => {
      const box = document.getElementById('sql-cred-fields');
      if (box) box.style.display = e.target.value==='sql'?'block':'none';
    });
    document.getElementById('save-settings-btn').onclick = async () => {
      const sqlEnabled = document.getElementById('edit-has-sql').checked;
      const iisEnabled = document.getElementById('edit-has-iis')?.checked === true;
      const creditEnabled = document.getElementById('edit-has-credit')?.checked === true;
      const sqlAuth = document.getElementById('edit-sql-auth')?.value || 'windows';
      const newData = {
        name: document.getElementById('edit-name').value.trim(),
        host: document.getElementById('edit-host').value.trim(),
        features: { winrm: true, sql: sqlEnabled, iis: iisEnabled, credit: creditEnabled },
        winrm: { authType: document.getElementById('edit-winrm-auth').value, computerName: document.getElementById('edit-winrm-computer')?.value||'', username: document.getElementById('edit-winrm-user')?.value||'', password: document.getElementById('edit-winrm-pass')?.value||'' },
        iis: iisEnabled ? { enabled: true } : null,
        credit: creditEnabled ? { enabled: true } : null,
        sql: sqlEnabled ? { enabled: true, authType: sqlAuth, server: document.getElementById('edit-sql-server')?.value.trim() || document.getElementById('edit-host').value.trim(), port: parseInt(document.getElementById('edit-sql-port')?.value, 10) || 1433, username: sqlAuth === 'sql' ? (document.getElementById('edit-sql-user')?.value||'') : '', password: sqlAuth === 'sql' ? (document.getElementById('edit-sql-pass')?.value||'') : '' } : null,
        paths: { logs: document.getElementById('edit-allowed-paths').value.split('\n').map(p=>p.trim()).filter(Boolean), backups: [] }
      };
      await apiFetch(`${API}/servers/${currentServer}`, { method: 'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(newData) });
      showToast('تنظیمات ذخیره شد', 'success');
      await loadCurrentServerMeta();
      await loadServersList();
      await openTab('dashboard');
    };
  } catch(e) { showToast(e.message, 'error'); } finally { showLoading(false); }
}

async function loadServersList() {
  const servers = await apiFetch(`${API}/servers`);
  window.__allServers = servers;
  const nav = document.getElementById('server-list');
  if (!nav) return;
  const query = (document.getElementById('server-search')?.value || '').trim().toLowerCase();
  const visibleServers = query
    ? servers.filter(s => `${s.name || ''} ${s.host || ''} ${s.id || ''}`.toLowerCase().includes(query))
    : servers;

  const sortAllowed = serverSortMode && !query && visibleServers.length > 1;
  document.body.classList.toggle('server-sort-mode', !!sortAllowed);
  const sortBtn = document.getElementById('toggle-server-sort-btn');
  if (sortBtn) {
    sortBtn.classList.toggle('active', !!serverSortMode);
    sortBtn.setAttribute('aria-pressed', serverSortMode ? 'true' : 'false');
  }

  nav.innerHTML = visibleServers.map((s, idx) => {
    const sqlEnabled = s.features?.sql !== false;
    const iisEnabled = s.features?.iis === true;
    const creditEnabled = s.features?.credit === true;
    const statusRaw = String(s.status || s.health || (s.online === false ? 'offline' : 'online')).toLowerCase();
    const dotClass = statusRaw.includes('off') || statusRaw.includes('fail') || statusRaw.includes('error') ? 'offline' : (statusRaw.includes('unknown') ? 'unknown' : 'online');
    const canMoveUp = idx > 0;
    const canMoveDown = idx < visibleServers.length - 1;
    return `<button class="server-btn" data-id="${escapeAttr(s.id)}" onclick="selectServer('${escapeAttr(s.id)}')">
      <span class="server-feature-stack" aria-hidden="true">
        ${sqlEnabled ? '<span class="mini-feature sql-on">SQL</span>' : '<span class="mini-feature sql-off">OS</span>'}
        ${iisEnabled ? '<span class="mini-feature iis-on">IIS</span>' : ''}
        ${creditEnabled ? '<span class="mini-feature credit-on">CR</span>' : ''}
      </span>
      <span class="server-btn-text">
        <strong title="${escapeAttr(s.name || s.id)}">${escapeHtml(s.name || s.id)}</strong>
        <small class="ltr-text" title="${escapeAttr(s.host || '')}">${escapeHtml(s.host || '')}</small>
      </span>
      <span class="server-node-dot ${dotClass}" title="${escapeAttr(dotClass)}"></span>
      ${sortAllowed ? `<span class="server-order-tools" onclick="event.stopPropagation()">
        <button type="button" class="order-arrow" title="انتقال به بالا" ${!canMoveUp ? 'disabled' : ''} onclick="moveServerOrder('${escapeAttr(s.id)}', -1)">▲</button>
        <button type="button" class="order-arrow" title="انتقال به پایین" ${!canMoveDown ? 'disabled' : ''} onclick="moveServerOrder('${escapeAttr(s.id)}', 1)">▼</button>
      </span>` : ''}
    </button>`;
  }).join('') || '<div class="empty-list">سروری پیدا نشد.</div>';

  setText('stat-servers', servers.length);
  if (currentServer) {
    const btn = document.querySelector(`.server-btn[data-id="${cssEscapeValue(currentServer)}"]`);
    if (btn) btn.classList.add('active');
  }
}

window.toggleServerSortMode = function toggleServerSortMode() {
  serverSortMode = !serverSortMode;
  loadServersList().catch(e => showToast(e.message, 'error'));
};

window.moveServerOrder = async function moveServerOrder(id, direction) {
  const servers = Array.isArray(window.__allServers) ? [...window.__allServers] : await apiFetch(`${API}/servers`);
  const index = servers.findIndex(s => s.id === id);
  if (index < 0) return;
  const next = index + direction;
  if (next < 0 || next >= servers.length) return;
  [servers[index], servers[next]] = [servers[next], servers[index]];
  const movedEl = document.querySelector(`.server-btn[data-id="${cssEscapeValue(id)}"]`);
  if (movedEl) movedEl.classList.add('server-row-moving');
  try {
    await apiFetch(`${API}/servers/reorder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: servers.map(s => s.id) }) });
    window.__allServers = servers;
    await loadServersList();
  } catch (e) {
    showToast(e.message, 'error', 5000);
  }
};

window.selectServer = async (id) => {
  if (systemAutoRefreshInterval) {
    stopSystemAutoRefresh();
    const autoCheckbox = document.getElementById('auto-refresh-system');
    if (autoCheckbox) autoCheckbox.checked = false;
    systemAutoRefreshEnabled = false;
  }
  currentServer = id;
  const btn = document.querySelector(`.server-btn[data-id="${id}"]`);
  document.querySelectorAll('.server-btn').forEach(btn => btn.classList.remove('active'));
  if (btn) btn.classList.add('active');
  await loadCurrentServerMeta();
  const displayName = currentServerMeta?.name || btn?.innerText || id;
  document.getElementById('current-server-name').innerHTML = escapeHtml(displayName);
  let activeTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'dashboard';
  if (!serverHasSql() && ['jobs', 'databases', 'connectivity'].includes(activeTab)) activeTab = 'dashboard';
  if (!serverHasIis() && activeTab === 'iis') activeTab = 'dashboard';
  if (!serverHasCredit() && activeTab === 'credit') activeTab = 'dashboard';
  await openTab(activeTab);
  await updateDashboardStats();
};

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    await openTab(btn.dataset.tab);
  });
});

async function loadTab(tab) {
  if (tab === 'dashboard') { renderDashboardOverview(); await updateDashboardStats(); }
  if (tab === 'services') await loadServices();
  if (tab === 'iis') await loadIis(false);
  if (tab === 'jobs') await loadJobs();
  if (tab === 'disk') await loadDisk();
  if (tab === 'databases') await loadDatabases();
  if (tab === 'files') { /* nothing auto */ }
  if (tab === 'connectivity') await loadConnectivity();
  if (tab === 'alerts') await loadAlerts(false);
  if (tab === 'system') {
    await loadSystemMetrics();
    const autoCheckbox = document.getElementById('auto-refresh-system');
    if (autoCheckbox) {
      autoCheckbox.removeEventListener('change', handleSystemAutoRefreshChange);
      autoCheckbox.addEventListener('change', handleSystemAutoRefreshChange);
      if (systemAutoRefreshEnabled && !systemAutoRefreshInterval) startSystemAutoRefresh();
    }
    const refreshBtn = document.getElementById('refresh-system-btn');
    if (refreshBtn) refreshBtn.onclick = () => loadSystemMetrics();
  }
  if (tab === 'settings') loadServerSettings();
}

document.getElementById('delete-server-btn')?.addEventListener('click', async () => {
  if (!currentServer) return;
  const confirmed = await doubleConfirm('حذف سرور');
  if (!confirmed) return;
  showLoading(true);
  try {
    await apiFetch(`${API}/servers/${currentServer}`, { method:'DELETE' });
    showToast('حذف شد','success');
    await loadServersList();
    const servers = await apiFetch(`${API}/servers`);
    if (servers.length) await selectServer(servers[0].id);
    else location.reload();
  } catch(e) { showToast(e.message,'error'); } finally { showLoading(false); }
});

function showToast(msg, type, duration = 3500) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.innerText = msg;
  toast.className = `toast-message ${type}`;
  toast.classList.remove('hidden');
  toast.style.transform = 'translateY(0)';
  toast.style.opacity = '1';
  if (window.__toastTimeout) clearTimeout(window.__toastTimeout);
  if (window.__toastAnimTimeout) clearTimeout(window.__toastAnimTimeout);
  window.__toastAnimTimeout = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
  }, duration - 300);
  window.__toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
    toast.style.transform = '';
    toast.style.opacity = '';
  }, duration);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    if (m === '"') return '&quot;';
    if (m === "'") return '&#39;';
    return m;
  });
}


// ========== IIS / App Pools ==========
async function loadIis(force = false) {
  if (!currentServer) return;
  const sitesBody = document.getElementById('iis-sites-body');
  const poolsBody = document.getElementById('iis-pools-body');
  const summary = document.getElementById('iis-summary');
  const countEl = document.getElementById('iis-count');
  if (!sitesBody || !poolsBody) return;
  if (!serverHasIis()) {
    if (summary) summary.innerHTML = iisDisabledHtml();
    if (countEl) countEl.innerText = 'غیرفعال';
    sitesBody.innerHTML = '<tr><td colspan="5">IIS برای این سرور فعال نیست.</td></tr>';
    poolsBody.innerHTML = '<tr><td colspan="5">IIS برای این سرور فعال نیست.</td></tr>';
    return;
  }
  sitesBody.innerHTML = '<tr><td colspan="5">در حال دریافت...</td></tr>';
  poolsBody.innerHTML = '<tr><td colspan="5">در حال دریافت...</td></tr>';
  try {
    const data = await apiFetch(`${API}/iis/${currentServer}${force ? '?force=1' : ''}`);
    const sites = Array.isArray(data.sites) ? data.sites : [];
    const pools = Array.isArray(data.appPools) ? data.appPools : [];
    if (countEl) countEl.innerText = `${sites.length + pools.length} Item`;
    if (summary) {
      if (data.iisInstalled === false) summary.innerHTML = '<div class="alert-counter"><strong>IIS نصب نیست</strong><span>روی این سرور WebAdministration/appcmd پیدا نشد</span></div>';
      else summary.innerHTML = `<div class="alert-counter"><strong>${sites.length}</strong><span>Website</span></div><div class="alert-counter"><strong>${pools.length}</strong><span>Application Pool</span></div><div class="alert-counter"><strong>${data.updatedAt ? formatDate(data.updatedAt) : '-'}</strong><span>آخرین بررسی</span></div>`;
    }
    sitesBody.innerHTML = sites.length ? sites.map(s => `
      <tr data-key="${escapeAttr(s.Name)}">
        <td><strong>${escapeHtml(s.Name)}</strong></td>
        <td><span class="status-badge ${statusClass(s.State)}">${escapeHtml(s.State || '-')}</span></td>
        <td>${escapeHtml(s.Bindings || '-')}</td>
        <td class="mono-cell">${escapeHtml(s.PhysicalPath || '-')}</td>
        <td class="compact-actions">
          <button class="action-btn tiny start-action" onclick="iisAction('site', ${jsString(s.Name)}, 'start')">Start</button>
          <button class="action-btn tiny stop-action" onclick="iisAction('site', ${jsString(s.Name)}, 'stop')">Stop</button>
          <button class="action-btn tiny restart-action" onclick="iisAction('site', ${jsString(s.Name)}, 'restart')">Restart</button>
        </td>
      </tr>`).join('') : '<tr><td colspan="5">Website ثبت نشده یا IIS نصب نیست.</td></tr>';
    poolsBody.innerHTML = pools.length ? pools.map(p => `
      <tr data-key="${escapeAttr(p.Name)}">
        <td><strong>${escapeHtml(p.Name)}</strong></td>
        <td><span class="status-badge ${statusClass(p.State)}">${escapeHtml(p.State || '-')}</span></td>
        <td>${escapeHtml(p.ManagedRuntimeVersion || '-')}</td>
        <td>${escapeHtml(p.ManagedPipelineMode || '-')}</td>
        <td class="compact-actions">
          <button class="action-btn tiny start-action" onclick="iisAction('apppool', ${jsString(p.Name)}, 'start')">Start</button>
          <button class="action-btn tiny stop-action" onclick="iisAction('apppool', ${jsString(p.Name)}, 'stop')">Stop</button>
          <button class="action-btn tiny recycle-action" onclick="iisAction('apppool', ${jsString(p.Name)}, 'recycle')">Recycle</button>
        </td>
      </tr>`).join('') : '<tr><td colspan="5">Application Pool ثبت نشده یا IIS نصب نیست.</td></tr>';
  } catch(e) {
    sitesBody.innerHTML = `<tr><td colspan="5" class="error-text">${escapeHtml(e.message)}</td></tr>`;
    poolsBody.innerHTML = '';
  }
}

window.iisAction = async function iisAction(type, name, action) {
  if (!currentServer) return;
  const confirmed = await doubleConfirm(`${action} ${type}: ${name}`);
  if (!confirmed) return;
  showLoading(true);
  try {
    await apiFetch(`${API}/iis/${currentServer}/action`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type, name, action }) });
    showToast('دستور IIS اجرا شد', 'success');
    await loadIis(true);
    await refreshLiveStatus(true);
  } catch(e) { showToast(e.message, 'error', 7000); }
  finally { showLoading(false); }
};


// ========== Credit manual SP checks ==========
let currentCreditChecks = [];
function parseCreditParamsText(text) {
  return String(text || '').split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const [name, label, type, required, def] = line.split('|');
    return { name: (name || '').trim(), label: (label || name || '').trim(), type: (type || 'nvarchar').trim(), required: String(required || '').toLowerCase() === 'true', default: def || '' };
  }).filter(p => p.name);
}
function formatCreditParams(params) {
  return (Array.isArray(params) ? params : []).map(p => `${p.name || ''}|${p.label || p.name || ''}|${p.type || 'nvarchar'}|${p.required ? 'true' : 'false'}|${p.default ?? ''}`).join('\n');
}
window.openCreditConfigModal = function openCreditConfigModal(check = null) {
  const modal = document.getElementById('credit-config-modal');
  if (!modal) return;
  document.getElementById('credit-config-id').value = check?.id || '';
  document.getElementById('credit-config-title').value = check?.title || '';
  document.getElementById('credit-config-database').value = check?.database || 'master';
  document.getElementById('credit-config-procedure').value = check?.procedure || 'sys.sp_executesql';
  document.getElementById('credit-config-description').value = check?.description || '';
  document.getElementById('credit-config-test-mode').checked = check?.testMode !== false;
  document.getElementById('credit-config-params').value = formatCreditParams(check?.parameters || []);
  modal.style.display = 'flex';
};
window.closeCreditConfigModal = function closeCreditConfigModal() {
  const modal = document.getElementById('credit-config-modal');
  if (modal) modal.style.display = 'none';
};
window.saveCreditConfigFromModal = async function saveCreditConfigFromModal() {
  const payload = {
    id: document.getElementById('credit-config-id')?.value || undefined,
    title: document.getElementById('credit-config-title')?.value || 'عملیات اعتباری',
    database: document.getElementById('credit-config-database')?.value || 'master',
    procedure: document.getElementById('credit-config-procedure')?.value || 'sys.sp_executesql',
    description: document.getElementById('credit-config-description')?.value || '',
    testMode: document.getElementById('credit-config-test-mode')?.checked !== false,
    parameters: parseCreditParamsText(document.getElementById('credit-config-params')?.value || ''),
    enabled: true
  };
  showLoading(true);
  try {
    await apiFetch(`${API}/credit/checks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    showToast('عملیات سامانه اعتباری ذخیره شد', 'success');
    closeCreditConfigModal();
    await loadCreditChecks(true);
  } catch (e) { showToast(e.message, 'error', 7000); }
  finally { showLoading(false); }
};
async function loadCreditChecks(force = false) {
  const list = document.getElementById('credit-checks');
  const resultBox = document.getElementById('credit-result');
  if (!list) return;
  if (!serverHasCredit()) {
    list.innerHTML = creditDisabledHtml();
    if (resultBox) resultBox.innerHTML = '<div class="empty-state">برای این سرور سامانه اعتباری فعال نیست.</div>';
    return;
  }
  list.innerHTML = force ? '<div class="loading">در حال بارگذاری...</div>' : list.innerHTML;
  try {
    const data = await apiFetch(`${API}/credit/checks`);
    currentCreditChecks = data.checks || [];
    const target = (data.targets || []).find(t => t.id === currentServer) || (data.targets || [])[0];
    setText('credit-target-server', target ? `Target SQL: ${target.name}` : 'Target SQL: تنظیم نشده');
    list.innerHTML = currentCreditChecks.length ? currentCreditChecks.map(c => `
      <article class="credit-operation-card">
        <div><strong>${escapeHtml(c.title || c.id)}</strong><small>${escapeHtml(c.description || c.procedure || '')}</small></div>
        <div class="credit-card-actions"><button class="action-btn tiny" onclick='openCreditConfigModal(${JSON.stringify(c).replace(/</g,'\\u003C')})'>تنظیم</button><button class="primary-btn tiny" onclick="runCreditCheck('${escapeAttr(c.id)}')">اجرا</button></div>
      </article>`).join('') : '<div class="empty-state">هنوز عملیاتی تعریف نشده است.</div>';
    await loadCreditHistory();
  } catch (e) { list.innerHTML = `<div class="error-text">${escapeHtml(e.message)}</div>`; }
}
window.loadCreditChecks = loadCreditChecks;
window.runCreditCheck = async function runCreditCheck(id) {
  const check = currentCreditChecks.find(c => c.id === id);
  const params = {};
  for (const p of (check?.parameters || [])) {
    const value = prompt(p.label || p.name, p.default || '');
    if (value === null) return;
    params[p.name] = value;
  }
  showLoading(true);
  try {
    const data = await apiFetch(`${API}/credit/run/${encodeURIComponent(id)}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ params }) });
    setText('credit-result-time', data.time ? formatDate(data.time) : '--');
    const rows = Array.isArray(data.rows) ? data.rows : [];
    const resultBox = document.getElementById('credit-result');
    resultBox.innerHTML = `<pre class="json-result">${escapeHtml(JSON.stringify(rows, null, 2))}</pre>`;
    showToast('SP دستی با موفقیت اجرا شد', 'success');
    await loadCreditHistory();
  } catch (e) { showToast(e.message, 'error', 8000); }
  finally { showLoading(false); }
};
async function loadCreditHistory() {
  const body = document.getElementById('credit-history-body');
  if (!body) return;
  try {
    const rows = await apiFetch(`${API}/credit/history`);
    body.innerHTML = Array.isArray(rows) && rows.length ? rows.map(r => `<tr><td>${escapeHtml(r.title || '-')}</td><td><span class="status-badge ${r.status === 'success' ? 'status-running' : 'status-stopped'}">${escapeHtml(r.status || '-')}</span></td><td>${escapeHtml(r.server || '-')}</td><td>${escapeHtml(r.database || '-')}</td><td class="mono-cell">${escapeHtml(r.procedure || '-')}</td><td>${r.durationMs || 0}ms</td><td>${formatDate(r.time)}</td></tr>`).join('') : '<tr><td colspan="7">تاریخچه‌ای ثبت نشده است.</td></tr>';
  } catch { body.innerHTML = '<tr><td colspan="7">خطا در دریافت تاریخچه</td></tr>'; }
}

// ========== Live monitoring ==========
async function refreshLiveStatus(force = false) {
  try {
    const data = await apiFetch(`${API}/live/status${force ? '?force=1' : ''}`);
    latestLiveSnapshot = data;
    const currentAlerts = Array.isArray(data.alerts) ? data.alerts.filter(a => !currentServer || a.serverId === currentServer) : [];
    const stat = document.getElementById('stat-alerts');
    if (stat) stat.innerText = currentAlerts.length;
    if (document.getElementById('tab-alerts')?.classList.contains('active')) renderAlerts(currentAlerts, false);
    if (document.getElementById('tab-dashboard')?.classList.contains('active')) renderDashboardAlertsPreview(currentAlerts);
    if (data.counts?.critical || data.counts?.warning) {
      document.body.classList.add('has-live-alerts');
    } else {
      document.body.classList.remove('has-live-alerts');
    }
    return data;
  } catch(e) {
    console.warn('live status failed', e);
    return null;
  }
}

function startLiveMonitoring() {
  if (liveRefreshTimer) clearInterval(liveRefreshTimer);
  refreshLiveStatus(false);
  if (window.EventSource) {
    try {
      liveEventSource = new EventSource(`${API}/live/events`);
      liveEventSource.addEventListener('status', (event) => {
        try {
          const data = JSON.parse(event.data);
          latestLiveSnapshot = data;
          const currentAlerts = Array.isArray(data.alerts) ? data.alerts.filter(a => !currentServer || a.serverId === currentServer) : [];
          const stat = document.getElementById('stat-alerts');
          if (stat) stat.innerText = currentAlerts.length;
          if (document.getElementById('tab-alerts')?.classList.contains('active')) renderAlerts(currentAlerts, false);
          if (document.getElementById('tab-dashboard')?.classList.contains('active')) renderDashboardAlertsPreview(currentAlerts);
        } catch(e) { console.warn('invalid live event', e); }
      });
      liveEventSource.onerror = () => {
        if (liveEventSource) liveEventSource.close();
        liveEventSource = null;
        liveRefreshTimer = setInterval(() => refreshLiveStatus(false), 15000);
      };
      return;
    } catch { /* fallback to polling */ }
  }
  liveRefreshTimer = setInterval(() => refreshLiveStatus(false), 15000);
}

function getAddServerElements() {
  return {
    modal: document.getElementById('server-add-modal'),
    openBtn: document.getElementById('add-server-btn'),
    closeBtn: document.querySelector('#server-add-modal .modal-close'),
    saveBtn: document.getElementById('confirm-add-server'),
    testBtn: document.getElementById('test-new-server-connection'),
    winrmSelect: document.getElementById('new-winrm-auth'),
    winrmCredDiv: document.getElementById('new-winrm-cred'),
    sqlSelect: document.getElementById('new-sql-auth'),
    sqlCredDiv: document.getElementById('new-sql-cred'),
    hasSqlInput: document.getElementById('new-has-sql'),
    hasIisInput: document.getElementById('new-has-iis'),
    hasCreditInput: document.getElementById('new-has-credit'),
    sqlFields: document.getElementById('new-sql-fields'),
    hostInput: document.getElementById('new-server-host'),
    warningDiv: document.getElementById('winrm-warning')
  };
}

window.openAddServerModal = function openAddServerModal() {
  const { modal, winrmSelect, winrmCredDiv, sqlSelect, sqlCredDiv, hostInput, warningDiv, hasSqlInput, sqlFields } = getAddServerElements();
  if (!modal) return;
  modal.style.display = 'flex';
  if (winrmCredDiv && winrmSelect) winrmCredDiv.style.display = winrmSelect.value === 'credential' ? 'block' : 'none';
  if (sqlFields && hasSqlInput) sqlFields.style.display = hasSqlInput.checked ? 'block' : 'none';
  if (sqlCredDiv && sqlSelect) sqlCredDiv.style.display = (hasSqlInput?.checked !== false && sqlSelect.value === 'sql') ? 'block' : 'none';
  if (warningDiv && hostInput && winrmSelect) {
    const host = hostInput.value.trim();
    const isLocalHost = host === '' || host === 'localhost' || host === '127.0.0.1';
    warningDiv.style.display = (!isLocalHost && winrmSelect.value === 'local') ? 'flex' : 'none';
  }
};

function closeAddServerModal() {
  const modal = document.getElementById('server-add-modal');
  if (modal) modal.style.display = 'none';
}

function resetAddServerForm() {
  ['new-server-id','new-server-name','new-server-host','new-winrm-computer','new-winrm-user','new-winrm-pass','new-sql-user','new-sql-pass','new-sql-server'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const port = document.getElementById('new-sql-port');
  if (port) port.value = '1433';
  const winrm = document.getElementById('new-winrm-auth');
  if (winrm) winrm.value = 'local';
  const hasSql = document.getElementById('new-has-sql');
  if (hasSql) hasSql.checked = true;
  const hasIis = document.getElementById('new-has-iis');
  if (hasIis) hasIis.checked = false;
  const hasCredit = document.getElementById('new-has-credit');
  if (hasCredit) hasCredit.checked = false;
  const sqlFields = document.getElementById('new-sql-fields');
  if (sqlFields) sqlFields.style.display = 'block';
  const sql = document.getElementById('new-sql-auth');
  if (sql) sql.value = 'windows';
  const winrmCred = document.getElementById('new-winrm-cred');
  if (winrmCred) winrmCred.style.display = 'none';
  const sqlCred = document.getElementById('new-sql-cred');
  if (sqlCred) sqlCred.style.display = 'none';
  const warning = document.getElementById('winrm-warning');
  if (warning) warning.style.display = 'none';
}

function buildServerPayloadFromForm() {
  const id = document.getElementById('new-server-id')?.value.trim() || '';
  const name = document.getElementById('new-server-name')?.value.trim() || '';
  const host = document.getElementById('new-server-host')?.value.trim() || '';
  const winrmAuth = document.getElementById('new-winrm-auth')?.value || 'local';
  const hasSql = document.getElementById('new-has-sql')?.checked !== false;
  const hasIis = document.getElementById('new-has-iis')?.checked === true;
  const hasCredit = document.getElementById('new-has-credit')?.checked === true;
  const sqlAuth = document.getElementById('new-sql-auth')?.value || 'windows';
  return {
    id,
    name,
    host,
    features: { winrm: true, sql: hasSql, iis: hasIis, credit: hasCredit },
    winrm: {
      authType: winrmAuth,
      computerName: winrmAuth === 'credential' ? (document.getElementById('new-winrm-computer')?.value || '') : '',
      username: winrmAuth === 'credential' ? (document.getElementById('new-winrm-user')?.value || '') : '',
      password: winrmAuth === 'credential' ? (document.getElementById('new-winrm-pass')?.value || '') : ''
    },
    iis: hasIis ? { enabled: true } : null,
    credit: hasCredit ? { enabled: true } : null,
    sql: hasSql ? {
      enabled: true,
      authType: sqlAuth,
      server: document.getElementById('new-sql-server')?.value.trim() || host,
      port: parseInt(document.getElementById('new-sql-port')?.value, 10) || 1433,
      username: sqlAuth === 'sql' ? (document.getElementById('new-sql-user')?.value || '') : '',
      password: sqlAuth === 'sql' ? (document.getElementById('new-sql-pass')?.value || '') : ''
    } : null,
    paths: { logs: [], backups: [] },
    monitoredServices: []
  };
}

function validateNewServer(payload) {
  if (!payload.id || !payload.name || !payload.host) return 'شناسه، نام و Host الزامی است.';
  if (!/^[a-zA-Z0-9\-_]+$/.test(payload.id)) return 'شناسه فقط حروف انگلیسی، عدد، خط تیره و زیرخط باشد.';
  return '';
}

async function testNewServerConnection() {
  const payload = buildServerPayloadFromForm();
  const validation = validateNewServer({ ...payload, name: payload.name || 'temp' });
  if (validation && !payload.id) { showToast('شناسه سرور را وارد کنید.', 'error'); return; }
  if (!payload.host) { showToast('Host را وارد کنید.', 'error'); return; }
  showLoading(true);
  try {
    const data = await apiFetch(`${API}/servers/test-connection-temp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (data.winrm && (data.sql || data.sqlSkipped)) showToast(data.sqlSkipped ? 'اتصال WinRM OK؛ SQL برای این سرور غیرفعال است' : 'اتصال OK', 'success');
    else {
      if (data.details === 'trustedhosts') showWinRMHelp(payload.host);
      showToast(data.error || 'اتصال ناموفق', 'error', 5000);
    }
  } catch(e) { showToast(e.message, 'error', 5000); }
  finally { showLoading(false); }
}

async function saveNewServer() {
  const payload = buildServerPayloadFromForm();
  const validation = validateNewServer(payload);
  if (validation) { showToast(validation, 'error'); return; }
  showLoading(true);
  try {
    await apiFetch(`${API}/servers`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    showToast('سرور اضافه شد', 'success');
    closeAddServerModal();
    resetAddServerForm();
    await loadServersList();
    await selectServer(payload.id);
  } catch(e) { showToast(e.message, 'error', 6000); }
  finally { showLoading(false); }
}

function bindStaticUi() {
  const modalService = document.getElementById('service-modal');
  const btnService = document.getElementById('show-add-service-modal-btn');
  const spanService = document.querySelector('#service-modal .modal-close');
  if (btnService && modalService) btnService.onclick = () => { loadAllServicesForSearch(); modalService.style.display = 'flex'; };
  if (spanService && modalService) spanService.onclick = () => { modalService.style.display = 'none'; };

  const { openBtn, closeBtn, modal, winrmSelect, winrmCredDiv, sqlSelect, sqlCredDiv, hostInput, warningDiv, testBtn, saveBtn, hasSqlInput, hasIisInput, sqlFields } = getAddServerElements();
  if (openBtn) openBtn.onclick = window.openAddServerModal;
  if (closeBtn) closeBtn.onclick = closeAddServerModal;

  const updateWinrmWarning = () => {
    if (!warningDiv || !hostInput || !winrmSelect) return;
    const host = hostInput.value.trim();
    const isLocalHost = host === '' || host === 'localhost' || host === '127.0.0.1';
    warningDiv.style.display = (!isLocalHost && winrmSelect.value === 'local') ? 'flex' : 'none';
  };

  if (winrmSelect) winrmSelect.onchange = () => {
    if (winrmCredDiv) winrmCredDiv.style.display = winrmSelect.value === 'credential' ? 'block' : 'none';
    updateWinrmWarning();
  };
  if (hostInput) hostInput.oninput = updateWinrmWarning;
  if (hasSqlInput) hasSqlInput.onchange = () => {
    const enabled = hasSqlInput.checked;
    if (sqlFields) sqlFields.style.display = enabled ? 'block' : 'none';
    if (sqlCredDiv) sqlCredDiv.style.display = enabled && sqlSelect?.value === 'sql' ? 'block' : 'none';
  };
  if (sqlSelect) sqlSelect.onchange = () => { if (sqlCredDiv) sqlCredDiv.style.display = (hasSqlInput?.checked !== false && sqlSelect.value === 'sql') ? 'block' : 'none'; };
  if (testBtn) testBtn.onclick = testNewServerConnection;
  if (saveBtn) saveBtn.onclick = saveNewServer;

  document.addEventListener('click', (e) => {
    if (e.target === modal) closeAddServerModal();
    if (e.target === modalService) modalService.style.display = 'none';
  });

  document.getElementById('open-alerts-stat')?.addEventListener('click', async () => { await openTab('alerts'); });
  document.getElementById('server-search')?.addEventListener('input', () => { loadServersList().catch(console.warn); });
  document.getElementById('job-search')?.addEventListener('input', renderJobsTable);
  document.getElementById('job-status-filter')?.addEventListener('change', renderJobsTable);
  document.getElementById('linked-search')?.addEventListener('input', () => renderLinkedServers(currentLinkedServers));
  document.getElementById('linked-status-filter')?.addEventListener('change', () => renderLinkedServers(currentLinkedServers));
}

async function init() {
  bindStaticUi();
  try {
    await loadServersList();
    const servers = await apiFetch(`${API}/servers`);
    if (Array.isArray(servers) && servers.length) {
      try { await selectServer(servers[0].id); }
      catch(e) { console.warn('select initial server failed', e); showToast(e.message, 'error', 5000); }
    }
  } catch(e) {
    console.error('initial load failed', e);
    showToast(e.message || 'خطا در بارگذاری اولیه', 'error', 6000);
  }

  try {
    const startupAlerts = await apiFetch(`${API}/alerts`);
    latestAlerts = Array.isArray(startupAlerts) ? startupAlerts : [];
    const stat = document.getElementById('stat-alerts');
    if (stat) stat.innerText = currentServer ? latestAlerts.filter(a => a.serverId === currentServer).length : latestAlerts.length;
  } catch(e) { console.warn('startup alerts failed', e); }
  startLiveMonitoring();
}

init();