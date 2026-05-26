// dada-data.js — Foundation: state, storage, word data, Ebbinghaus, CSV/import, presets
// Dependencies: none (must load first)

var STORAGE_KEY = 'dada_vocab';
var STATS_KEY = 'dada_stats';
var words = {};
var stats = { streak: 0, lastStudyDate: '', totalTime: 0, dailyTime: 0, wordsStudied: 0, todayDate: '', checkInDate: '', checkInStreak: 0, totalStudyDays: 0 };
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
    stats = raw ? JSON.parse(raw) : { streak: 0, lastStudyDate: '', totalTime: 0, dailyTime: 0, wordsStudied: 0, todayDate: '', checkInDate: '', checkInStreak: 0, totalStudyDays: 0 };
    if (stats.checkInDate === undefined) stats.checkInDate = '';
    if (stats.checkInStreak === undefined) stats.checkInStreak = 0;
    if (stats.totalStudyDays === undefined) stats.totalStudyDays = 0;
  } catch(e) { stats = { streak: 0, lastStudyDate: '', totalTime: 0, dailyTime: 0, wordsStudied: 0, todayDate: '', checkInDate: '', checkInStreak: 0, totalStudyDays: 0 }; }
}

function saveStats() { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); try { markSyncDirty(); } catch(e) {} }

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
  if (stats.checkInDate === today) { toast('今日已打卡 ✓'); return; }
  var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
  if (stats.checkInDate === yesterday) { stats.checkInStreak = (stats.checkInStreak || 0) + 1; }
  else if (stats.checkInDate !== today) { stats.checkInStreak = 1; }
  stats.checkInDate = today;
  saveStats();
  updateCheckInUI();
  toast('打卡成功！已连续 ' + stats.checkInStreak + ' 天 🔥');
}

function updateCheckInUI() {
  var today = new Date().toISOString().slice(0,10);
  var el = document.getElementById('checkInStatus');
  var btn = document.getElementById('btnCheckIn');
  if (!el || !btn) return;
  if (stats.checkInDate === today) {
    btn.textContent = '✅ 已打卡';
    btn.classList.add('btn-done');
    el.textContent = '连续 ' + (stats.checkInStreak || 1) + ' 天';
  } else {
    btn.textContent = '📅 打卡';
    btn.classList.remove('btn-done');
    el.textContent = stats.checkInStreak > 0 ? '上次连续 ' + stats.checkInStreak + ' 天' : '';
  }
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
  if (Object.keys(words).length === 0) { try { initPreset('cet4'); } catch(e) {} }
  try { updateAllUI(); } catch(e) {}
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
    ['abandon','v.放弃；抛弃','/əˈbændən/'],['ability','n.能力；才能','/əˈbɪləti/'],['abroad','adv.在国外；到国外','/əˈbrɔːd/'],['absent','adj.缺席的；不在的','/ˈæbsənt/'],['absolute','adj.绝对的；完全的','/ˈæbsəluːt/'],['absorb','v.吸收；吸引','/əbˈzɔːrb/'],['abstract','adj.抽象的 n.摘要','/ˈæbstrækt/'],['abundant','adj.丰富的；充裕的','/əˈbʌndənt/'],['academic','adj.学术的；学院的','/ˌækəˈdemɪk/'],['accelerate','v.加速；促进','/əkˈseləreɪt/'],['access','n.通道；进入权 v.访问','/ˈækses/'],['accompany','v.陪伴；伴随','/əˈkʌmpəni/'],['accomplish','v.完成；实现','/əˈkɑːmplɪʃ/'],['account','n.账户；说明 v.解释','/əˈkaʊnt/'],['accurate','adj.准确的；精确的','/ˈækjərət/'],['achieve','v.达到；取得','/əˈtʃiːv/'],['acknowledge','v.承认；确认','/əkˈnɑːlɪdʒ/'],['acquire','v.获得；学到','/əˈkwaɪər/'],['adapt','v.适应；改编','/əˈdæpt/'],['adequate','adj.充足的；适当的','/ˈædɪkwət/'],['adjust','v.调整；适应','/əˈdʒʌst/'],['admire','v.钦佩；赞赏','/ədˈmaɪər/'],['adopt','v.采用；收养','/əˈdɑːpt/'],['advance','v.前进 n.进步','/ədˈvæns/'],['advantage','n.优势；有利条件','/ədˈvæntɪdʒ/'],['affair','n.事务；事件','/əˈfer/'],['affect','v.影响；感动','/əˈfekt/'],['afford','v.负担得起；提供','/əˈfɔːrd/'],['aggressive','adj.侵略的；好斗的','/əˈɡresɪv/'],['agreement','n.协议；一致','/əˈɡriːmənt/'],['alcohol','n.酒精；酒','/ˈælkəhɔːl/'],['alternative','adj.可替代的 n.选择','/ɔːlˈtɜːrnətɪv/'],['ambition','n.野心；抱负','/æmˈbɪʃn/'],['amount','n.数量；总额','/əˈmaʊnt/'],['analyze','v.分析','/ˈænəlaɪz/'],['ancient','adj.古代的；古老的','/ˈeɪnʃənt/'],['annual','adj.年度的 n.年刊','/ˈænjuəl/'],['anxiety','n.焦虑；忧虑','/æŋˈzaɪəti/'],['apparent','adj.明显的；表面的','/əˈpærənt/'],['appeal','v.呼吁；吸引 n.上诉','/əˈpiːl/'],['appetite','n.食欲；胃口','/ˈæpɪtaɪt/'],['application','n.申请；应用','/ˌæplɪˈkeɪʃn/'],['approach','v.接近 n.方法','/əˈproʊtʃ/'],['appropriate','adj.适当的 v.挪用','/əˈproʊpriət/'],['approve','v.批准；赞成','/əˈpruːv/'],['arise','v.出现；产生','/əˈraɪz/'],['aspect','n.方面；层面','/ˈæspekt/'],['assemble','v.集合；组装','/əˈsembl/'],['assess','v.评估；评定','/əˈses/'],['atmosphere','n.气氛；大气','/ˈætməsfɪr/']
  ],
  cet6: [
    ['abnormal','adj.不正常的；异常的','/æbˈnɔːrml/'],['abolish','v.废除；取消','/əˈbɑːlɪʃ/'],['absurd','adj.荒谬的；可笑的','/əbˈsɜːrd/'],['accommodate','v.容纳；提供住宿','/əˈkɑːmədeɪt/'],['acquaint','v.使认识；使了解','/əˈkweɪnt/'],['adhere','v.坚持；黏附','/ədˈhɪr/'],['adjacent','adj.邻近的；毗连的','/əˈdʒeɪsnt/'],['administer','v.管理；执行','/ədˈmɪnɪstər/'],['adolescent','n.青少年 adj.青春期的','/ˌædəˈlesnt/'],['allege','v.声称；断言','/əˈledʒ/'],['alleviate','v.减轻；缓解','/əˈliːvieɪt/'],['allocate','v.分配；拨给','/ˈæləkeɪt/'],['ambiguous','adj.模糊的；歧义的','/æmˈbɪɡjuəs/'],['amend','v.修改；修订','/əˈmend/'],['analogy','n.类比；比喻','/əˈnælədʒi/'],['anonymous','adj.匿名的；无名的','/əˈnɑːnɪməs/'],['applaud','v.鼓掌；称赞','/əˈplɔːd/'],['ascend','v.上升；攀登','/əˈsend/'],['assault','n./v.攻击；袭击','/əˈsɔːlt/'],['assert','v.断言；主张','/əˈsɜːrt/'],['assimilate','v.同化；吸收','/əˈsɪməleɪt/'],['authentic','adj.真实的；可靠的','/ɔːˈθentɪk/'],['authorize','v.授权；批准','/ˈɔːθəraɪz/'],['barren','adj.贫瘠的；不育的','/ˈbærən/'],['bewilder','v.使迷惑；使困惑','/bɪˈwɪldər/'],['bizarre','adj.奇怪的；古怪的','/bɪˈzɑːr/'],['blunder','n.大错 v.犯错','/ˈblʌndər/'],['boycott','v./n.联合抵制','/ˈbɔɪkɑːt/'],['brisk','adj.轻快的；敏捷的','/brɪsk/'],['bruise','n.瘀伤 v.擦伤','/bruːz/']
  ],
  ielts: [
    ['acquisition','n.获得；习得','/ˌækwɪˈzɪʃn/'],['advocate','v.提倡 n.倡导者','/ˈædvəkeɪt/'],['agenda','n.议程；日程','/əˈdʒendə/'],['alliance','n.联盟；同盟','/əˈlaɪəns/'],['amenity','n.便利设施；舒适','/əˈmenəti/'],['anticipate','v.预期；期望','/ænˈtɪsɪpeɪt/'],['apparatus','n.设备；器械','/ˌæpəˈrætəs/'],['appraisal','n.评价；评估','/əˈpreɪzl/'],['arbitrary','adj.任意的；武断的','/ˈɑːrbɪtreri/'],['articulate','v.清晰表达 adj.善于表达的','/ɑːrˈtɪkjuleɪt/'],['attain','v.达到；获得','/əˈteɪn/'],['audit','n./v.审计；审查','/ˈɔːdɪt/'],['automate','v.使自动化','/ˈɔːtəmeɪt/'],['bias','n.偏见；偏向','/ˈbaɪəs/'],['breach','n.违反；破坏','/briːtʃ/'],['budget','n.预算 v.做预算','/ˈbʌdʒɪt/'],['capable','adj.有能力的','/ˈkeɪpəbl/'],['chronic','adj.慢性的；长期的','/ˈkrɑːnɪk/'],['cognitive','adj.认知的','/ˈkɑːɡnətɪv/'],['coincide','v.同时发生；一致','/ˌkoʊɪnˈsaɪd/'],['commitment','n.承诺；投入','/kəˈmɪtmənt/'],['compatible','adj.兼容的；合得来的','/kəmˈpætəbl/'],['compensate','v.补偿；赔偿','/ˈkɑːmpenseɪt/'],['comply','v.遵守；服从','/kəmˈplaɪ/'],['comprehensive','adj.全面的；综合的','/ˌkɑːmprɪˈhensɪv/'],['conceive','v.构思；想象','/kənˈsiːv/'],['confine','v.限制；局限于','/kənˈfaɪn/'],['conservation','n.保护；保存','/ˌkɑːnsərˈveɪʃn/'],['consolidate','v.巩固；合并','/kənˈsɑːlɪdeɪt/'],['controversy','n.争议；争论','/ˈkɑːntrəvɜːrsi/']
  ],
  ky: [
    ['adverse','adj.不利的；相反的','/ˈædvɜːrs/'],['aesthetic','adj.美学的；审美的','/esˈθetɪk/'],['aggregate','v.合计 n.总计','/ˈæɡrɪɡət/'],['alienate','v.疏远；使疏离','/ˈeɪliəneɪt/'],['ambitious','adj.有雄心的；野心勃勃的','/æmˈbɪʃəs/'],['analytical','adj.分析的；解析的','/ˌænəˈlɪtɪkl/'],['apparatus','n.设备；仪器','/ˌæpəˈrætəs/'],['approximately','adv.大约；近似地','/əˈprɑːksɪmətli/'],['arrogant','adj.傲慢的；自大的','/ˈærəɡənt/'],['ascertain','v.查明；确定','/ˌæsərˈteɪn/'],['aspiration','n.抱负；志向','/ˌæspəˈreɪʃn/'],['assumption','n.假设；设想','/əˈsʌmpʃn/'],['attribute','v.归因于 n.属性','/əˈtrɪbjuːt/'],['autonomous','adj.自治的；自主的','/ɔːˈtɑːnəməs/'],['beneficial','adj.有益的；有利的','/ˌbenɪˈfɪʃl/'],['collapse','v./n.倒塌；崩溃','/kəˈlæps/'],['complement','v.补充 n.补充物','/ˈkɑːmplɪment/'],['comprise','v.包括；构成','/kəmˈpraɪz/'],['concession','n.让步；妥协','/kənˈseʃn/'],['conform','v.遵守；符合','/kənˈfɔːrm/'],['conscience','n.良心；良知','/ˈkɑːnʃəns/'],['constitute','v.构成；组建','/ˈkɑːnstɪtuːt/'],['contradict','v.与…矛盾；反驳','/ˌkɑːntrəˈdɪkt/'],['correlate','v.相关；关联','/ˈkɔːrəleɪt/'],['criterion','n.标准；准则','/kraɪˈtɪriən/'],['demonstrate','v.证明；演示','/ˈdemənstreɪt/'],['depict','v.描绘；描述','/dɪˈpɪkt/'],['deteriorate','v.恶化；退化','/dɪˈtɪriəreɪt/'],['devote','v.致力于；奉献','/dɪˈvoʊt/'],['dilemma','n.困境；两难','/dɪˈlemə/']
  ],
  zsb: [
    ['academy','n.学院；专科院校','/əˈkædəmi/'],['accessible','adj.可接近的；易获得的','/əkˈsesəbl/'],['accumulate','v.积累；积聚','/əˈkjuːmjəleɪt/'],['acknowledge','v.承认；感谢','/əkˈnɑːlɪdʒ/'],['appreciation','n.欣赏；感激','/əˌpriːʃiˈeɪʃn/'],['appropriate','adj.适当的','/əˈproʊpriət/'],['approximately','adv.大约','/əˈprɑːksɪmətli/'],['assignment','n.任务；作业','/əˈsaɪnmənt/'],['associate','v.联系；关联','/əˈsoʊʃieɪt/'],['campaign','n.运动；活动','/kæmˈpeɪn/'],['candidate','n.候选人；应试者','/ˈkændɪdət/'],['ceremony','n.典礼；仪式','/ˈserəmoʊni/'],['colleague','n.同事','/ˈkɑːliːɡ/'],['competent','adj.有能力的；胜任的','/ˈkɑːmpɪtənt/'],['concentrate','v.集中；专注','/ˈkɑːnsntreɪt/'],['conference','n.会议','/ˈkɑːnfərəns/'],['consequence','n.结果；后果','/ˈkɑːnsɪkwens/'],['contemporary','adj.当代的；同时代的','/kənˈtempəreri/'],['contribute','v.贡献；捐献','/kənˈtrɪbjuːt/'],['convenient','adj.方便的','/kənˈviːniənt/'],['cooperate','v.合作','/koʊˈɑːpəreɪt/'],['correspond','v.相符；通信','/ˌkɔːrəˈspɑːnd/'],['demonstrate','v.展示；证明','/ˈdemənstreɪt/'],['discipline','n.纪律；学科','/ˈdɪsəplɪn/'],['distinguish','v.区分；辨别','/dɪˈstɪŋɡwɪʃ/'],['efficient','adj.高效的','/ɪˈfɪʃnt/'],['eliminate','v.消除；淘汰','/ɪˈlɪmɪneɪt/'],['enthusiasm','n.热情；热忱','/ɪnˈθuːziæzəm/'],['evaluate','v.评价；评估','/ɪˈvæljueɪt/'],['fundamental','adj.基本的；根本的','/ˌfʌndəˈmentl/']
  ]
};
