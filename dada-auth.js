// dada-auth.js — User auth, API client, data sync
// Dependencies: dada-data.js (words, stats, saveWords, loadWords, saveStats, loadStats)

var API_BASE = (function() {
  var h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:5000';
  // GitHub Pages domain — route API to local Flask on same WiFi
  if (h === 'songdada.cn' || h === 'songdaaa.github.io') return 'http://192.168.0.4:5000';
  return window.location.origin;
})();
var authToken = localStorage.getItem('dada_token') || '';
var currentUser = null;
var syncTimer = null;
var syncDirty = false;
var sendCodeTimer = null;
var sendCodeCountdown = 0;

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

function register(username, password, email, code) {
  return apiCall('POST', '/api/auth/register', { username: username, password: password, email: email, code: code }).then(function(res) {
    authToken = res.token;
    currentUser = res.user;
    localStorage.setItem('dada_token', authToken);
    localStorage.setItem('dada_user', JSON.stringify(currentUser));
    updateAuthUI();
    return res;
  });
}

function sendVerificationCode(email, purpose) {
  return apiCall('POST', '/api/auth/send-code', { email: email, purpose: purpose });
}

function resetPassword(email, code, newPassword) {
  return apiCall('POST', '/api/auth/forgot-password', { email: email, code: code, newPassword: newPassword });
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
  syncTimer = setInterval(function() {
    if (syncDirty) syncToServer();
  }, 60000);
}

// ── UI ──

function updateAuthUI() {
  var loginBtn = document.getElementById('btnLogin');
  var adminBtn = document.getElementById('navAdmin');
  if (currentUser) {
    if (loginBtn) loginBtn.textContent = currentUser.username + ' ▾';
    if (adminBtn) adminBtn.style.display = currentUser.is_admin ? '' : 'none';
    startAutoSync();
    syncToServer().then(function() {
      updateAllUI();
    });
  } else {
    if (loginBtn) loginBtn.textContent = '登录';
    if (adminBtn) adminBtn.style.display = 'none';
    if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
  }
}

// ── Auth Modal ──

function showAuthModal(mode) {
  var modal = document.getElementById('authModal');
  if (!modal) return;

  document.getElementById('authError').textContent = '';
  document.getElementById('authUsername').value = '';
  document.getElementById('authPassword').value = '';
  document.getElementById('authMode').value = mode;

  // Reset optional fields
  var emailEl = document.getElementById('authEmail');
  var codeEl = document.getElementById('authCode');
  var newPwEl = document.getElementById('authNewPassword');
  if (emailEl) emailEl.value = '';
  if (codeEl) codeEl.value = '';
  if (newPwEl) newPwEl.value = '';

  // Reset send code button
  stopSendCodeCountdown();

  if (mode === 'login') {
    document.getElementById('authTitle').textContent = '登录';
    document.getElementById('btnAuthSubmit').textContent = '登录';
    document.getElementById('authModeLink').textContent = '没有账号？去注册';
    document.getElementById('authModeLink').style.display = '';
    document.getElementById('authForgotLink').style.display = '';
    document.getElementById('authFieldUsername').style.display = '';
    document.getElementById('authFieldEmail').style.display = 'none';
    document.getElementById('authFieldCode').style.display = 'none';
    document.getElementById('authFieldPassword').style.display = '';
    document.getElementById('authFieldNewPassword').style.display = 'none';
  } else if (mode === 'register') {
    document.getElementById('authTitle').textContent = '注册';
    document.getElementById('btnAuthSubmit').textContent = '注册';
    document.getElementById('authModeLink').textContent = '已有账号？去登录';
    document.getElementById('authModeLink').style.display = '';
    document.getElementById('authForgotLink').style.display = 'none';
    document.getElementById('authFieldUsername').style.display = '';
    document.getElementById('authFieldEmail').style.display = '';
    document.getElementById('authFieldCode').style.display = '';
    document.getElementById('authFieldPassword').style.display = '';
    document.getElementById('authFieldNewPassword').style.display = 'none';
  } else if (mode === 'forgot') {
    document.getElementById('authTitle').textContent = '找回密码';
    document.getElementById('btnAuthSubmit').textContent = '重置密码';
    document.getElementById('authModeLink').textContent = '返回登录';
    document.getElementById('authModeLink').style.display = '';
    document.getElementById('authForgotLink').style.display = 'none';
    document.getElementById('authFieldUsername').style.display = 'none';
    document.getElementById('authFieldEmail').style.display = '';
    document.getElementById('authFieldCode').style.display = '';
    document.getElementById('authFieldPassword').style.display = 'none';
    document.getElementById('authFieldNewPassword').style.display = '';
  }

  modal.style.display = 'flex';
  // Focus first visible input
  var firstInput = modal.querySelector('input:not([type=hidden])');
  if (firstInput) setTimeout(function() { firstInput.focus(); }, 100);
}

function hideAuthModal() {
  document.getElementById('authModal').style.display = 'none';
  stopSendCodeCountdown();
}

function toggleAuthMode() {
  var mode = document.getElementById('authMode').value;
  var newMode = mode === 'login' ? 'register' : 'login';
  showAuthModal(newMode);
}

function showForgotPassword() {
  showAuthModal('forgot');
}

// ── Send Code Countdown ──

function startSendCodeCountdown() {
  sendCodeCountdown = 60;
  updateSendCodeBtn();
  sendCodeTimer = setInterval(function() {
    sendCodeCountdown--;
    if (sendCodeCountdown <= 0) {
      stopSendCodeCountdown();
    } else {
      updateSendCodeBtn();
    }
  }, 1000);
}

function stopSendCodeCountdown() {
  if (sendCodeTimer) { clearInterval(sendCodeTimer); sendCodeTimer = null; }
  sendCodeCountdown = 0;
  updateSendCodeBtn();
}

function updateSendCodeBtn() {
  var btn = document.getElementById('btnSendCode');
  if (!btn) return;
  if (sendCodeCountdown > 0) {
    btn.textContent = sendCodeCountdown + 's后重发';
    btn.disabled = true;
    btn.classList.add('sending');
  } else {
    btn.textContent = '发送验证码';
    btn.disabled = false;
    btn.classList.remove('sending');
  }
}

// ── Handle Send Code ──

function handleSendCode() {
  var email = document.getElementById('authEmail').value.trim();
  var errEl = document.getElementById('authError');
  var mode = document.getElementById('authMode').value;
  var purpose = mode === 'forgot' ? 'reset' : 'register';

  if (!email) {
    errEl.textContent = '请输入邮箱地址';
    return;
  }

  var btn = document.getElementById('btnSendCode');
  btn.disabled = true;

  sendVerificationCode(email, purpose).then(function(res) {
    startSendCodeCountdown();
    errEl.textContent = '';
    toast('验证码已发送');
  }).catch(function(err) {
    btn.disabled = false;
    errEl.textContent = err.message;
  });
}

// ── Handle Submit ──

function handleAuthSubmit() {
  var mode = document.getElementById('authMode').value;
  var errEl = document.getElementById('authError');
  var btn = document.getElementById('btnAuthSubmit');

  if (mode === 'login') {
    var username = document.getElementById('authUsername').value.trim();
    var password = document.getElementById('authPassword').value.trim();
    if (!username || !password) {
      errEl.textContent = '请填写用户名和密码';
      return;
    }
    btn.disabled = true;
    btn.textContent = '处理中...';
    login(username, password).then(function() {
      hideAuthModal();
      toast('登录成功！');
    }).catch(function(err) {
      errEl.textContent = err.message;
      btn.disabled = false;
      btn.textContent = '登录';
    });

  } else if (mode === 'register') {
    var username = document.getElementById('authUsername').value.trim();
    var password = document.getElementById('authPassword').value.trim();
    var email = document.getElementById('authEmail').value.trim();
    var code = document.getElementById('authCode').value.trim();
    if (!username || !password || !email || !code) {
      errEl.textContent = '请填写所有字段';
      return;
    }
    btn.disabled = true;
    btn.textContent = '处理中...';
    register(username, password, email, code).then(function() {
      hideAuthModal();
      toast('注册成功！');
    }).catch(function(err) {
      errEl.textContent = err.message;
      btn.disabled = false;
      btn.textContent = '注册';
    });

  } else if (mode === 'forgot') {
    var email = document.getElementById('authEmail').value.trim();
    var code = document.getElementById('authCode').value.trim();
    var newPassword = document.getElementById('authNewPassword').value.trim();
    if (!email || !code || !newPassword) {
      errEl.textContent = '请填写所有字段';
      return;
    }
    btn.disabled = true;
    btn.textContent = '处理中...';
    resetPassword(email, code, newPassword).then(function(res) {
      hideAuthModal();
      toast('密码重置成功，请重新登录');
    }).catch(function(err) {
      errEl.textContent = err.message;
      btn.disabled = false;
      btn.textContent = '重置密码';
    });
  }
}
