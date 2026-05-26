// dada-data.js — Foundation: state, storage, word data, Ebbinghaus, CSV/import, presets
// Dependencies: none (must load first)

var STORAGE_KEY = 'dada_vocab';
var STATS_KEY = 'dada_stats';
var words = {};
var stats = { streak: 0, lastStudyDate: '', totalTime: 0, dailyTime: 0, wordsStudied: 0, todayDate: '', checkInDate: '', checkInStreak: 0, totalStudyDays: 0, checkInDates: {}, makeUpCards: 0, dailyWords: {} };
var EBBINGHAUS = [1, 2, 4, 7, 15];
var dailyLimit = parseInt(localStorage.getItem('dada_daily_limit') || '20');
var studyBook = localStorage.getItem('dada_study_book') || 'all';
var rate = 0.9;
var learnTimer = null;
var learnSeconds = 0;
var confirmCallback = null;

// ── Stats & Streak ──
function loadStats() {
  try {
    var raw = localStorage.getItem(STATS_KEY);
    stats = raw ? JSON.parse(raw) : { streak: 0, lastStudyDate: '', totalTime: 0, dailyTime: 0, wordsStudied: 0, todayDate: '', checkInDate: '', checkInStreak: 0, totalStudyDays: 0, checkInDates: {}, makeUpCards: 0, dailyWords: {} };
    if (stats.checkInDate === undefined) stats.checkInDate = '';
    if (stats.checkInStreak === undefined) stats.checkInStreak = 0;
    if (stats.totalStudyDays === undefined) stats.totalStudyDays = 0;
    if (stats.checkInDates === undefined) stats.checkInDates = {};
    if (stats.makeUpCards === undefined) stats.makeUpCards = 0;
    if (stats.dailyWords === undefined) stats.dailyWords = {};
    // Migrate old checkInDate to checkInDates
    if (stats.checkInDate && !stats.checkInDates[stats.checkInDate]) {
      stats.checkInDates[stats.checkInDate] = true;
    }
  } catch(e) { stats = { streak: 0, lastStudyDate: '', totalTime: 0, dailyTime: 0, wordsStudied: 0, todayDate: '', checkInDate: '', checkInStreak: 0, totalStudyDays: 0, checkInDates: {}, makeUpCards: 0, dailyWords: {} }; }
}

function saveStats() { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); try { markSyncDirty(); } catch(e) {} }

function recordWordStudied() {
  var today = new Date().toISOString().slice(0, 10);
  stats.dailyWords = stats.dailyWords || {};
  stats.dailyWords[today] = (stats.dailyWords[today] || 0) + 1;
  // Keep only last 60 days
  var keys = Object.keys(stats.dailyWords).sort();
  while (keys.length > 60) { delete stats.dailyWords[keys.shift()]; }
}

function setupDailyStreak() {
  var today = new Date().toISOString().slice(0,10);
  if (stats.todayDate !== today) { stats.dailyTime = 0; stats.todayDate = today; stats.totalStudyDays = (stats.totalStudyDays || 0) + 1; }
  if (stats.lastStudyDate) {
    var last = new Date(stats.lastStudyDate);
    var cur = new Date(today);
    var diff = Math.round((cur - last) / 86400000);
    if (diff === 1) { stats.streak++; }
    else if (diff > 1) { stats.streak = 1; }
  } else { stats.streak = 1; }
  stats.lastStudyDate = today;
  saveStats();
  updateStreakUI();
  updateCheckInUI();
}

function checkIn() {
  var today = new Date().toISOString().slice(0,10);
  if (stats.checkInDates[today]) { toast('今日已打卡 ✓'); return; }
  var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
  if (stats.checkInDates[yesterday]) { stats.checkInStreak = (stats.checkInStreak || 0) + 1; }
  else if (stats.checkInDate !== today) { stats.checkInStreak = 1; }
  stats.checkInDate = today;
  stats.checkInDates[today] = true;
  // Every 7-day streak earns 1 make-up card
  if (stats.checkInStreak > 0 && stats.checkInStreak % 7 === 0) {
    stats.makeUpCards = (stats.makeUpCards || 0) + 1;
    saveStats();
    updateCheckInUI();
    toast('打卡成功！连续 ' + stats.checkInStreak + ' 天 🔥 获得1张补签卡！');
    return;
  }
  saveStats();
  updateCheckInUI();
  toast('打卡成功！已连续 ' + stats.checkInStreak + ' 天 🔥');
}

function makeUpCheckIn(dateStr) {
  if (!stats.makeUpCards || stats.makeUpCards <= 0) {
    toast('没有补签卡了 🎫 连续打卡7天可获得1张');
    return;
  }
  if (stats.checkInDates[dateStr]) { toast('该日期已打卡'); return; }
  var today = new Date().toISOString().slice(0,10);
  if (dateStr >= today) { toast('只能补打过去的日期'); return; }
  stats.makeUpCards--;
  stats.checkInDates[dateStr] = true;
  saveStats();
  updateCheckInUI();
  toast('补打卡成功：' + dateStr + '（剩余补签卡 ' + stats.makeUpCards + ' 张）');
}

var calYear = 0, calMonth = 0;

function updateCheckInUI() {
  var today = new Date().toISOString().slice(0,10);
  var el = document.getElementById('checkInStatus');
  var btn = document.getElementById('btnCheckIn');
  var checkedToday = stats.checkInDates[today];
  if (el && btn) {
    if (checkedToday) {
      btn.textContent = '✅ 已打卡';
      btn.classList.add('btn-done');
      el.textContent = '连续 ' + (stats.checkInStreak || 1) + ' 天';
    } else {
      btn.textContent = '📅 打卡';
      btn.classList.remove('btn-done');
      el.textContent = stats.checkInStreak > 0 ? '上次连续 ' + stats.checkInStreak + ' 天' : '';
    }
  }
  var badge = document.getElementById('makeUpBadge');
  if (badge) badge.textContent = '🎫 x' + (stats.makeUpCards || 0);
  // Calendar summary line
  var summary = document.getElementById('calSummaryText');
  if (summary) {
    var parts = [];
    parts.push('🔥 连续' + (stats.checkInStreak || 0) + '天');
    parts.push(checkedToday ? '✅ 今日已打卡' : '📅 今日未打卡');
    if (stats.makeUpCards > 0) parts.push('🎫x' + stats.makeUpCards);
    summary.textContent = parts.join(' · ');
  }
  // Init calendar to current month
  var d = new Date();
  if (calYear === 0) { calYear = d.getFullYear(); calMonth = d.getMonth() + 1; }
  renderCalendar();
}

function renderCalendar() {
  var grid = document.getElementById('calGrid');
  var title = document.getElementById('calMonthTitle');
  if (!grid || !title) return;
  title.textContent = calYear + '年' + calMonth + '月';
  var today = new Date().toISOString().slice(0,10);
  var daysInMonth = new Date(calYear, calMonth, 0).getDate();
  var firstDow = new Date(calYear, calMonth - 1, 1).getDay(); // 0=Sun

  var html = '<div class="cal-dow">日</div><div class="cal-dow">一</div><div class="cal-dow">二</div><div class="cal-dow">三</div><div class="cal-dow">四</div><div class="cal-dow">五</div><div class="cal-dow">六</div>';

  // Empty cells before first day
  for (var i = 0; i < firstDow; i++) {
    html += '<div class="cal-cell cal-empty"></div>';
  }

  for (var d = 1; d <= daysInMonth; d++) {
    var ds = calYear + '-' + String(calMonth).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    var cls = 'cal-cell';
    var title = '';
    if (stats.checkInDates[ds]) { cls += ' cal-done'; title = '已打卡'; }
    else if (ds < today) { cls += ' cal-missed'; title = '漏打卡（点击补打）'; }
    if (ds === today) { cls += ' cal-today'; }
    var onclick = '';
    if (!stats.checkInDates[ds] && ds < today) {
      onclick = ' onclick="showMakeUpConfirm(\'' + ds + '\')"';
    }
    html += '<div class="' + cls + '" title="' + title + '"' + onclick + '>' + d + '</div>';
  }

  grid.innerHTML = html;
}

function showMakeUpConfirm(dateStr) {
  if (!stats.makeUpCards || stats.makeUpCards <= 0) {
    toast('没有补签卡了 🎫 连续打卡7天可获得1张');
    return;
  }
  showConfirm('补打卡', '使用 1 张补签卡补打 ' + dateStr + ' ？<br><small style="color:var(--sub);">剩余补签卡：' + stats.makeUpCards + ' 张</small>', function() {
    makeUpCheckIn(dateStr);
  });
}

function updateMyDataUI() {
  var td = document.getElementById('mdTotalDays');
  var tt = document.getElementById('mdTodayTime');
  var ttl = document.getElementById('mdTotalTime');
  var ws = document.getElementById('mdWordsStudied');
  if (td) td.textContent = stats.totalStudyDays || 0;
  if (tt) { var m = Math.floor((stats.dailyTime || 0) / 60); var s = (stats.dailyTime || 0) % 60; tt.textContent = m + ':' + (s < 10 ? '0' : '') + s; }
  if (ttl) { var tm = Math.floor((stats.totalTime || 0) / 3600); var tr = Math.floor(((stats.totalTime || 0) % 3600) / 60); ttl.textContent = tm + '时' + tr + '分'; }
  if (ws) ws.textContent = stats.wordsStudied || 0;
  renderWeekChart();
}

function renderWeekChart() {
  var bars = document.getElementById('weekBars');
  if (!bars) return;
  var days = [];
  var dayLabels = ['日','一','二','三','四','五','六'];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(Date.now() - i * 86400000);
    var key = d.toISOString().slice(0, 10);
    var count = (stats.dailyWords || {})[key] || 0;
    var idx = d.getDay();
    days.push({ key: key, count: count, label: dayLabels[idx], isToday: i === 0 });
  }
  var maxCount = Math.max.apply(null, days.map(function(d) { return d.count; })) || 1;
  var html = '';
  for (var j = 0; j < days.length; j++) {
    var h = Math.max(2, Math.round(days[j].count / maxCount * 40));
    html += '<div style="flex:1;text-align:center;display:flex;flex-direction:column;align-items:center;">' +
      '<div style="font-size:10px;margin-bottom:2px;color:var(--sub);">' + days[j].count + '</div>' +
      '<div style="width:70%;height:' + h + 'px;background:' + (days[j].isToday ? 'var(--accent)' : 'var(--accent2)') + ';border-radius:4px 4px 0 0;opacity:' + (days[j].count > 0 ? '1' : '0.3') + ';min-height:2px;"></div>' +
      '<div style="font-size:10px;margin-top:4px;color:' + (days[j].isToday ? 'var(--accent)' : 'var(--sub)') + ';font-weight:' + (days[j].isToday ? '700' : '400') + ';">' + days[j].label + '</div>' +
    '</div>';
  }
  bars.innerHTML = html;
}

function updateMyDataTimes() {
  var tt = document.getElementById('mdTodayTime');
  var ttl = document.getElementById('mdTotalTime');
  if (tt) { var m = Math.floor((stats.dailyTime || 0) / 60); var s = (stats.dailyTime || 0) % 60; tt.textContent = m + ':' + (s < 10 ? '0' : '') + s; }
  if (ttl) { var tm = Math.floor((stats.totalTime || 0) / 3600); var tr = Math.floor(((stats.totalTime || 0) % 3600) / 60); ttl.textContent = tm + '时' + tr + '分'; }
}

function updateStreakUI() {
  document.getElementById('streakDisplay').textContent = '🔥 ' + stats.streak + '天';
}

function startLearnTimer() {
  stopLearnTimer();
  learnSeconds = stats.dailyTime || 0;
  updateTimerUI();
  learnTimer = setInterval(function() {
    learnSeconds++;
    stats.dailyTime = learnSeconds;
    stats.totalTime = (stats.totalTime || 0) + 1;
    updateTimerUI();
    updateMyDataTimes();
  }, 1000);
}

function stopLearnTimer() {
  if (learnTimer) { clearInterval(learnTimer); learnTimer = null; }
  saveStats();
}

function updateTimerUI() {
  var m = Math.floor(learnSeconds / 60);
  var s = learnSeconds % 60;
  document.getElementById('timerDisplay').textContent = '⏱ ' + m + ':' + (s < 10 ? '0' : '') + s;
}

// ── Word Data ──
function loadWords() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    words = raw ? JSON.parse(raw) : {};
  } catch(e) { words = {}; localStorage.removeItem(STORAGE_KEY); }
  // Always ensure all preset categories are loaded (dedup by word)
  var cats = ['cet4','cet6','ky','ielts','zsb'];
  for (var i = 0; i < cats.length; i++) {
    try {
      var count = initPreset(cats[i]);
      if (count > 0) localStorage.setItem('dada_need_sync', '1');
    } catch(e) {}
  }
  try { updateAllUI(); } catch(e) {}
}

// ── Background sync of server word banks ──
function autoSyncAllBanks() {
  var banks = [
    { cat: 'cet4', file: 'word_bank_CET4.json' },
    { cat: 'cet6', file: 'word_bank_CET6.json' },
    { cat: 'ky',   file: 'word_bank_KY.json' },
    { cat: 'ielts',file: 'word_bank_IELTS.json' },
    { cat: 'zsb',  file: 'word_bank_ZSB.json' }
  ];
  var idx = 0;
  function syncNext() {
    if (idx >= banks.length) { localStorage.removeItem('dada_need_sync'); return; }
    var b = banks[idx++];
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'word_banks/' + b.file);
    xhr.timeout = 10000;
    xhr.onload = function() {
      if (xhr.status === 200) {
        importJSONBatched(xhr.responseText, null, function(newCount) {
          if (newCount > 0) { saveWords(); try { updateAllUI(); } catch(e) {} }
        });
      }
      setTimeout(syncNext, 500);
    };
    xhr.onerror = function() { setTimeout(syncNext, 500); };
    xhr.ontimeout = function() { setTimeout(syncNext, 500); };
    xhr.send();
  }
  setTimeout(syncNext, 2000);
}

function saveWords() { localStorage.setItem(STORAGE_KEY, JSON.stringify(words)); try { markSyncDirty(); } catch(e) {} }

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

function addWord(en, zh, phonetic, category) {
  if (!en.trim() || !zh.trim()) return;
  var id = genId();
  words[id] = {
    en: en.trim(), zh: zh.trim(),
    phonetic: (phonetic || '').trim(),
    status: 'new', reviews: [], nextReview: null, mistakes: 0,
    category: category || ''
  };
  saveWords();
}

function deleteWord(id) { delete words[id]; saveWords(); }

// ── Ebbinghaus ──
function scheduleReview(id, stage) {
  var w = words[id];
  if (stage >= EBBINGHAUS.length) { w.status = 'mastered'; w.nextReview = null; }
  else { w.status = 'learning'; w.nextReview = Date.now() + EBBINGHAUS[stage] * 86400000; }
  if (!w.reviews) w.reviews = [];
  w.reviews.push(Date.now());
}

function getDueReviewIds() {
  var now = Date.now();
  return Object.keys(words).filter(function(id) {
    var w = words[id];
    return w.nextReview && w.nextReview <= now;
  });
}

// ── Utilities ──
function shuffle(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
}

function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/"/g,'&quot;'); }

function categoryLabel(cat) {
  var map = { cet4:'CET-4', cet6:'CET-6', ielts:'雅思', ky:'考研', zsb:'专升本' };
  return map[cat] || cat;
}

function subcatLabel(sc) {
  var map = { high:'高频词', exam:'真题词' };
  return map[sc] || sc || '其他';
}

// ── CSV/Import ──
function parseCSVText(text) {
  var rows = [], row = [], field = '', inQuotes = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (inQuotes) {
      if (ch === '"') { if (text[i+1] === '"') { field += '"'; i++; } else { inQuotes = false; } }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',' || ch === '，' || ch === '\t') { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (field || row.length > 0) { row.push(field); field = ''; }
        if (row.length > 0) { rows.push(row); row = []; }
        if (ch === '\r' && text[i+1] === '\n') i++;
      }
      else { field += ch; }
    }
  }
  if (field || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function importCSVRows(rows) {
  var count = 0;
  for (var n = 0; n < rows.length; n++) {
    var parts = rows[n];
    if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
      addWord(parts[0].trim(), parts[1].trim(), (parts[2] || '').trim());
      count++;
    }
  }
  return count;
}

function exportJSON() {
  var data = JSON.stringify(words, null, 2);
  var blob = new Blob([data], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'dada-backup-' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('数据已导出！');
}

function normalizeWord(w) {
  if (w.status === undefined) w.status = 'new';
  if (!w.reviews) w.reviews = [];
  if (w.nextReview === undefined) w.nextReview = null;
  if (w.mistakes === undefined) w.mistakes = 0;
  if (w.subcat === undefined) w.subcat = '';
  return w;
}

function importJSON(jsonStr) {
  try {
    var imported = JSON.parse(jsonStr);
    var index = {};
    Object.keys(words).forEach(function(id) {
      var w = words[id];
      if (w.en) index[w.en.toLowerCase() + '|' + (w.category || '')] = id;
    });
    var count = 0;
    Object.keys(imported).forEach(function(id) {
      var w = imported[id];
      if (!w.en || !w.zh) return;
      var key = w.en.toLowerCase() + '|' + (w.category || '');
      var existingId = index[key];
      if (existingId) {
        if (!words[existingId].subcat && w.subcat) words[existingId].subcat = w.subcat;
        if (!words[existingId].phonetic && w.phonetic) words[existingId].phonetic = w.phonetic;
      } else {
        words[id] = normalizeWord(w); count++; index[key] = id;
      }
    });
    saveWords();
    return count;
  } catch(e) { return -1; }
}

function importJSONBatched(jsonStr, onProgress, onComplete) {
  try {
    var imported = JSON.parse(jsonStr);
    var keys = Object.keys(imported);
    // Build index: "en|category" → id
    var index = {};
    Object.keys(words).forEach(function(id) {
      var w = words[id];
      if (w.en) index[w.en.toLowerCase() + '|' + (w.category || '')] = id;
    });
    var batchSize = 500;
    var idx = 0;
    var newCount = 0;
    var updatedCount = 0;
    function processBatch() {
      var end = Math.min(idx + batchSize, keys.length);
      for (; idx < end; idx++) {
        var w = imported[keys[idx]];
        if (!w.en || !w.zh) continue;
        var key = w.en.toLowerCase() + '|' + (w.category || '');
        var existingId = index[key];
        if (existingId) {
          if (!words[existingId].subcat && w.subcat) { words[existingId].subcat = w.subcat; updatedCount++; }
          if (!words[existingId].phonetic && w.phonetic) words[existingId].phonetic = w.phonetic;
        } else {
          words[keys[idx]] = normalizeWord(w); newCount++; index[key] = keys[idx];
        }
      }
      saveWords();
      if (onProgress) onProgress(idx, keys.length);
      if (idx < keys.length) { setTimeout(processBatch, 10); }
      else { if (onComplete) onComplete(newCount, updatedCount); }
    }
    setTimeout(processBatch, 10);
  } catch(e) { if (onComplete) onComplete(-1, 0); }
}

// ── Preset Word Banks ──
function initPreset(cat) {
  var bank = PRESET_BANKS[cat];
  if (!bank) return;
  var count = 0;
  bank.forEach(function(item) {
    var exists = Object.values(words).some(function(w) { return w.en.toLowerCase() === item[0].toLowerCase(); });
    if (!exists) { addWord(item[0], item[1], item[2] || '', cat); count++; }
  });
  return count;
}

var PRESET_BANKS = {
  cet4: [
    ['corresponding','adj. 相当的，相应的；一致的；通信的；v. 类似（correspond的ing形式）；相配',''],
    ['finding','n. 发现；裁决；发现物；v. 找到；感到（find的ing形式）；遇到',''],
    ['training','n. 训练；培养；瞄准；整枝；v. 训练；教养（train的ing形式）',''],
    ['willing','adj. 乐意的；自愿的；心甘情愿的；v. 决心；用意志力驱使；将（财产等）遗赠某人（will的现在分词）',''],
    ['existing','adj. 目前的；现存的；v. 存在（exist的现在分词）',''],
    ['missing','adj. 失踪的；缺少的；v. 错过（miss的ing形式）；想念；漏掉',''],
    ['engineering','n. 工程，工程学；v. 设计；管理（engineer的ing形式）；建造',''],
    ['warning','n. 警告；预兆；预告；v. 警告（warn的ing形式）；adj. 警告的；引以为戒的',''],
    ['earnings','n. 收入',''],
    ['leading','adj. 领导的；主要的；n. 领导；铅板；行距；v. 领导（lead的ing形式）',''],
    ['experience','n. 经验；经历；体验；vt. 经验；经历；体验',''],
    ['experienced','adj. 老练的，熟练的；富有经验的',''],
    ['identify','vt. 确定；鉴定；识别，辨认出；使参与；把…看成一样 vi. 确定；认同；一致',''],
    ['event','n. 事件，大事；项目；结果',''],
    ['emerge','vi. 浮现；摆脱；暴露',''],
    ['establish','vi. 植物定植；vt. 建立；创办；安置',''],
    ['estate','n. 房地产；财产；身份',''],
    ['effect','n. 影响；效果；作用；vt. 产生；达到目的',''],
    ['effective','adj. 有效的，起作用的；实际的，实在的；给人深刻印象',''],
    ['efficient','adj. 有效率的；有能力的；生效的',''],
    ['efficiency','n. 效率；效能；功效',''],
    ['exact','adj. 准确的，精密的；精确的；vt. 要求；强求；急需；vi. 勒索钱财',''],
    ['expense','n. 损失，代价；消费；开支；vt. 向…收取费用；vi. 被花掉',''],
    ['expand','vt. 扩张；使膨胀；详述；vi. 发展；张开，展开',''],
    ['examine','vt. 检查；调查； 检测；考试；vi. 检查；调查',''],
    ['exist','vi. 存在；生存；生活；继续存在',''],
    ['comprehension','n. 理解；包含',''],
    ['function','n. 功能； 函数；职责；盛大的集会；vi. 运行；活动；行使职责',''],
    ['option','n.  选项；选择权；买卖的特权',''],
    ['protection','n. 保护；防卫；护照',''],
    ['solution','n. 解决方案；溶液；溶解；解答',''],
    ['version','n. 版本；译文；倒转术',''],
    ['creation','n. 创造，创作；创作物，产物',''],
    ['pollution','n. 污染；污染物',''],
    ['emission','n. （光、热等的）发射，散发；喷射；发行',''],
    ['revolution','n. 革命；旋转；运行；循环',''],
    ['portion','n. 部分；一份；命运；vt. 分配；给…嫁妆',''],
    ['restriction','n. 限制；约束；束缚',''],
    ['session','n. 会议；（法庭的）开庭；（议会等的）开会；学期；讲习会',''],
    ['instruction','n. 指令，命令；指示；教导；用法说明',''],
    ['application','n. 应用；申请；应用程序；敷用',''],
    ['foundation','n. 基础；地基；基金会；根据；创立',''],
    ['transportation','n. 运输；运输系统；运输工具；流放',''],
    ['location','n. 位置（形容词locational）；地点；外景拍摄场地',''],
    ['motivation','n. 动机；积极性；推动',''],
    ['reputation','n. 名声，名誉；声望',''],
    ['develop','vi. 发育；生长；进化；显露；vt. 开发；进步；使成长；使显影',''],
    ['decline','n. 下降；衰退；斜面；vt. 谢绝；婉拒；vi. 下降；衰落；谢绝',''],
    ['development','n. 发展；开发；发育；住宅小区（专指由同一开发商开发的）； 显影',''],
    ['derive','vt. 源于；得自；获得；vi. 起源',''],
    ['degree','n. 程度，等级；度；学位；阶层',''],
    ['demand','n.  需求；要求；需要；vt. 要求；需要；查询；vi. 需要；请求；查问',''],
    ['detail','n. 细节，详情；vt. 详述；选派；vi. 画详图',''],
    ['department','n. 部；部门；系；科；局',''],
    ['despite','prep. 尽管，不管；n. 轻视；憎恨；侮辱',''],
    ['debate','n. 辩论；辩论会；vt. 辩论，争论，讨论；vi. 辩论，争论，讨论',''],
    ['depression','n. 沮丧；洼地；不景气；忧愁；低气压区',''],
    ['desire','n. 欲望；要求，心愿；性欲；vt. 想要；要求；希望得到…；vi. 渴望',''],
    ['decrease','n. 减少，减小；减少量；vt. 减少，减小；vi. 减少，减小',''],
    ['description','n. 描述，描写；类型；说明书',''],
    ['describe','vt. 描述，形容；描绘',''],
    ['determine','v. （使）下决心，（使）做出决定；vt. 决定，确定；判定，判决；限定；vi. 确定；决定；判决，终止；了结，终止，结束',''],
    ['delay','n. 延期；耽搁；被耽搁或推迟的时间；vt. 延期；耽搁；vi. 延期；耽搁',''],
    ['deliver','n. 投球；vt. 交付；发表；递送；释放；给予（打击）；给…接生；vi. 实现；传送；履行；投递',''],
    ['delivery','n.  交付；分娩；递送',''],
    ['developer','n. 开发者； 显影剂',''],
    ['economy','n. 经济；节约；理财',''],
    ['economic','adj. 经济的，经济上的；经济学的',''],
    ['economist','n. 经济学者；节俭的人',''],
    ['economics','n. 经济学；国家的经济状况',''],
    ['project','n. 工程；计划；事业；vt. 设计；计划；发射；放映；vi. 设计；计划；表达；投射',''],
    ['object','n. 目标；物体；客体；宾语；vt. 提出…作为反对的理由；vi. 反对；拒绝',''],
    ['suggest','vt. 提议，建议；启发；使人想起；显示；暗示',''],
    ['consumer','n. 消费者；用户，顾客',''],
    ['consumption','n. 消费；消耗；肺痨',''],
    ['consume','vt. 消耗，消费；使…着迷；挥霍；vi. 耗尽，毁灭；耗尽生命',''],
    ['quality','n. 质量， 品质；特性；才能；adj. 优质的；高品质的；<英俚>棒极了',''],
    ['security','n. 安全；保证；证券；抵押品；adj. 安全的；保安的；保密的',''],
    ['obesity','n. 肥大，肥胖',''],
    ['personality','n. 个性；品格；名人',''],
    ['priority','n. 优先；优先权； 优先次序；优先考虑的事',''],
    ['reality','n. 现实；实际；真实',''],
    ['digital','n. 数字；键；adj. 数字的；手指的',''],
    ['global','adj. 全球的；总体的；球形的',''],
    ['personal','n. 人事消息栏；人称代名词；adj. 个人的；身体的；亲自的',''],
    ['traditional','adj. 传统的；惯例的',''],
    ['environmental','adj. 环境的，周围的；有关环境的',''],
    ['total','n. 总数，合计；adj. 全部的；完全的；整个的；vt. 总数达；vi. 合计',''],
    ['cultural','adj. 文化的；教养的',''],
    ['emotional','adj. 情绪的；易激动的；感动人的',''],
    ['federal','adv. 联邦政府地；adj. 联邦的；同盟的；联邦政府的； 联邦制的',''],
    ['central','n. 电话总机；adj. 中心的；主要的；中枢的',''],
    ['equal','n. 对手；匹敌；同辈；相等的事物；adj. 平等的；相等的；胜任的；vt. 等于；比得上',''],
    ['formal','n. 正式的社交活动；夜礼服；adj. 正式的；拘谨的；有条理的',''],
    ['rental','n. 租金收入，租金；租赁；adj. 租赁的；收取租金的',''],
    ['financial','adj. 金融的；财政的，财务的',''],
    ['potential','n. 潜能；可能性； 电势；adj. 潜在的；可能的；势的',''],
    ['essential','n. 本质；要素；要点；必需品；adj. 基本的；必要的；本质的；精华的',''],
    ['official','adj. 官方的；正式的；公务的；n. 官员；公务员；高级职员',''],
    ['commercial','n. 商业广告；adj. 商业的；营利的；靠广告收入的',''],
    ['industrial','n. 工业股票；工业工人；adj. 工业的，产业的；从事工业的；供工业用的；来自勤劳的',''],
    ['access','n. 进入；使用权；通路；vt. 使用；存取；接近',''],
    ['accident','n. 事故；意外； 意外事件；机遇',''],
    ['account','n. 账户；解释；账目，账单；理由；描述；vt. 认为；把…视为；vi. 解释；导致；报账',''],
    ['attach','vi. 附加；附属；伴随；vt. 使依附；贴上；系上；使依恋',''],
    ['attack','n. 攻击；抨击；疾病发作；vt. 攻击；抨击；动手干；vi. 攻击；腐蚀',''],
    ['attract','vt. 吸引；引起；vi. 吸引；有吸引力',''],
    ['attend','vi. 出席；致力于；照料；照顾；vt. 出席；上（大学等）；照料；招待；陪伴',''],
    ['attractive','adj. 吸引人的；有魅力的；引人注目的',''],
    ['approach','n. 方法；途径；接近；vt. 接近；着手处理；vi. 靠近',''],
    ['appeal','n. 呼吁，请求；吸引力，感染力；上诉；诉诸裁判；vt. 将…上诉，对…上诉；vi. 呼吁，恳求；上诉；诉诸，求助；有吸引力，迎合爱好；（体育比赛中）诉诸裁判',''],
    ['provide','vt. 提供；规定；准备；装备；vi. 规定；抚养；作准备',''],
    ['evidence','n. 证据，证明；迹象；明显；vt. 证明',''],
    ['alcohol','n. 酒精，乙醇',''],
    ['receive','vt. 收到；接待；接纳；vi. 接收',''],
    ['reduce','vi. 减少；缩小；归纳为；vt. 减少；降低；使处于；把…分解',''],
    ['record','n. 档案，履历；唱片；最高纪录；adj. 创纪录的；vt. 记录，记载；标明；将...录音；vi. 记录；录音',''],
    ['remain','n. 遗迹；剩余物，残骸；vi. 保持；依然；留下；剩余；逗留；残存',''],
    ['reward','n.  报酬；报答；酬谢；vt.  奖励；奖赏',''],
    ['resource','n. 资源，财力；办法；智谋',''],
    ['rely','vi. 依靠；信赖',''],
    ['replace','vt. 取代，代替；替换，更换；归还，偿还；把…放回原处',''],
    ['release','n. 释放；发布；让与；vt. 释放；发射；让与；允许发表',''],
    ['recommend','vt. 推荐，介绍；劝告；使受欢迎；托付；vi. 推荐；建议',''],
    ['respect','n. 尊敬，尊重；方面；敬意；vt. 尊敬，尊重；遵守',''],
    ['reveal','n. 揭露；暴露；门侧，窗侧；vt. 显示；透露；揭露；泄露',''],
    ['recall','n. 召回；回忆；撤消；vt. 召回；回想起，记起；取消',''],
    ['respond','n. 应答；唱和；vi. 回答；作出反应；承担责任；vt. 以…回答',''],
    ['revenue','n. 税收，国家的收入；收益',''],
    ['reverse','n. 背面；相反；倒退；失败；adj. 反面的；颠倒的；反身的；vt. 颠倒；倒转；vi. 倒退；逆叫',''],
    ['recover','n. 还原至预备姿势；vt. 恢复；弥补；重新获得；vi. 恢复；胜诉；重新得球',''],
    ['reflect','vt. 反映；反射，照出；表达；显示;反省；vi. 反射，映现；深思',''],
    ['regard','n. 注意；尊重；问候；凝视；vi. 注意，注重；注视；vt. 注重，考虑；看待；尊敬；把…看作；与…有关',''],
    ['represent','vt. 代表；表现；描绘；回忆；再赠送；vi. 代表；提出异议',''],
    ['continue','vt. 继续说…；使…继续；使…延长；vi. 继续，延续；仍旧，连续',''],
    ['concern','n. 关系；关心；关心的事；忧虑；vt. 涉及，关系到；使担心',''],
    ['contact','n. 接触，联系；vt. 使接触，联系；vi. 使接触，联系',''],
    ['content','n. 内容，目录；满足；容量；adj. 满意的；vt. 使满足',''],
    ['concept','n. 观念，概念',''],
    ['conflict','n. 冲突，矛盾；斗争；争执；vi. 冲突，抵触；争执；战斗',''],
    ['conduct','n. 进行；行为；实施；vi. 导电；带领；vt. 管理；引导；表现',''],
    ['concerned','v. 关心（concern的过去时和过去分词）；与…有关；adj. 有关的；关心的',''],
    ['conclude','vi. 推断；断定；决定；vt. 推断；决定，作结论；结束',''],
    ['community','n. 社区； 群落；共同体；团体',''],
    ['complete','adj. 完整的；完全的；彻底的；vt. 完成',''],
    ['commit','vt. 犯罪，做错事；把...交托给；指派…作战；使…承担义务',''],
    ['complicated','adj. 难懂的，复杂的',''],
    ['complain','vi. 投诉；发牢骚；诉说；vt. 抱怨；控诉',''],
    ['career','n. 生涯；职业；事业；速度，全速；adj. 作为毕生职业的；vi. 全速前进，猛冲',''],
    ['patient','n. 病人；患者；adj. 有耐心的，能容忍的',''],
    ['excellent','adj. 卓越的；极好的；杰出的',''],
    ['ingredient','n. 原料；要素；组成部分；adj. 构成组成部分的',''],
    ['decade','n. 十年，十年期；十',''],
    ['space','n. 空间；太空；距离；vt. 隔开；vi. 留间隔',''],
    ['actually','adv. 实际上；事实上',''],
    ['especially','adv. 特别；尤其；格外',''],
    ['increasingly','adv. 越来越多地；渐增地',''],
    ['recently','adv. 最近；新近',''],
    ['highly','adv. 高度地；非常；非常赞许地',''],
    ['ultimately','adv. 最后；根本；基本上',''],
    ['immediately','conj. 一…就；adv. 立即，立刻；直接地',''],
    ['slightly','adv. 些微地，轻微地；纤细地',''],
    ['eventually','adv. 最后，终于',''],
    ['largely','adv. 主要地；大部分；大量地',''],
    ['survey','n. 调查；测量；审视；纵览；vt. 调查；勘测；俯瞰；vi. 测量土地',''],
    ['surface','n. 表面；表层；外观；adj. 表面的，肤浅的；vt. 使浮出水面；使成平面；vi. 浮出水面',''],
    ['survive','vi. 幸存；活下来；vt. 幸存；生还；幸免于；比...活得长',''],
    ['calorie','n. 卡路里（热量单位）',''],
    ['rate','n. 比率，率；速度；价格；等级；vt. 认为；估价；责骂；vi. 责骂；被评价',''],
    ['individual','n. 个人，个体；adj. 个人的；个别的；独特的',''],
    ['indicate','vt. 表明；指出；预示；象征',''],
    ['induce','vt. 诱导；引起；引诱；感应',''],
    ['infant','n. 婴儿；幼儿；未成年人；adj. 婴儿的；幼稚的；初期的；未成年的',''],
    ['impact','vi. 影响；撞击；冲突；压紧（on，upon，with）；n. 影响；效果；碰撞；冲击力；vt. 挤入，压紧；撞击；对…产生影响',''],
    ['import','n. 进口，进口货；输入；意思，含义；重要性；vt. 输入，进口；含…的意思；vi. 输入，进口',''],
    ['implication','n. 含义；暗示；牵连，卷入；可能的结果，影响',''],
    ['process','n. 过程，进行；方法，步骤；作用；程序；推移；adj. 经过特殊加工（或处理）的；vt. 处理；加工；vi. 列队前进',''],
    ['recession','n. 衰退；不景气；后退；凹处',''],
    ['succeed','vi. 成功；继承；继任；兴旺；vt. 继承；接替；继…之后',''],
    ['expect','vi. 期待；预期；vt. 期望；指望；认为；预料',''],
    ['expectation','n. 期待；预期；指望',''],
    ['doctor','vt. 修理；篡改，伪造；为…治病；授以博士学位；n. 医生；博士；vi. 就医；行医',''],
    ['director','n. 主任，主管；导演；人事助理',''],
    ['monitor','n. 监视器；监听器；监控器；显示屏；班长；vt. 监控',''],
    ['sector','n. 部门；扇形，扇区；象限仪；函数尺；vt. 把…分成扇形',''],
    ['device','n. 装置；策略；图案',''],
    ['innovation','n. 创新，革新；新方法',''],
    ['novel','adj. 新奇的；异常的；n. 小说',''],
    ['major','adj. 主要的；重要的；主修的；较多的；n.  成年人；主修科目；陆军少校；vi. 主修',''],
    ['majority','n. 多数；成年',''],
    ['pressure','n. 压力；压迫， 压强；vt. 迫使；密封；使……增压',''],
    ['measure','n. 测量；措施；程度；尺寸；vt. 测量；估量；权衡；vi. 测量；估量',''],
    ['figure','n. 数字；人物；图形；价格；（人的）体形；画像；vt. 计算；认为；描绘；象征；vi. 计算；出现；扮演角色',''],
    ['structure','n. 结构；构造；建筑物；vt. 组织；构成；建造',''],
    ['literature','n. 文学；文献；文艺；著作',''],
    ['pleasure','n. 快乐；希望；娱乐；令人高兴的事；vt. 使高兴；使满意；vi. 高兴；寻欢作乐',''],
    ['policy','n. 政策，方针；保险单',''],
    ['strategy','n. 战略，策略',''],
    ['wealthy','n. 富人；adj. 富有的；充分的；丰裕的',''],
    ['theory','n. 理论；原理；学说；推测','']
  ],
  cet6: [
    ['act','n. 行为，行动；法令，法案；（戏剧，歌剧的）一幕，段；装腔作势 vt. 扮演；装作，举动像 vi. 行动；扮演，充当；表现，举止；假装，演戏；起作用，见效',''],
    ['active','n. 主动语态；积极分子 adj. 积极的；活跃的；主动的；有效的；现役的',''],
    ['activate','vt. 刺激；使活动；使活泼；使产生放射性 vi. 激活；有活力',''],
    ['transact','vt. 办理；处理 vi. 交易；谈判',''],
    ['transaction','n. 交易；事务；办理；会报，学报',''],
    ['interact','n. 幕间剧；幕间休息 vt. 互相影响；互相作用 vi. 互相影响；互相作用',''],
    ['interaction','n. 相互作用； 交互作用 n. 互动',''],
    ['interactive','adj. 交互式的；相互作用的',''],
    ['react','vi. 反应；影响；反抗；起反作用 vt. 使发生相互作用；使起化学反应',''],
    ['reaction','n. 反应，感应；反动，复古；反作用',''],
    ['reactionary','n. 反动分子；反动派；保守派 adj. 保守的，反动的；反动主义的；反对改革的',''],
    ['enact','vt. 颁布；制定法律；扮演；发生',''],
    ['actual','adj. 真实的，实际的；现行的，目前的',''],
    ['actuality','n. 现状；现实；事实',''],
    ['agency','n. 代理，中介；代理处，经销处',''],
    ['agent','n. 代理人，代理商；药剂；特工 adj. 代理的 vt. 由…作中介；由…代理',''],
    ['agenda','n. 议程；日常工作事项；日程表',''],
    ['agitate','vt. 摇动；骚动；使…激动 vi. 煽动',''],
    ['antagonism','n. 对抗，敌对；对立；敌意',''],
    ['lecture','n. 演讲；讲稿；教训 vt. 演讲；训诫 vi. 讲课；讲演',''],
    ['dialect','n. 方言，土话；同源语；行话；个人用语特征 adj. 方言的',''],
    ['allege','vt. 宣称，断言；提出…作为理由',''],
    ['alleged','v. 宣称（allege的过去式和过去分词）；断言 adj. 所谓的；声称的；被断言的',''],
    ['allegedly','adv. 依其申述；据说，据称',''],
    ['legend','n. 传奇；说明；图例；刻印文字',''],
    ['legendary','adj. 传说的，传奇的 n. 传说集；圣徒传',''],
    ['elect','n. 被选的人；特殊阶层；上帝的选民 adj. 选出的；当选的；卓越的 vi. 作出选择；进行选举 vt. 选举；选择；推选',''],
    ['election','n. 选举；当选；选择权；上帝的选拔',''],
    ['elector','n. 选举人；有选举权的人；总统选举人',''],
    ['electoral','adj. 选举的；选举人的',''],
    ['select','n. 被挑选者；精萃 adj. 精选的；挑选出来的；极好的 vt. 挑选；选拔 vi. 挑选',''],
    ['selection','n. 选择，挑选；选集；精选品',''],
    ['delegate','n. 代表 vt. 委派…为代表',''],
    ['delegation','n. 代表团；授权；委托',''],
    ['elegant','adj. 高雅的，优雅的；讲究的；简炼的；简洁的',''],
    ['eligible','n. 合格者；适任者；有资格者 adj. 合格的，合适的；符合条件的；有资格当选的',''],
    ['neglect','vt. 疏忽，忽视；忽略 n. 疏忽，忽视；怠慢',''],
    ['neglectful','adj. 疏忽的；忽略的；不小心的',''],
    ['negligent','adj. 疏忽的；粗心大意的',''],
    ['negligible','adj. 微不足道的，可以忽略的',''],
    ['intellect','n. 智力，理解力；知识分子；思维逻辑领悟力；智力高的人',''],
    ['intellectual','n. 知识分子；凭理智做事者 adj. 智力的；聪明的；理智的',''],
    ['intelligent','adj. 智能的；聪明的；理解力强的',''],
    ['intelligence','n. 智力；情报工作；情报机关；理解力；才智，智慧；天分',''],
    ['intelligible','adj. 可理解的；明了的；仅能用智力了解的',''],
    ['insect','n. 昆虫；卑鄙的人',''],
    ['section','n. 截面；部分；部门；地区；章节 vt. 把…分段；将…切片；对…进行划分 vi. 被切割成片；被分成部分',''],
    ['intersection','n. 交叉；十字路口；交集；交叉点',''],
    ['sector','n. 部门；扇形，扇区；象限仪；函数尺 vt. 把…分成扇形',''],
    ['segment','n. 段；部分 vt. 分割 vi. 分割',''],
    ['sex','n. 性；性别；性行为；色情 vt. 引起…的性欲；区别…的性别',''],
    ['homosexual','n. 同性恋者 adj. 同性恋的',''],
    ['doctor','vt. 修理；篡改，伪造；为…治病；授以博士学位 n. 医生；博士 vi. 就医；行医',''],
    ['doctrine','n. 主义；学说；教义；信条',''],
    ['document','n. 文件，公文； 文档；证件 vt. 用文件证明',''],
    ['dogma','n. 教条，教理；武断的意见',''],
    ['dogmatic','adj. 教条的；武断的',''],
    ['orthodox','adj. 正统的；传统的；惯常的；东正教的 n. 正统的人；正统的事物',''],
    ['paradox','n. 悖论，反论；似非而是的论点；自相矛盾的人或事',''],
    ['fraction','n. 分数；部分；小部分；稍微',''],
    ['fracture','n. 破裂，断裂； 骨折 vt. 使破裂 vi. 破裂；折断',''],
    ['fractured','adj. 断裂的；挫伤的；折裂的 v. 断裂（fracture的过去式）',''],
    ['fragment','n. 碎片；片断或不完整部分 vt. 使成碎片 vi. 破碎或裂开',''],
    ['fragmentary','adj. 碎片的；不完全的；断断续续的',''],
    ['fragile','adj. 脆的；易碎的',''],
    ['infringe','vt. 侵犯；违反；破坏 vi. 侵犯；侵害',''],
    ['infringement','n. 侵犯；违反',''],
    ['tangent','n. 切线， 正切 adj. 切线的，相切的；接触的；离题的',''],
    ['tangible','n. 有形资产 adj. 有形的；切实的；可触摸的',''],
    ['intangible','adj. 无形的，触摸不到的；难以理解的',''],
    ['contagion','n. 传染病；蔓延；触染',''],
    ['contagious','adj. 感染性的；会蔓延的',''],
    ['integer','n. 整数；整体；完整的事物',''],
    ['integral','n. 积分；部分；完整 adj. 积分的；完整的，整体的；构成整体所必须的',''],
    ['integrate','n. 一体化；集成体 adj. 整合的；完全的 vi. 求积分；取消隔离；成为一体 vt. 使…完整；使…成整体；求…的积分；表示…的总和',''],
    ['integrity','n. 完整；正直；诚实；廉正',''],
    ['disintegrate','vi. 瓦解；碎裂；衰变 vt. 使分解；使碎裂；使崩溃；使衰变',''],
    ['disintegration','n. 瓦解，崩溃；分解',''],
    ['contact','n. 接触，联系 vt. 使接触，联系 vi. 使接触，联系',''],
    ['intact','adj. 完整的；原封不动的；未受损伤的',''],
    ['tact','n. 机智；老练；圆滑；鉴赏力',''],
    ['tactful','adj. 机智的；圆滑的；老练的',''],
    ['tactless','adj. 不机智的；不老练的；笨拙的',''],
    ['tactic','n. 策略，战略 adj. 按顺序的，依次排列的',''],
    ['found','v. 找到（find的过去分词） vt. 创立，建立；创办',''],
    ['foundation','n. 基础；地基；基金会；根据；创立',''],
    ['fund','n. 基金；资金；存款 vt. 投资；资助',''],
    ['funding','n. 提供资金；用发行长期债券的方法来收回短期债券 v. 提供资金；积存（fund的ing形式）',''],
    ['refund','n. 退款；偿还，偿还额 vt. 退还；偿还；付还 vi. 退还；偿还，归还',''],
    ['fundamental','n. 基本原理；基本原则 adj. 基本的，根本的',''],
    ['profound','adj. 深厚的；意义深远的；渊博的',''],
    ['promise','n. 许诺，允诺；希望 vt. 允诺，许诺；给人以…的指望或希望 vi. 许诺；有指望，有前途',''],
    ['promissory','adj. 约定的；允诺的；约定支付的',''],
    ['promising','v. 许诺，答应（promise的现在分词形式） adj. 有希望的，有前途的',''],
    ['compromise','n. 妥协，和解；折衷 vt. 妥协；危害 vi. 妥协；让步',''],
    ['premise','n. 前提；上述各项；房屋连地基 vt. 引出，预先提出；作为…的前提 vi. 作出前提',''],
    ['committee','n. 委员会',''],
    ['commit','vt. 犯罪，做错事；把...交托给；指派…作战；使…承担义务',''],
    ['commit','vt. 犯罪，做错事；把...交托给；指派…作战；使…承担义务',''],
    ['commitment','n. 承诺，保证；委托；承担义务；献身',''],
    ['commission','n. 委员会；佣金；犯；委任；委任状 vt. 委任；使服役；委托制作',''],
    ['labor','n. 劳动；工作；劳工；分娩 vi. 劳动；努力；苦干 vt. 详细分析；使厌烦',''],
    ['labour','n. （英国）工党',''],
    ['collaborate','vi. 合作；勾结，通敌',''],
    ['collaboration','n. 合作；勾结；通敌',''],
    ['elaborate','adj. 精心制作的；详尽的；煞费苦心的 vi. 详细描述；变复杂 vt. 精心制作；详细阐述；从简单成分合成（复杂有机物）',''],
    ['adolescent','n. 青少年 adj. 青春期的；未成熟的',''],
    ['adolescence','n. 青春期',''],
    ['decree','n. 法令；判决 vt. 命令；颁布；注定；判决 vi. 注定；发布命令',''],
    ['affiliate','n. 联号；隶属的机构等 vt. 使附属；接纳；使紧密联系 vi. 参加，加入；发生联系',''],
    ['assault','n. 攻击；袭击 vt. 攻击；袭击 vi. 袭击；动武',''],
    ['audit','n. 审计； 查账 vt. （美）旁听 vi. 审计； 查账',''],
    ['auditor','n. 审计员；听者；旁听生',''],
    ['census','n. 人口普查，人口调查 vt. 实施统计调查',''],
    ['coalition','n. 联合；结合，合并',''],
    ['extravagant','adj. 奢侈的；浪费的；过度的；放纵的',''],
    ['massacre','vt. 残杀；彻底击败 n. 大屠杀；惨败',''],
    ['intricate','adj. 复杂的；错综的，缠结的',''],
    ['obscure','adj. 昏暗的，朦胧的；晦涩的，不清楚的；隐蔽的；不著名的，无名的 vt. 使…模糊不清，掩盖；隐藏；使难理解 n. 某种模糊的或不清楚的东西',''],
    ['obsess','vt. 迷住，缠住；使…着迷；使…困扰',''],
    ['ordeal','n. 折磨；严酷的考验；痛苦的经验',''],
    ['volatile','n. 挥发物；有翅的动物 adj. 挥发性的；不稳定的；爆炸性的；反复无常的',''],
    ['arrogant','adj. 自大的，傲慢的',''],
    ['arrogance','n. 自大；傲慢态度',''],
    ['appease','vt. 使平息；使满足；使和缓；对…让步',''],
    ['curfew','n. 宵禁；宵禁令；晚钟；打晚钟时刻',''],
    ['decimal','n. 小数 adj. 小数的；十进位的',''],
    ['eclipse','n. 日蚀，月蚀；黯然失色 vt. 使黯然失色；形成蚀',''],
    ['illicit','adj. 违法的；不正当的',''],
    ['latitude','n. 纬度；界限；活动范围',''],
    ['hierarchy','n. 层级；等级制度',''],
    ['menace','n. 威胁；恐吓 vi. 恐吓；进行威胁 vt. 威胁；恐吓',''],
    ['plateau','n. 高原 n. 普拉托 n. （活动或进程中的）稳定阶段，停滞时期 adj. 高原印第安人的',''],
    ['way','n. 方法；道路；方向；行业；习惯 adj. 途中的 adv. 大大地；远远地',''],
    ['driveway','n. （从建筑物，住房，车库等通往大路的）私人车道',''],
    ['expressway','n. （美）高速公路',''],
    ['freeway','n. 高速公路',''],
    ['underway','n. 水底通道 adj. 进行中的；起步的；航行中的',''],
    ['convey','vt. 传达；运输；让与',''],
    ['envoy','n. 使者；全权公使',''],
    ['vehicle','n. 车辆；工具；交通工具；运载工具；传播媒介；媒介物',''],
    ['deviate','vi. 脱离；越轨 vt. 使偏离',''],
    ['previous','adj. 以前的；早先的；过早的 adv. 在先；在…以前',''],
    ['via','prep. 渠道，通过；经由',''],
    ['want','n. 需要；缺乏；贫困；必需品 vt. 需要；希望；应该；缺少 vi. 需要；缺少',''],
    ['vanish','n. 弱化音 vi. 消失；突然不见；成为零 vt. 使不见，使消失',''],
    ['vain','adj. 徒劳的；自负的；无结果的；无用的',''],
    ['vacation','n. 假期；（房屋）搬出 vi. 休假，度假',''],
    ['evacuate','vt. 疏散，撤退；排泄 vi. 疏散；撤退；排泄',''],
    ['evacuation','n. 疏散；撤离；排泄',''],
    ['vacant','adj. 空虚的；空的；空缺的；空闲的；茫然的',''],
    ['vacancy','n. 空缺；空位；空白；空虚',''],
    ['vacuum','n. 真空；空间；真空吸尘器 adj. 真空的；利用真空的；产生真空的 vt. 用真空吸尘器清扫',''],
    ['win','n. 赢；胜利 vt. 赢得；在…中获胜；劝诱 vi. 赢；获胜；成功',''],
    ['convince','vt. 说服；使确信，使信服',''],
    ['victory','n. 胜利；成功；克服',''],
    ['victorious','adj. 胜利的；凯旋的',''],
    ['convict','n. 罪犯 vt. 证明…有罪；宣告…有罪',''],
    ['conviction','n. 定罪；确信；证明有罪；确信，坚定的信仰',''],
    ['animal','n. 动物 动物的',''],
    ['animate','adj. 有生命的 vt. 使有生气；使活泼；鼓舞；推动',''],
    ['animated','vt. 使…有生气（animate的过去式） adj. 活生生的；活泼的；愉快的',''],
    ['unanimous','adj. 全体一致的；意见一致的；无异议的',''],
    ['merge','vt. 合并；使合并；吞没 vi. 合并；融合',''],
    ['emerge','vi. 浮现；摆脱；暴露',''],
    ['emergency','n. 紧急情况；突发事件；非常时刻 adj. 紧急的；备用的',''],
    ['submerge','vt. 淹没；把…浸入；沉浸 vi. 淹没；潜入水中；湮没',''],
    ['immerse','vt. 沉浸；使陷入',''],
    ['mark','n. 标志；马克；符号；痕迹；分数 vi. 作记号 vt. .标志；做标记于；打分数 n. . 标志；做标记于；打分数',''],
    ['landmark','n. 陆标；地标；界标；里程碑；纪念碑；地界标；划时代的事 adj. 有重大意义或影响的',''],
    ['remark','n. 注意；言辞 vt. 评论；觉察 vi. 谈论',''],
    ['marked','adj. 显著的；有记号的 v. 表示（mark的过去分词）；作记号；打分数',''],
    ['remarkable','adj. 卓越的；非凡的；值得注意的',''],
    ['margin','n. 边缘；利润，余裕；页边的空白 vt. 加边于；加旁注于',''],
    ['marginal','adj. 边缘的；临界的；末端的',''],
    ['recognize','vt. 认出，识别；承认 vi. 确认，承认；具结',''],
    ['recognise','vt. 认出；承认，认可；识别',''],
    ['recognition','n. 识别；承认，认出；重视；赞誉；公认',''],
    ['cognitive','adj. 认知的，认识的',''],
    ['diagnose','vt. 诊断；断定 vi. 诊断；判断',''],
    ['diagnosis','n. 诊断',''],
    ['ignore','vt. 驳回诉讼；忽视；不理睬',''],
    ['ignorant','adj. 无知的；愚昧的',''],
    ['ignorance','n. 无知，愚昧；不知，不懂',''],
    ['respond','n. 应答；唱和 vi. 回答；作出反应；承担责任 vt. 以…回答',''],
    ['respondent','n. 被告；应答者 adj. 回答的；应答的',''],
    ['correspond','vi. 符合，一致；相应；通信',''],
    ['correspondent','n. 通讯记者；客户；通信者；代理商行',''],
    ['correspondence','n. 通信；一致；相当',''],
    ['corresponding','adj. 相当的，相应的；一致的；通信的 v. 类似（correspond的ing形式）；相配',''],
    ['response','n. 响应；反应；回答',''],
    ['responsive','adj. 响应的；应答的；回答的',''],
    ['responsible','adj. 负责的，可靠的；有责任的',''],
    ['responsibility','n. 责任，职责；义务',''],
    ['sponsor','n. 赞助者；主办者；保证人 vt. 赞助；发起',''],
    ['spontaneous','adj. 自发的；自然的；无意识的',''],
    ['tend','vt. 照料，照管 vi. 趋向，倾向；照料，照顾',''],
    ['tendency','n. 倾向，趋势；癖好',''],
    ['tender','n. 偿付，清偿；看管人；小船 adj. 温柔的；柔软的；脆弱的；幼稚的；难对付的 vt. 提供，偿还；使…变嫩；使…变柔软 vi. 投标；变柔软',''],
    ['attend','vi. 出席；致力于；照料；照顾 vt. 出席；上（大学等）；照料；招待；陪伴','']
  ],
  ielts: [
    ['atmosphere','n. 气氛；大气；空气',''],
    ['hydrosphere','n.  水界， 水圈；水气',''],
    ['lithosphere','n. 陆界， 岩石圈',''],
    ['oxygen','n.  氧气， 氧',''],
    ['oxide','n.  氧化物',''],
    ['carbon dioxide','n. 二氧化碳； 一氧化碳；二氧货碳；碳酐',''],
    ['hydrogen','n.  氢',''],
    ['core','找不到解释',''],
    ['crust','n. 地壳；外壳；面包皮；坚硬外皮；vi. 结硬皮；结成外壳；vt. 盖以硬皮；在…上结硬皮',''],
    ['mantle','n. 地幔；斗篷；覆盖物；vi. 覆盖；脸红；vt. 覆盖',''],
    ['longitude','n.  经度；经线',''],
    ['latitude','n. 纬度；界限；活动范围',''],
    ['horizon','n.  地平线；视野；眼界；范围',''],
    ['altitude','n. 高地；高度； 顶垂线；（等级和地位等的）高级；海拔',''],
    ['disaster','n. 灾难，灾祸；不幸',''],
    ['mishap','n. 灾祸；不幸事故；晦气',''],
    ['catastrophic','adj. 灾难的；悲惨的；灾难性的，毁灭性的',''],
    ['calamity','n. 灾难；不幸事件',''],
    ['endanger','vt. 危及；使遭到危险',''],
    ['jeopardise','vt. 危及（等于jeopardize）；使…受危险',''],
    ['destructive','adj. 破坏的；毁灭性的；有害的，消极的',''],
    ['El Niño','找不到解释',''],
    ['greenhouse','n. 温室；造成温室效应的',''],
    ['phenomenon','n. 现象；奇迹；杰出的人才',''],
    ['pebble','n. 卵石；水晶透镜；vt. 用卵石铺',''],
    ['magnet','n. 磁铁； 磁体；磁石',''],
    ['ore','n. 矿；矿石',''],
    ['mineral','n. 矿物；（英）矿泉水；无机物；苏打水（常用复数表示）；adj. 矿物的；矿质的',''],
    ['marble','n. 大理石；大理石制品；弹珠；adj. 大理石的；冷酷无情的',''],
    ['quartz','n. 石英',''],
    ['granite','n. 花岗岩；坚毅；冷酷无情',''],
    ['gust','n. 风味；一阵狂风；趣味；vi. 一阵阵地劲吹',''],
    ['breeze','n. 微风；轻而易举的事；煤屑；焦炭渣；小风波；vi. 吹微风；逃走',''],
    ['monsoon','n. 季风；（印度等地的）雨季；季候风',''],
    ['gale','n.  大风，狂风；（突发的）一阵',''],
    ['hurricane','n. 飓风，暴风',''],
    ['tornado','n.  龙卷风；旋风；暴风；大雷雨',''],
    ['typhoon','n.  台风',''],
    ['volcano','n. 火山',''],
    ['erupt','vi. 爆发；喷出；发疹；长牙；vt. 爆发；喷出',''],
    ['magma','n.  岩浆；糊剂',''],
    ['thermodynamic','adj. 热力学的；使用热动力的',''],
    ['smog','n. 烟雾',''],
    ['fume','n. 烟；愤怒，烦恼；vt. 熏；冒烟；愤怒地说；vi. 冒烟；发怒',''],
    ['mist','n. 薄雾；视线模糊不清；模糊不清之物；vi. 下雾；变模糊；vt. 使模糊；使蒙上薄雾',''],
    ['tsunami','n. 海啸',''],
    ['drought','n. 干旱；缺乏',''],
    ['flooding','n. 泛滥；产后出血',''],
    ['torrent','n. 奔流；倾注；迸发；连续不断',''],
    ['earthquake','n. 地震；大动荡',''],
    ['seismic','adj. 地震的；因地震而引起的',''],
    ['avalanche','n. 雪崩；vt. 雪崩；vi. 崩塌',''],
    ['terrain','n.  地形，地势；领域；地带',''],
    ['landscape','n. 风景；风景画；景色；山水画；乡村风景画；地形；（文件的）横向打印格式；vt. 对…做景观美化，给…做园林美化；从事庭园设计；vi. 美化（环境等），使景色宜人；从事景观美化工作，做庭园设计师',''],
    ['continent','n. 大陆，洲，陆地；adj. 自制的，克制的',''],
    ['cave','n. 洞穴，窑洞；vi. 凹陷，塌落；投降；vt. 使凹陷，使塌落；在…挖洞穴',''],
    ['cliff','n. 悬崖；绝壁',''],
    ['glacier','n. 冰河，冰川',''],
    ['swamp','vt. 使陷于沼泽；使沉没；使陷入困境；n. 沼泽；湿地；vi. 下沉；陷入沼泽；陷入困境；不知所措（过去式swamped，过去分词swamped，现在分词swamping，第三人称单数swamps，名词swampiness，形容词swampy）',''],
    ['delta','n. （河流的）三角洲；德耳塔（希腊字母的第四个字）',''],
    ['plain','n. 平原；无格式；朴实无华的东西；adj. 平的；简单的；朴素的；清晰的；adv. 清楚地；平易地',''],
    ['plateau','n. 高原；n.   普拉托；n. （活动或进程中的）稳定阶段，停滞时期；adj. 高原印第安人的',''],
    ['oasis','n. 绿洲；舒适的地方；令人宽慰的事物',''],
    ['globe','n. 地球；地球仪；球体；vt. 使…成球形；vi. 成球状',''],
    ['hemisphere','n. 半球',''],
    ['equator','n. 赤道',''],
    ['arctic','n. 北极圈；御寒防水套鞋；adj. 北极的；极寒的',''],
    ['Antarctic','找不到解释',''],
    ['pole','找不到解释',''],
    ['polar','n. 极面；极线；adj. 极地的；两极的；正好相反的',''],
    ['axis','n. 轴；轴线；轴心国',''],
    ['deteriorate','vi. 恶化，变坏；vt. 恶化',''],
    ['aggravate','vt. 加重；使恶化；激怒',''],
    ['degrade','vt. 贬低；使……丢脸；使……降级；使……降解；vi. 降级，降低；退化',''],
    ['upgrade','n. 升级；上升；上坡；vt. 使升级；提升；改良品种；adj. 向上的；adv. 往上',''],
    ['erode','vt. 腐蚀，侵蚀；vi. 侵蚀；受腐蚀',''],
    ['Mediterranean','n. 地中海；adj. 地中海的',''],
    ['Atlantic','n. 大西洋；adj. 大西洋的',''],
    ['pacific','adj. 和平的；温和的；平静的；n. 太平洋；adj. 太平洋的',''],
    ['ocean','n. 海洋；大量；广阔',''],
    ['marine','adj. 船舶的；海生的；海产的；航海的，海运的；n. 海运业；舰队；水兵；（海军）士兵或军官',''],
    ['navigation','n. 航行；航海',''],
    ['gulf','n. 海湾；深渊；分歧；漩涡；vt. 吞没',''],
    ['beach','n. 海滩；湖滨；vt. 将…拖上岸；vi. 搁浅；定居',''],
    ['coast','n. 海岸；滑坡；vt. 沿…岸航行；vi. 滑行；沿岸航行',''],
    ['shore','n. 海滨；支柱；vt. 支撑，使稳住；用支柱撑住',''],
    ['tide','n. 趋势，潮流；潮汐；vt. 随潮漂流',''],
    ['current','n. （水，气，电）流；趋势；涌流；adj. 现在的；流通的，通用的；最近的；草写的',''],
    ['brook','n. 小溪；小河；vt. 忍受；容忍',''],
    ['stream','n. 溪流；流动；潮流；光线；vt. 流出；涌出；使飘动；vi. 流；涌进；飘扬',''],
    ['source','n. 来源；水源；原始资料',''],
    ['shallow','n.  浅滩；adj. 浅的；肤浅的；vt. 使变浅；vi. 变浅',''],
    ['superficial','adj. 表面的；肤浅的 ；表面文章的；外表的；（人）浅薄的',''],
    ['flat','n. 平地；公寓；平面；adj. 平的；单调的；不景气的；干脆的；平坦的；扁平的；浅的；vi. 逐渐变平；以降调唱（或奏）；vt. 使变平；使（音调）下降，尤指降半音；adv. （尤指贴着另一表面）平直地；断然地；水平地；直接地，完全地',''],
    ['smooth','n. 平滑部分；一块平地；adj. 顺利的；光滑的；平稳的；vt. 使光滑；消除（障碍等）；使优雅；缓和；adv. 光滑地；平稳地；流畅地；vi. 变平静；变平滑',''],
    ['rough','n. 艰苦；高低不平的地面；未经加工的材料；粗糙的部分；adj. 粗糙的；粗略的；粗野的；艰苦的；未经加工的；vt. 使粗糙；粗暴对待；草拟；adv. 粗糙地；粗略地；粗暴地；vi. 举止粗野',''],
    ['sandy','adj. 沙地的；多沙的；含沙的',''],
    ['stony','adj. 无情的；多石的；石头的',''],
    ['vertical','n. 垂直线，垂直面；adj. 垂直的，直立的； 头顶的，顶点的',''],
    ['steep','n. 峭壁；浸渍；adj. 陡峭的；不合理的；夸大的；急剧升降的；vt. 泡；浸；使…充满；vi. 泡；沉浸',''],
    ['parallel','n. 平行线；对比；adj. 平行的；类似的，相同的；vt. 使…与…平行',''],
    ['narrow','adj. 狭窄的，有限的；勉强的；精密的；度量小的；n. 海峡；狭窄部分，隘路；vt. 使变狭窄；vi. 变窄',''],
    ['Oceania','n. 大洋洲',''],
    ['mainland','n. 大陆；本土；adj. 大陆的；本土的',''],
    ['peninsula','n. 半岛',''],
    ['climate','n. 气候；风气；思潮；风土',''],
    ['weather','n. 天气；气象；气候；处境；vt. 经受住；使风化；侵蚀；使受风吹雨打；adj. 露天的；迎风的；vi. 风化；受侵蚀；经受风雨',''],
    ['meteorology','n. 气象状态，气象学',''],
    ['mild','adj. 温和的；轻微的；淡味的；文雅的；不含有害物质的的；n. （英国的一种）淡味麦芽啤酒',''],
    ['heating','n.  加热； 供暖；暖气设备；v.  加热（heat的现在分词）；adj. 加热的；供热的',''],
    ['moderate','adj. 稳健的，温和的；适度的，中等的；有节制的；vi. 变缓和，变弱；vt. 节制；减轻',''],
    ['warm','n. 取暖；加热；adj. 温暖的；热情的；vt. 使…兴奋；使…温暖；使…感兴趣；vi. 同情；激动；变温暖',''],
    ['thermal','n. 上升的热气流；adj. 热的；热量的；保热的',''],
    ['tropics','n. 热带地区',''],
    ['arid','adj. 干旱的；不毛的， 荒芜的',''],
    ['moist','adj. 潮湿的；多雨的；含泪的；n. 潮湿',''],
    ['damp','n. 潮湿，湿气；adj. 潮湿的；vt. 使潮湿；使阻尼；使沮丧，抑制；vi. 减幅，阻尼；变潮湿',''],
    ['humid','adj. 潮湿的；湿润的；多湿气的',''],
    ['snowy','adj. 下雪的，多雪的；被雪覆盖的；洁白无瑕的',''],
    ['frost','n. 霜；冰冻，严寒；冷淡；vi. 结霜；受冻；vt. 结霜于；冻坏',''],
    ['hail','n. 冰雹；致敬；招呼；一阵；vt. 致敬；招呼；向...欢呼；猛发；使像下雹样落下（过去式hailed，过去分词hailed，现在分词hailing，第三人称单数hails）；int. 万岁；欢迎；vi. 招呼；下雹',''],
    ['thaw','n. 解冻；融雪；vt. 使融解；使变得不拘束；vi. 融解；变暖和',''],
    ['chill','n. 寒冷；寒意；寒心；vt. 冷冻，冷藏；使寒心；使感到冷；adj. 寒冷的；冷漠的；扫兴的；vi. 冷藏；变冷',''],
    ['freeze','n. 冻结；凝固；vt. 使…冻住；使…结冰；vi. 冻结；冷冻；僵硬',''],
    ['frigid','adj. 寒冷的，严寒的；冷淡的',''],
    ['tremble','n. 颤抖；战栗；摇晃；vi. 发抖；战栗；焦虑；摇晃；vt. 使挥动；用颤抖的声音说出',''],
    ['shiver','n. 颤抖，战栗；碎片；vi. 颤抖；哆嗦；打碎；vt. 颤抖；打碎',''],
    ['thunder','n. 雷；轰隆声；恐吓；vt. 轰隆地发出；大声喊出；vi. 打雷；怒喝',''],
    ['lightning','adj. 闪电的；快速的；n. 闪电；vi. 闪电',''],
    ['stormy','adj. 暴风雨的；猛烈的；暴躁的',''],
    ['downpour','n. 倾盆大雨；注下',''],
    ['rainfall','n. 降雨；降雨量',''],
    ['sprinkle','n. 撒，洒；少量；vt. 洒；微雨；散置；vi. 洒，撒；下稀疏小雨；喷撒',''],
    ['rainbow','n. 彩虹；五彩缤纷的排列；幻想；adj. 五彩缤纷的；彩虹状的；vt. 使呈彩虹状；如彩虹般装饰；vi. 呈彩虹状',''],
    ['shower','n. 淋浴；（倾泻般出现的）一阵，一大批；阵雨；vt. 大量地给予；把……弄湿；vi. 淋浴；下阵雨',''],
    ['Celsius','找不到解释',''],
    ['temperature','n. 温度；体温；气温；发烧',''],
    ['forecast','n. 预测，预报；预想；vt. 预报，预测；预示；vi. 进行预报，作预测',''],
    ['peak','n. 山峰；最高点；顶点；帽舌；adj. 最高的；最大值的；vt. 使达到最高点；使竖起；vi. 消瘦；到达最高点；变憔悴',''],
    ['mount','vt. 增加；爬上；使骑上马；安装，架置；镶嵌，嵌入；准备上演；成立（军队等）；vi. 爬；增加；上升；n. 山峰；底座；乘骑用马；攀，登；运载工具；底座；v. 登上；骑上',''],
    ['mountain','n. 山；山脉',''],
    ['range','n. 范围；幅度；排；山脉；vt. 漫游；放牧；使并列；归类于；来回走动；vi. （在...内）变动；平行，列为一行；延伸；漫游；射程达到',''],
    ['ridge','n. 山脊；山脉；屋脊；vt. 使成脊状；作垄；vi. 成脊状',''],
    ['slope','n. 斜坡；倾斜；斜率；扛枪姿势；vt. 倾斜；使倾斜；扛；vi. 倾斜；逃走',''],
    ['valley','n. 山谷；流域；溪谷',''],
    ['hillside','n. 山坡，山腹；山腰',''],
    ['overlook','vt. 忽略；俯瞰；远眺；检查；高耸于…之上；n. 忽视；眺望',''],
    ['southern','n. 南方人；adj. 南的；南方的',''],
    ['southeast','n. 东南；东南地区；adj. 东南的；来自东南的；adv. 来自东南',''],
    ['southwest','n. 西南方；adj. 西南的；adv. 往西南；来自西南',''],
    ['northeast','adj. 东北的；向东北的；来自东北的；n. 东北；adv. 向东北；来自东北',''],
    ['northwest','adj. 西北的；向西北的；来自西北的；n. 西北；adv. 在西北；向西北；来自西北',''],
    ['eastern','n. 东方人；（美国）东部地区的人；adj. 东方的；朝东的；东洋的',''],
    ['oriental','adj. 东方的；东方人的；n. 东方人',''],
    ['inevitable','adj. 必然的，不可避免的',''],
    ['irreversible','adj. 不可逆的；不能取消的；不能翻转的',''],
    ['irregularly','adv. 不规则地；不整齐地',''],
    ['inappropriate','adj. 不适当的；不相称的',''],
    ['abnormal','adj. 反常的，不规则的；变态的',''],
    ['sediment','n. 沉积；沉淀物',''],
    ['silt','n. 淤泥，泥沙；煤粉；残渣；vt. 使淤塞；充塞；vi. 淤塞，充塞；为淤泥堵塞',''],
    ['muddy','adj. 泥泞的；模糊的；混乱的；vt. 使污浊；使沾上泥；把…弄糊涂；vi. 变得泥泞；沾满烂泥',''],
    ['clay','n.  粘土；泥土；肉体；似黏土的东西；vt. 用黏土处理',''],
    ['dirt','n. 污垢，泥土；灰尘，尘土；下流话',''],
    ['rural','adj. 农村的，乡下的；田园的，有乡村风味的',''],
    ['suburb','n. 郊区；边缘',''],
    ['outskirts','n. 市郊，郊区',''],
    ['remote','n. 远程；adj. 遥远的；偏僻的；疏远的',''],
    ['desolate','adj. 荒凉的；无人烟的；vt. 使荒凉；使孤寂',''],
    ['distant','adj. 遥远的；冷漠的；远隔的；不友好的，冷淡的',''],
    ['adjacent','adj. 邻近的，毗连的',''],
    ['toxic','adj. 有毒的；中毒的',''],
    ['pollution','n. 污染；污染物',''],
    ['pollutant','n. 污染物',''],
    ['contaminate','vt. 污染，弄脏',''],
    ['geology','n. 地质学；地质情况',''],
    ['border','n. 边境；边界；国界；vt. 接近；与…接壤；在…上镶边；vi. 接界；近似',''],
    ['margin','n. 边缘；利润，余裕；页边的空白；vt. 加边于；加旁注于',''],
    ['fringe','n. 边缘；穗；刘海；adj. 边缘的；附加的；vt. 加穗于',''],
    ['plate','n. 碟；金属板；金属牌；感光底片；vt. 电镀；给…装甲',''],
    ['debris','n. 碎片，残骸',''],
    ['crack','n. 裂缝；声变；噼啪声；adj. 最好的；高明的；vi. 破裂；爆裂；vt. 使破裂；打开；变声',''],
    ['gap','n. 间隙；缺口；差距；分歧；vt. 使形成缺口；vi. 裂开',''],
    ['splendid','adj. 辉煌的；灿烂的；极好的；杰出的',''],
    ['grand','n. 大钢琴；一千美元；adj. 宏伟的；豪华的；极重要的',''],
    ['magnificent','adj. 高尚的；壮丽的；华丽的；宏伟的',''],
    ['super','n. 特级品，特大号；临时雇员；adj. 特级的；极好的',''],
    ['interesting','adj. 有趣的；引起兴趣的，令人关注的',''],
    ['dramatic','adj. 戏剧的；急剧的；引人注目的；激动人心的',''],
    ['wilderness','n. 荒地；大量，茫茫一片',''],
    ['desert','n. 沙漠；荒原；应得的赏罚；vt. 遗弃；放弃；逃跑；adj. 沙漠的；荒凉的；不毛的；vi. 遗弃；开小差；逃掉',''],
    ['deforest','vt. 采伐森林；清除…上的树林',''],
    ['barren','n. 荒地；adj. 贫瘠的；不生育的；无益的；沉闷无趣的；空洞的',''],
    ['fertile','adj. 富饶的，肥沃的；能生育的',''],
    ['fertilise','vt. 使受精；施肥于；使肥沃',''],
    ['solar','n. 日光浴室；adj. 太阳的；日光的；利用太阳光的；与太阳相关的',''],
    ['lunar','adj. 月亮的，月球的；阴历的；银的；微亮的',''],
    ['calendar','n. 日历； 历法；日程表；vt. 将…列入表中；将…排入日程表',''],
    ['sunrise','n. 日出；黎明',''],
    ['sunset','n. 日落，傍晚','']
  ],
  ky: [
    ['a','n. 字母A；第一流的；学业成绩达最高标准的评价符号 abbr. 安（ampere）',''],
    ['an','art. 一（在元音音素前）',''],
    ['abandon','n. 放任；狂热 vt. 遗弃；放弃',''],
    ['abdomen','n. 腹部；下腹；腹腔',''],
    ['abide','vi. 持续；忍受；停留 vt. 忍受，容忍；停留；遵守',''],
    ['ability','n. 能力，能耐；才能',''],
    ['able','adj. 能； 有能力的；能干的',''],
    ['abnormal','adj. 反常的，不规则的；变态的',''],
    ['aboard','prep. 在…上 adv. 在飞机上； 在船上；在火车上',''],
    ['abolish','vt. 废除，废止；取消，革除',''],
    ['abound','vi. 富于；充满',''],
    ['about','prep. 关于；大约 n. 大致；粗枝大叶；不拘小节的人 adj. 在附近的；四处走动的；在起作用的 adv. 大约；周围；到处',''],
    ['above','prep. 超过；在……上面；在……之上 n. 上文 adj. 上文的 adv. 在上面；在上文',''],
    ['abroad','n. 海外；异国 adj. 往国外的 adv. 在国外；到海外',''],
    ['abrupt','adj. 生硬的；突然的；唐突的；陡峭的',''],
    ['absence','n. 没有；缺乏；缺席；不注意',''],
    ['absent','adj. 缺席的；缺少的；心不在焉的；茫然的 vt. 使缺席',''],
    ['absolute','n. 绝对；绝对事物 adj. 绝对的；完全的；专制的',''],
    ['absorb','vt. 吸收；吸引；承受；理解；使…全神贯注',''],
    ['abstract','n. 摘要；抽象；抽象的概念 adj. 抽象的；深奥的 vt. 摘要；提取；使……抽象化；转移(注意力、兴趣等)；使心不在焉 vi. 做摘要；写梗概',''],
    ['absurd','n. 荒诞；荒诞作品 adj. 荒谬的；可笑的',''],
    ['abundant','adj. 丰富的；充裕的；盛产',''],
    ['abuse','n. 滥用；虐待；辱骂；弊端；恶习，陋习 vt. 滥用；虐待；辱骂',''],
    ['academic','n. 大学生，大学教师；学者 adj. 学术的；理论的；学院的',''],
    ['academy','n. 学院；研究院；学会；专科院校',''],
    ['accelerate','vt. 使……加快；使……增速 vi. 加速；促进；增加',''],
    ['accent','n. 口音；重音；强调；特点；重音符号 vt. 强调；重读；带…口音讲话',''],
    ['accept','vi. 承认；同意；承兑 vt. 接受；承认；承担；承兑；容纳',''],
    ['acceptance','n. 接纳；赞同；容忍',''],
    ['access','n. 进入；使用权；通路 vt. 使用；存取；接近',''],
    ['accessory','n. 配件；附件； 从犯 adj. 副的；同谋的；附属的',''],
    ['accident','n. 事故；意外； 意外事件；机遇',''],
    ['acclaim','n. 欢呼，喝彩；称赞 vt. 称赞；为…喝彩，向…欢呼 vi. 欢呼，喝彩',''],
    ['accommodate','vi. 适应；调解 vt. 容纳；使适应；供应；调解',''],
    ['accommodation','n. 住处，膳宿；调节；和解；预订铺位',''],
    ['accommodations','n. 住房，住宿；膳宿；居住设施（accommodation的复数）',''],
    ['accompany','vt. 陪伴，伴随；伴奏 vi. 伴奏，伴唱',''],
    ['accomplish','vt. 完成；实现；达到',''],
    ['accord','n. 符合；一致；协议；自愿 vt. 使一致；给予 vi. 符合；一致',''],
    ['accordance','n. 一致；和谐',''],
    ['according to','prep. 根据；按照；据（…所说）；按（…所报道） 依照；根据…所说；依据',''],
    ['accordingly','adv. 因此，于是；相应地；照著',''],
    ['account','n. 账户；解释；账目，账单；理由；描述 vt. 认为；把…视为 vi. 解释；导致；报账',''],
    ['accountant','n. 会计师；会计人员',''],
    ['accumulate','vt. 积攒 vi. 累积；积聚',''],
    ['accuracy','n. 精确度，准确性',''],
    ['accurate','adj. 精确的',''],
    ['accuse','vt. 控告，指控；谴责；归咎于 vi. 指责；控告',''],
    ['accustom','vt. 使习惯于',''],
    ['ache','n. 疼痛 vi. 疼痛；渴望',''],
    ['achieve','vt. 取得；获得；实现；成功 vi. 达到预期的目的，实现预期的结果，如愿以偿',''],
    ['acid','n. 酸；<俚>迷幻药 adj. 酸的；讽刺的；刻薄的',''],
    ['acknowledge','vt. 承认；答谢；报偿；告知已收到',''],
    ['acquaint','vt. 使熟悉；使认识',''],
    ['acquaintance','n. 熟人；相识；了解；知道',''],
    ['acquire','vt. 获得；取得；学到；捕获',''],
    ['acquisition','n. 获得物，获得；收购',''],
    ['acre','n. 土地，地产；英亩',''],
    ['acrobat','n. 杂技演员，特技演员；随机应变者；翻云覆雨者，善变者',''],
    ['across','prep. 穿过；横穿 adv. 横过；在对面',''],
    ['act','n. 行为，行动；法令，法案；（戏剧，歌剧的）一幕，段；装腔作势 vt. 扮演；装作，举动像 vi. 行动；扮演，充当；表现，举止；假装，演戏；起作用，见效',''],
    ['action','n. 行动；活动；功能；战斗；情节',''],
    ['activate','vt. 刺激；使活动；使活泼；使产生放射性 vi. 激活；有活力',''],
    ['active','n. 主动语态；积极分子 adj. 积极的；活跃的；主动的；有效的；现役的',''],
    ['activity','n. 活动；行动；活跃',''],
    ['actor','n. 男演员；行动者；作用物',''],
    ['actress','n. 女演员',''],
    ['actual','adj. 真实的，实际的；现行的，目前的',''],
    ['acute','adj. 严重的， 急性的；敏锐的；激烈的；尖声的',''],
    ['adapt','vi. 适应 vt. 使适应；改编',''],
    ['add','n. 加法，加法运算 vi. 加；增加；加起来；做加法 vt. 增加，添加；补充说；计算…总和',''],
    ['addict','n. 有瘾的人；入迷的人 vt. 使沉溺；使上瘾',''],
    ['addition','n. 添加； 加法；增加物',''],
    ['additional','adj. 附加的，额外的',''],
    ['address','n. 地址；演讲；致辞；说话的技巧；称呼 vt. 演说；从事；忙于；写姓名地址；向…致辞；与…说话；提出；处理',''],
    ['adequate','adj. 充足的；适当的；胜任的',''],
    ['adhere','vi. 坚持；依附；粘着；追随 vt. 使粘附',''],
    ['adjacent','adj. 邻近的，毗连的',''],
    ['adjective','n. 形容词 adj. 形容词的；从属的',''],
    ['adjoin','vt. 毗连，邻接 vi. 毗连，邻接',''],
    ['adjust','vt. 调整，使…适合；校准 vi. 调整，校准；适应',''],
    ['administer','vt. 管理；执行；给予 vi. 给予帮助；执行遗产管理人的职责；担当管理人',''],
    ['administration','n. 管理；行政；实施；行政机构',''],
    ['admire','vt. 钦佩；赞美 vi. 钦佩；称赞',''],
    ['admission','n. 承认；入场费；进入许可；坦白；录用',''],
    ['admit','vi. 承认；容许 vt. 承认；准许进入；可容纳',''],
    ['adolescent','n. 青少年 adj. 青春期的；未成熟的',''],
    ['adopt','vi. 采取；过继 vt. 采取；接受；收养；正式通过',''],
    ['adore','vt. 崇拜；爱慕；喜爱；极喜欢 vi. 崇拜；爱慕',''],
    ['adult','n. 成年人 adj. 成年的；成熟的',''],
    ['advance','n. 发展；前进；增长；预付款 adj. 预先的；先行的 vt. 提出；预付；使……前进；将……提前 vi. 前进；进展；上涨',''],
    ['advanced','adj. 先进的；高级的；晚期的；年老的 v. 前进；增加；上涨（advance的过去式和过去分词形式）',''],
    ['advantage','n. 优势；利益；有利条件 vt. 有利于；使处于优势 vi. 获利',''],
    ['advent','n. 到来；出现；基督降临；基督降临节',''],
    ['adventure','n. 冒险；冒险精神；投机活动 vt. 冒险；大胆说出 vi. 冒险',''],
    ['adverb','n. 副词 adj. 副词的',''],
    ['adverse','adj. 不利的；相反的；敌对的（名词adverseness，副词adversely）',''],
    ['advertise','vt. 通知；为…做广告；使突出 vi. 做广告，登广告；作宣传',''],
    ['advice','n. 建议；忠告；劝告；通知',''],
    ['advisable','adj. 明智的，可取的，适当的',''],
    ['advise','vt. 建议；劝告，忠告；通知；警告 vi. 建议；与…商量',''],
    ['advocate','n. 提倡者；支持者；律师 vt. 提倡，主张，拥护',''],
    ['aerial','n. 天线 adj. 空中的，航空的；空气的；空想的',''],
    ['aeroplane','n. 飞机（等于airplane）',''],
    ['airplane','n. 飞机',''],
    ['aesthetic','adj. 美的；美学的；审美的，具有审美趣味的',''],
    ['esthetic','n. 美学；审美家；唯美主义者 adj. 审美的（等于aesthetic）；感觉的',''],
    ['affair','n. 事情；事务；私事；（尤指关系不长久的）风流韵事',''],
    ['affect','n. 情感；引起感情的因素 vt. 影响；感染；感动；假装 vi. 倾向；喜欢',''],
    ['affection','n. 喜爱，感情；影响；感染',''],
    ['affiliate','n. 联号；隶属的机构等 vt. 使附属；接纳；使紧密联系 vi. 参加，加入；发生联系',''],
    ['affirm','vt. 肯定；断言 vi. 确认；断言',''],
    ['affluent','n. 支流；富人 adj. 富裕的；丰富的；流畅的',''],
    ['afford','vt. 给予，提供；买得起',''],
    ['afraid','adj. 害怕的；恐怕；担心的',''],
    ['after','conj. 在……之后 prep. 在……之后 adj. 以后的 adv. 后来，以后',''],
    ['afternoon','n. 午后，下午',''],
    ['afterward','adv. 以后，后来',''],
    ['afterwards','adv. 后来；然后',''],
    ['again','adv. 又，此外；再一次；再说；增加 n. （英、保）阿盖恩',''],
    ['against','prep. 反对，违反；靠；倚；防备 adj. 不利的；对立的',''],
    ['age','n. 年龄；时代；寿命，使用年限；阶段 vt. 使成熟；使变老，使上年纪 vi. 成熟；变老',''],
    ['agency','n. 代理，中介；代理处，经销处',''],
    ['agenda','n. 议程；日常工作事项；日程表',''],
    ['agent','n. 代理人，代理商；药剂；特工 adj. 代理的 vt. 由…作中介；由…代理',''],
    ['aggravate','vt. 加重；使恶化；激怒',''],
    ['aggressive','adj. 侵略性的；好斗的；有进取心的；有闯劲的',''],
    ['agitate','vt. 摇动；骚动；使…激动 vi. 煽动',''],
    ['ago','adj. 以前的；过去的 adv. 以前，以往',''],
    ['agony','n. 苦恼；极大的痛苦；临死的挣扎',''],
    ['agree','vi. vi. 同意，意见一致；约定，商定 vt. 同意，赞成；承认；约定，商定',''],
    ['agreeable','adj. 令人愉快的；适合的；和蔼可亲的',''],
    ['agriculture','n. 农业；农耕；农业生产；农艺，农学',''],
    ['ahead','adj. 向前；在前的；领先 adv. 向前地；领先地；在（某人或某事物的）前面；预先；在将来，为未来',''],
    ['aid','n. 援助；帮助；助手；帮助者 vt. 援助；帮助；有助于 vi. 帮助',''],
    ['aim','n. 目的；目标；对准 vt. 目的在于；引导；把…对准 vi. 打算；对准目标；瞄准',''],
    ['air','n. 空气，大气；天空；样子；曲调 vt. 使通风，晾干；夸耀 vi. 通风',''],
    ['air-conditioning','n. 空调系统；空气调节',''],
    ['aircraft','n. 飞机，航空器',''],
    ['airline','n. 航空公司；航线 adj. 航线的',''],
    ['airport','n. 机场；航空站',''],
    ['aisle','n. 通道，走道；侧廊',''],
    ['alarm','n. 闹钟；警报，警告器；惊慌 vt. 警告；使惊恐',''],
    ['album','n. 相簿；唱片集；集邮簿；签名纪念册',''],
    ['alcohol','n. 酒精，乙醇',''],
    ['alert','n. 警戒，警惕；警报 adj. 警惕的，警觉的；留心的 vt. 警告；使警觉，使意识到',''],
    ['alien','n. 外国人，外侨；外星人 adj. 外国的；相异的，性质不同的；不相容的 vt. 让渡，转让',''],
    ['alienate','vt. 使疏远，离间；让与',''],
    ['alike','adj. 相似的；相同的 adv. 以同样的方式；类似于',''],
    ['alive','adj. 活着的；活泼的；有生气的',''],
    ['all','n. 全部 adj. 全部的 adv. 全然地；越发 pron. 全部',''],
    ['allege','vt. 宣称，断言；提出…作为理由',''],
    ['allegiance','n. 效忠，忠诚；忠贞',''],
    ['alleviate','vt. 减轻，缓和',''],
    ['alliance','n. 联盟，联合；联姻',''],
    ['allocate','vt. 分配；拨出；使坐落于 vi. 分配；指定',''],
    ['allow','vi. 容许；考虑 vt. 允许；给予；认可',''],
    ['allowance','n. 津贴，零用钱；允许；限额 vt. 定量供应',''],
    ['alloy','n. 合金 vt. 使成合金；使减低成色 vi. 易于铸成合金',''],
    ['ally','n. 同盟国；伙伴；同盟者；助手 vt. 使联盟；使联合 vi. 联合；结盟',''],
    ['almost','adv. 差不多，几乎',''],
    ['alone','adj. 独自的；单独的；孤独的 adv. 独自地；单独地',''],
    ['along','prep. 沿着；顺着 adv. 一起；向前；来到',''],
    ['alongside','prep. 在……旁边 adv. 在旁边',''],
    ['aloud','adv. 大声地；出声地',''],
    ['alphabet','n. 字母表，字母系统；入门，初步 n. Google创建的名为Alphabet的公司，改变Google原有公司架构，旨在使其当下主要业务和长期投资项目间的区别更加清晰。',''],
    ['already','adv. 已经，早已；先前',''],
    ['also','conj. 并且；另外 adv. 也；而且；同样',''],
    ['alter','vt. 改变，更改 vi. 改变；修改',''],
    ['alternate','n. 替换物 adj. 交替的；轮流的 vt. 使交替；使轮流 vi. 交替；轮流',''],
    ['alternative','n. 二中择一；供替代的选择 adj. 供选择的；选择性的；交替的',''],
    ['although','conj. 尽管；虽然；但是；然而',''],
    ['altitude','n. 高地；高度； 顶垂线；（等级和地位等的）高级；海拔',''],
    ['altogether','n. 整个；裸体 adv. 完全地；总共；总而言之',''],
    ['aluminum','n. 铝',''],
    ['aluminium','n. 铝 adj. 铝的',''],
    ['always','adv. 永远，一直；总是；常常',''],
    ['amateur','n. 爱好者；业余爱好者；外行 adj. 业余的；外行的',''],
    ['amaze','vt. 使吃惊',''],
    ['ambassador','n. 大使；代表；使节',''],
    ['ambiguous','adj. 模糊不清的；引起歧义的',''],
    ['ambition','n. 野心，雄心；抱负，志向 vt. 追求；有…野心',''],
    ['ambitious','adj. 野心勃勃的；有雄心的；热望的；炫耀的',''],
    ['ambulance','n. 救护车；战时流动医院',''],
    ['amend','vt. 修改；改善，改进 vi. 改正，改善；改过自新',''],
    ['amiable','adj. 和蔼可亲的，亲切的',''],
    ['amid','prep. 在其中，在其间',''],
    ['among','prep. 在…中间；在…之中',''],
    ['amongst','prep. 在…之中；在…当中（等于among）',''],
    ['amount','n. 数量；总额，总数 vi. 总计，合计；相当于；共计；产生…结果',''],
    ['ample','adj. 丰富的；足够的；宽敞的',''],
    ['amplifier','n. 放大器，扩大器；扩音器',''],
    ['amplify','vt. 放大，扩大；增强；详述 vi. 详述',''],
    ['amuse','vt. 娱乐；消遣；使发笑；使愉快',''],
    ['analog','n. 模拟；类似物 adj. 模拟的；有长短针的',''],
    ['analogue','n. 类似物；类似情况；对等的人 adj. 类似的；相似物的；模拟计算机的',''],
    ['analogy','n. 类比；类推；类似',''],
    ['analysis','n. 分析；分解；验定',''],
    ['analytic','adj. 分析的；解析的；善于分析的',''],
    ['analytical','adj. 分析的；解析的；善于分析的','']
  ],
  zsb: [
    ['abandon','n. 放任；狂热；vt. 遗弃；放弃',''],
    ['ability','n. 能力，能耐；才能',''],
    ['able','adj. 能； 有能力的；能干的',''],
    ['aboard','prep. 在…上；adv. 在飞机上； 在船上；在火车上',''],
    ['about','prep. 关于；大约；n. 大致；粗枝大叶；不拘小节的人；adj. 在附近的；四处走动的；在起作用的；adv. 大约；周围；到处',''],
    ['above','prep. 超过；在……上面；在……之上；n. 上文；adj. 上文的；adv. 在上面；在上文',''],
    ['abroad','n. 海外；异国；adj. 往国外的；adv. 在国外；到海外',''],
    ['absent','adj. 缺席的；缺少的；心不在焉的；茫然的；vt. 使缺席',''],
    ['absolute','n. 绝对；绝对事物；adj. 绝对的；完全的；专制的',''],
    ['absorb','vt. 吸收；吸引；承受；理解；使…全神贯注',''],
    ['abstract','n. 摘要；抽象；抽象的概念；adj. 抽象的；深奥的；vt. 摘要；提取；使……抽象化；转移(注意力、兴趣等)；使心不在焉；vi. 做摘要；写梗概',''],
    ['abundant','adj. 丰富的；充裕的；盛产',''],
    ['accent','n. 口音；重音；强调；特点；重音符号；vt. 强调；重读；带…口音讲话',''],
    ['accept','vi. 承认；同意；承兑；vt. 接受；承认；承担；承兑；容纳',''],
    ['access','n. 进入；使用权；通路；vt. 使用；存取；接近',''],
    ['accident','n. 事故；意外； 意外事件；机遇',''],
    ['accommodation','n. 住处，膳宿；调节；和解；预订铺位',''],
    ['accompany','vt. 陪伴，伴随；伴奏；vi. 伴奏，伴唱',''],
    ['accomplish','vt. 完成；实现；达到',''],
    ['according','adj. 相符的；一致的；相应的；和谐的；调和的；adv. 依照；根据；按照；v. 给予( accord的现在分词 )；使和谐一致；使符合；使适合',''],
    ['account','n. 账户；解释；账目，账单；理由；描述；vt. 认为；把…视为；vi. 解释；导致；报账',''],
    ['accumulate','vt. 积攒；vi. 累积；积聚',''],
    ['accurate','adj. 精确的',''],
    ['accuse','vt. 控告，指控；谴责；归咎于；vi. 指责；控告',''],
    ['accustomed','v. 使习惯于（accustom的过去分词）；adj. 习惯的；通常的；独有的',''],
    ['ache','n. 疼痛；vi. 疼痛；渴望',''],
    ['achieve','vt. 取得；获得；实现；成功；vi. 达到预期的目的，实现预期的结果，如愿以偿',''],
    ['acknowledge','vt. 承认；答谢；报偿；告知已收到',''],
    ['acquire','vt. 获得；取得；学到；捕获',''],
    ['across','prep. 穿过；横穿；adv. 横过；在对面',''],
    ['act','n. 行为，行动；法令，法案；（戏剧，歌剧的）一幕，段；装腔作势；vt. 扮演；装作，举动像；vi. 行动；扮演，充当；表现，举止；假装，演戏；起作用，见效',''],
    ['actual','adj. 真实的，实际的；现行的，目前的',''],
    ['adapt','vi. 适应；vt. 使适应；改编',''],
    ['add','n. 加法，加法运算；vi. 加；增加；加起来；做加法；vt. 增加，添加；补充说；计算…总和',''],
    ['addition','n. 添加； 加法；增加物',''],
    ['additional','adj. 附加的，额外的',''],
    ['address','n. 地址；演讲；致辞；说话的技巧；称呼；vt. 演说；从事；忙于；写姓名地址；向…致辞；与…说话；提出；处理',''],
    ['adequate','adj. 充足的；适当的；胜任的',''],
    ['adjective','n. 形容词；adj. 形容词的；从属的',''],
    ['adjust','vt. 调整，使…适合；校准；vi. 调整，校准；适应',''],
    ['administration','n. 管理；行政；实施；行政机构',''],
    ['admire','vt. 钦佩；赞美；vi. 钦佩；称赞',''],
    ['admission','n. 承认；入场费；进入许可；坦白；录用',''],
    ['admit','vi. 承认；容许；vt. 承认；准许进入；可容纳',''],
    ['adopt','vi. 采取；过继；vt. 采取；接受；收养；正式通过',''],
    ['adult','n. 成年人；adj. 成年的；成熟的',''],
    ['advance','n. 发展；前进；增长；预付款；adj. 预先的；先行的；vt. 提出；预付；使……前进；将……提前；vi. 前进；进展；上涨',''],
    ['advanced','adj. 先进的；高级的；晚期的；年老的；v. 前进；增加；上涨（advance的过去式和过去分词形式）',''],
    ['advantage','n. 优势；利益；有利条件；vt. 有利于；使处于优势；vi. 获利',''],
    ['adventure','n. 冒险；冒险精神；投机活动；vt. 冒险；大胆说出；vi. 冒险',''],
    ['adverb','n. 副词；adj. 副词的',''],
    ['advertise','vt. 通知；为…做广告；使突出；vi. 做广告，登广告；作宣传',''],
    ['advice','n. 建议；忠告；劝告；通知',''],
    ['advise','vt. 建议；劝告，忠告；通知；警告；vi. 建议；与…商量',''],
    ['affair','n. 事情；事务；私事；（尤指关系不长久的）风流韵事',''],
    ['affect','n. 情感；引起感情的因素；vt. 影响；感染；感动；假装；vi. 倾向；喜欢',''],
    ['afford','vt. 给予，提供；买得起',''],
    ['afraid','adj. 害怕的；恐怕；担心的',''],
    ['Africa','n. 非洲',''],
    ['African','n. 非洲人；adj. 非洲的，非洲人的',''],
    ['after','conj. 在……之后；prep. 在……之后；adj. 以后的；adv. 后来，以后',''],
    ['afternoon','n. 午后，下午',''],
    ['afterward','adv. 以后，后来',''],
    ['again','adv. 又，此外；再一次；再说；增加；n. （英、保）阿盖恩',''],
    ['against','prep. 反对，违反；靠；倚；防备；adj. 不利的；对立的',''],
    ['age','n. 年龄；时代；寿命，使用年限；阶段；vt. 使成熟；使变老，使上年纪；vi. 成熟；变老',''],
    ['agency','n. 代理，中介；代理处，经销处',''],
    ['agenda','n. 议程；日常工作事项；日程表',''],
    ['agent','n. 代理人，代理商；药剂；特工；adj. 代理的；vt. 由…作中介；由…代理',''],
    ['ago','adj. 以前的；过去的；adv. 以前，以往',''],
    ['agree','vi. vi. 同意，意见一致；约定，商定；vt. 同意，赞成；承认；约定，商定',''],
    ['agriculture','n. 农业；农耕；农业生产；农艺，农学',''],
    ['ahead','adj. 向前；在前的；领先；adv. 向前地；领先地；在（某人或某事物的）前面；预先；在将来，为未来',''],
    ['aid','n. 援助；帮助；助手；帮助者；vt. 援助；帮助；有助于；vi. 帮助',''],
    ['aim','n. 目的；目标；对准；vt. 目的在于；引导；把…对准；vi. 打算；对准目标；瞄准',''],
    ['air','n. 空气，大气；天空；样子；曲调；vt. 使通风，晾干；夸耀；vi. 通风',''],
    ['aircraft','n. 飞机，航空器',''],
    ['airline','n. 航空公司；航线；adj. 航线的',''],
    ['airport','n. 机场；航空站',''],
    ['alarm','n. 闹钟；警报，警告器；惊慌；vt. 警告；使惊恐',''],
    ['alike','adj. 相似的；相同的；adv. 以同样的方式；类似于',''],
    ['alive','adj. 活着的；活泼的；有生气的',''],
    ['all','n. 全部；adj. 全部的；adv. 全然地；越发；pron. 全部',''],
    ['allow','vi. 容许；考虑；vt. 允许；给予；认可',''],
    ['almost','adv. 差不多，几乎',''],
    ['alone','adj. 独自的；单独的；孤独的；adv. 独自地；单独地',''],
    ['along','prep. 沿着；顺着；adv. 一起；向前；来到',''],
    ['alphabet','n. 字母表，字母系统；入门，初步；n. Google创建的名为Alphabet的公司，改变Google原有公司架构，旨在使其当下主要业务和长期投资项目间的区别更加清晰。',''],
    ['already','adv. 已经，早已；先前',''],
    ['also','conj. 并且；另外；adv. 也；而且；同样',''],
    ['alter','vt. 改变，更改；vi. 改变；修改',''],
    ['alternative','n. 二中择一；供替代的选择；adj. 供选择的；选择性的；交替的',''],
    ['although','conj. 尽管；虽然；但是；然而',''],
    ['altitude','n. 高地；高度； 顶垂线；（等级和地位等的）高级；海拔',''],
    ['altogether','n. 整个；裸体；adv. 完全地；总共；总而言之',''],
    ['always','adv. 永远，一直；总是；常常',''],
    ['amaze','vt. 使吃惊',''],
    ['ambassador','n. 大使；代表；使节',''],
    ['ambition','n. 野心，雄心；抱负，志向；vt. 追求；有…野心',''],
    ['ambitious','adj. 野心勃勃的；有雄心的；热望的；炫耀的',''],
    ['amend','vt. 修改；改善，改进；vi. 改正，改善；改过自新',''],
    ['America','n. 美洲（包括北美和南美洲）；美国',''],
    ['American','n. 美国人，美洲人；美国英语；adj. 美国的，美洲的；地道美国式的',''],
    ['among','prep. 在…中间；在…之中',''],
    ['amount','n. 数量；总额，总数；vi. 总计，合计；相当于；共计；产生…结果',''],
    ['amuse','vt. 娱乐；消遣；使发笑；使愉快',''],
    ['analysis','n. 分析；分解；验定',''],
    ['analyze','vt. 对…进行分析，分解（等于analyse）',''],
    ['analyse','vt. 分析；分解；细察',''],
    ['ancestor','n. 始祖，祖先；被继承人',''],
    ['ancient','n. 古代人；老人；adj. 古代的；古老的，过时的；年老的',''],
    ['and','conj. 和，与；就；而且；但是；然后',''],
    ['anger','n. 怒，愤怒；忿怒；vt. 使发怒，激怒；恼火；vi. 发怒；恼火',''],
    ['angry','adj. 生气的；愤怒的；狂暴的；（伤口等）发炎的',''],
    ['animal','n. 动物；动物的',''],
    ['anniversary','n. 周年纪念日',''],
    ['announce','vt. 宣布；述说；预示；播报；vi. 宣布参加竞选；当播音员',''],
    ['annoy','n. 烦恼（等于annoyance）；vt. 骚扰；惹恼；打搅；vi. 惹恼；令人讨厌；打搅',''],
    ['annual','n. 年刊，年鉴；一年生植物；adj. 年度的；每年的',''],
    ['another','prep. 另一个；另一个人；adj. 又一，另一；另外的；不同的；pron. 另一个；又一个',''],
    ['answer','n. 回答；答案；答辩；vt. 回答；符合；vi. 回答；符合',''],
    ['anticipate','vt. 预期，期望；占先，抢先；提前使用',''],
    ['anxious','adj. 焦虑的；担忧的；渴望的；急切的',''],
    ['any','adj. 任何的；所有的；丝毫；pron. 任何；任何一个；若干；adv. 稍微；少许',''],
    ['anybody','n. 重要人物；pron. 任何人',''],
    ['anyhow','adv. 总之；无论如何；不管怎样',''],
    ['anyone','pron. 任何人；任何一个',''],
    ['anything','pron. 任何事',''],
    ['anyway','adv. 无论如何，不管怎样；总之',''],
    ['anywhere','n. 任何地方；adv. 在任何地方；无论何处',''],
    ['apart','adj. 分离的；与众不同的；adv. 相距；与众不同地；分离着',''],
    ['apartment','n. 公寓；房间',''],
    ['apologize','vi. 道歉；辩解；赔不是；vt. 道歉；谢罪；辩白',''],
    ['apologise','vi. 道歉（等于apologize）',''],
    ['apology','n. 道歉；谢罪；辩护；勉强的替代物',''],
    ['apparent','adj. 显然的；表面上的',''],
    ['appeal','n. 呼吁，请求；吸引力，感染力；上诉；诉诸裁判；vt. 将…上诉，对…上诉；vi. 呼吁，恳求；上诉；诉诸，求助；有吸引力，迎合爱好；（体育比赛中）诉诸裁判',''],
    ['appear','vi. 出现；显得；似乎；出庭；登场',''],
    ['appearance','n. 外貌，外观；出现，露面',''],
    ['appendix','n. 附录；阑尾；附加物',''],
    ['appetite','n. 食欲；嗜好',''],
    ['applause','n. 欢呼，喝采；鼓掌欢迎',''],
    ['appliance','n. 器具；器械；装置',''],
    ['applicant','n. 申请人，申请者；请求者',''],
    ['application','n. 应用；申请；应用程序；敷用',''],
    ['apply','vi. 申请；涂，敷；适用；请求；vt. 申请；涂，敷；应用',''],
    ['appoint','vt. 任命；指定；约定；vi. 任命；委派',''],
    ['appreciate','vi. 增值；涨价；vt. 欣赏；感激；领会；鉴别',''],
    ['approach','n. 方法；途径；接近；vt. 接近；着手处理；vi. 靠近',''],
    ['appropriate','adj. 适当的；恰当的；合适的；vt. 占用，拨出',''],
    ['approve','vi. 批准；赞成；满意；vt. 批准；赞成；为…提供证据',''],
    ['April','n. 四月',''],
    ['arbitrary','adj.  任意的；武断的；专制的',''],
    ['arbitration','n. 公断，仲裁',''],
    ['area','n. 区域，地区；面积；范围',''],
    ['argue','vi. 争论，辩论；提出理由；vt. 辩论，争论；证明；说服',''],
    ['argument','n. 论证；论据；争吵；内容提要',''],
    ['arise','vi. 出现；上升；起立',''],
    ['arm','n. 手臂；武器；袖子；装备；部门；vt. 武装；备战；vi. 武装起来',''],
    ['army','n. 陆军，军队',''],
    ['around','prep. 四处；在…周围；adv. 大约；到处；在附近',''],
    ['arouse','vt. 引起；唤醒；鼓励；vi. 激发；醒来；发奋',''],
    ['arrange','vi. 安排；排列；协商；vt. 安排；排列；整理',''],
    ['arrest','n. 逮捕；监禁；vt. 逮捕；阻止；吸引',''],
    ['arrival','n. 到来；到达；到达者',''],
    ['arrive','vi. 到达；成功；达成；出生',''],
    ['arrow','n. 箭，箭头；箭状物；箭头记号；vt. 以箭头指示；箭一般地飞向',''],
    ['art','n. 艺术；美术；艺术品；v. 是（be的变体）；adj. 艺术的；艺术品的',''],
    ['article','n. 文章；物品；条款； 冠词；vt. 订约将…收为学徒或见习生；使…受协议条款的约束；vi. 签订协议；进行控告',''],
    ['artist','n. 艺术家；美术家（尤指画家）；大师',''],
    ['as','conj. 因为；随着；虽然；依照；当…时；prep. 如同；当作；以…的身份；adv. 同样地；和…一样的',''],
    ['ash','n. 灰；灰烬',''],
    ['Asia','n. 亚洲',''],
    ['Asian','n. 亚洲人；adj. 亚洲的；亚洲人的',''],
    ['ashamed','adj. 惭愧的，感到难为情的；耻于……的',''],
    ['aside','prep. 在…旁边；n. 旁白；私语，悄悄话；离题的话；adv. 离开，撇开；在旁边',''],
    ['ask','vt. 问，询问；要求；需要；邀请；讨价；vi. 问，询问；要求',''],
    ['asleep','adj. 睡着的；麻木的；长眠的；adv. 熟睡地；进入睡眠状态',''],
    ['aspect','n. 方面；方向；形势；外貌',''],
    ['assess','vt. 评定；估价；对…征税',''],
    ['assist','n. 帮助；助攻；vi. 参加；出席；vt. 帮助；促进',''],
    ['assistant','n. 助手，助理，助教；adj. 辅助的，助理的；有帮助的',''],
    ['associate','n. 同事，伙伴；关联的事物；adj. 副的；联合的；vt. 联想；使联合；使发生联系；vi. 交往；结交',''],
    ['association','n. 协会，联盟，社团；联合；联想',''],
    ['assume','vt. 僭取；篡夺；夺取；擅用；侵占；vi. 假定；设想；承担；采取',''],
    ['assure','vt. 保证；担保；使确信；弄清楚',''],
    ['astonish','vt. 使惊讶',''],
    ['at','prep. 在（表示存在或出现的地点、场所、位置、空间）；以（某种价格、速度等）；向；达；因为；朝；忙于；n. 阿特（老挝货币基本单位att）；砹（极不稳定放射性元素）；abbr. 密封的（airtight）；气温（air temperature）',''],
    ['athlete','n. 运动员，体育家；身强力壮的人',''],
    ['Atlantic','n. 大西洋；adj. 大西洋的',''],
    ['atmosphere','n. 气氛；大气；空气',''],
    ['attach','vi. 附加；附属；伴随；vt. 使依附；贴上；系上；使依恋',''],
    ['attack','n. 攻击；抨击；疾病发作；vt. 攻击；抨击；动手干；vi. 攻击；腐蚀',''],
    ['attempt','n. 企图，试图；攻击；vt. 企图，试图；尝试',''],
    ['attend','vi. 出席；致力于；照料；照顾；vt. 出席；上（大学等）；照料；招待；陪伴',''],
    ['attention','n. 注意力；关心；立正！（口令）',''],
    ['attitude','n. 态度；看法；意见；姿势',''],
    ['attract','vt. 吸引；引起；vi. 吸引；有吸引力',''],
    ['attractive','adj. 吸引人的；有魅力的；引人注目的',''],
    ['audience','n. 观众；听众；读者；接见；正式会见；拜会','']
  ]
};
