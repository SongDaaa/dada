// dada-auth.js — User auth, API client, data sync
// Dependencies: dada-data.js (words, stats, saveWords, loadWords, saveStats, loadStats)

var API_BASE = (function() {
  var h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:5000';
  return window.location.origin;  // same-origin on production server
})();
var authToken = localStorage.getItem('dada_token') || '';
var currentUser = null;
var syncTimer = null;
var syncDirty = false;

// ── API Client ──

function apiCall(method, path, data) {
  var headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
  var opts = { method: method, headers: headers };
  if (data) opts.body = JSON.stringify(data);
  return fetch(API_BASE + path, opts).then(function(r) {
    return r.json().then(function(body) {
      if (!r.ok) throw new Error(body.error || 'API error');
      return body;
    });
  });
}

// ── Auth ──

function login(username, password) {
  return apiCall('POST', '/api/auth/login', { username: username, password: password }).then(function(res) {
    authToken = res.token;
    currentUser = res.user;
    localStorage.setItem('dada_token', authToken);
    localStorage.setItem('dada_user', JSON.stringify(currentUser));
    updateAuthUI();
    return res;
  });
}

function register(username, password) {
  return apiCall('POST', '/api/auth/register', { username: username, password: password }).then(function(res) {
    authToken = res.token;
    currentUser = res.user;
    localStorage.setItem('dada_token', authToken);
    localStorage.setItem('dada_user', JSON.stringify(currentUser));
    updateAuthUI();
    return res;
  });
}

function logout() {
  authToken = '';
  currentUser = null;
  localStorage.removeItem('dada_token');
  localStorage.removeItem('dada_user');
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
  updateAuthUI();
  toast('已退出登录');
}

function checkAuth() {
  if (!authToken) return Promise.resolve(null);
  return apiCall('GET', '/api/auth/me').then(function(res) {
    currentUser = res.user;
    updateAuthUI();
    return res.user;
  }).catch(function() {
    // Token expired or invalid
    authToken = '';
    currentUser = null;
    localStorage.removeItem('dada_token');
    localStorage.removeItem('dada_user');
    updateAuthUI();
    return null;
  });
}

// ── Sync ──

function syncToServer() {
  if (!authToken) return Promise.resolve(null);
  return apiCall('POST', '/api/words/sync', { words: words, stats: stats }).then(function(res) {
    if (res.words && Object.keys(res.words).length > 0) {
      words = res.words;
      saveWords();
    }
    if (res.stats && Object.keys(res.stats).length > 0) {
      stats = res.stats;
      saveStats();
    }
    syncDirty = false;
    updateSyncStatus('已同步');
    return res;
  }).catch(function(err) {
    updateSyncStatus('同步失败');
    console.error('Sync error:', err);
  });
}

function markSyncDirty() {
  syncDirty = true;
  updateSyncStatus('待同步');
}

function updateSyncStatus(msg) {
  var el = document.getElementById('syncStatus');
  if (el) el.textContent = msg;
}

function startAutoSync() {
  if (!authToken || syncTimer) return;
  // Sync every 60 seconds if dirty
  syncTimer = setInterval(function() {
    if (syncDirty) syncToServer();
  }, 60000);
}

// ── UI ──

function updateAuthUI() {
  var loginBtn = document.getElementById('btnLogin');
  if (currentUser) {
    if (loginBtn) loginBtn.textContent = currentUser.username + ' ▾';
    startAutoSync();
    // Initial sync: pull from server
    syncToServer().then(function() {
      updateAllUI();
    });
  } else {
    if (loginBtn) loginBtn.textContent = '登录';
    if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
  }
}

function showAuthModal(mode) {
  var modal = document.getElementById('authModal');
  if (!modal) return;
  document.getElementById('authTitle').textContent = mode === 'login' ? '登录' : '注册';
  document.getElementById('authMode').value = mode;
  document.getElementById('authError').textContent = '';
  document.getElementById('authUsername').value = '';
  document.getElementById('authPassword').value = '';
  modal.style.display = 'flex';
  document.getElementById('authUsername').focus();
}

function hideAuthModal() {
  document.getElementById('authModal').style.display = 'none';
}

function handleAuthSubmit() {
  var username = document.getElementById('authUsername').value.trim();
  var password = document.getElementById('authPassword').value.trim();
  var mode = document.getElementById('authMode').value;
  var errEl = document.getElementById('authError');

  if (!username || !password) {
    errEl.textContent = '请填写用户名和密码';
    return;
  }

  var btn = document.getElementById('btnAuthSubmit');
  btn.disabled = true;
  btn.textContent = '处理中...';

  var fn = mode === 'login' ? login : register;
  fn(username, password).then(function() {
    hideAuthModal();
    toast((mode === 'login' ? '登录成功' : '注册成功') + '！');
  }).catch(function(err) {
    errEl.textContent = err.message;
  }).finally(function() {
    btn.disabled = false;
    btn.textContent = mode === 'login' ? '登录' : '注册';
  });
}

function toggleAuthMode() {
  var mode = document.getElementById('authMode').value;
  var newMode = mode === 'login' ? 'register' : 'login';
  document.getElementById('authMode').value = newMode;
  document.getElementById('authTitle').textContent = newMode === 'login' ? '登录' : '注册';
  document.getElementById('authError').textContent = '';
  document.getElementById('btnAuthSubmit').textContent = newMode === 'login' ? '登录' : '注册';
  var link = document.getElementById('authModeLink');
  link.textContent = newMode === 'login' ? '没有账号？去注册' : '已有账号？去登录';
}
