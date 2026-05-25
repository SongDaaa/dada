// dada-ui.js — DOM rendering, navigation, word table with pagination
// Dependencies: dada-data.js, dada-study.js

var currentBookFilter = null;
var currentSubFilter = 'all';
var currentStatusFilter = 'all';
var wordTableOffset = 0;
var WORD_TABLE_PAGE = 50;

// ── Navigation ──
function switchPage(name) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('nav button').forEach(function(b) { b.classList.remove('active'); });
  var pageEl = document.getElementById('page-' + name);
  if (pageEl) pageEl.classList.add('active');
  var navBtn = document.querySelector('nav button[data-page="' + name + '"]');
  if (navBtn) navBtn.classList.add('active');
  if (name === 'bank') { wordTableOffset = 0; currentBookFilter = null; showBookCards(); }
  if (name === 'review') renderReviewList();
  if (name === 'study') { buildStudyQueue(); showCard(); startLearnTimer(); }
  else { stopLearnTimer(); saveStats(); }
}

// ── Toast ──
function toast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  setTimeout(function() { el.classList.remove('show'); }, 2000);
}

// ── Confirm ──
function showConfirm(title, msg, cb) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  document.getElementById('confirmModal').style.display = 'flex';
  confirmCallback = cb;
}

// ── Book Cards ──
function refreshBankView() {
  wordTableOffset = 0;
  if (currentBookFilter) { renderWordTable(); }
  else { showBookCards(); }
}

function showBookCards() {
  currentBookFilter = null;
  document.getElementById('bookCards').style.display = 'grid';
  document.getElementById('bookDetailBar').style.display = 'none';
  document.querySelector('#page-bank .filter-bar').style.display = '';
  document.querySelector('#page-bank .word-table').style.display = 'none';
  document.getElementById('wordCount').style.display = 'none';

  var cats = [
    { id: 'cet4', icon: '📗', title: 'CET-4 四级' },
    { id: 'cet6', icon: '📘', title: 'CET-6 六级' },
    { id: 'ielts', icon: '📙', title: '雅思' },
    { id: 'ky', icon: '📕', title: '考研' },
    { id: 'zsb', icon: '📓', title: '专升本' }
  ];

  var html = '<div class="book-cards">';
  cats.forEach(function(c) {
    var allWords = Object.values(words).filter(function(w) { return w.category === c.id; });
    var total = allWords.length;
    var highCount = allWords.filter(function(w) { return w.subcat === 'high'; }).length;
    var examCount = allWords.filter(function(w) { return w.subcat === 'exam'; }).length;
    var otherCount = total - highCount - examCount;
    var subs = [];
    if (highCount > 0) subs.push('高频词:' + highCount);
    if (examCount > 0) subs.push('真题词:' + examCount);
    if (otherCount > 0) subs.push('其他:' + otherCount);
    var labelMap = { cet4:'CET4', cet6:'CET6', ielts:'IELTS', ky:'KY', zsb:'ZSB' };
    var fname = 'word_bank_' + (labelMap[c.id] || c.id) + '.json';
    html += '<div class="book-card" onclick="showBookDetail(\'' + c.id + '\')">' +
      '<div class="bc-icon">' + c.icon + '</div>' +
      '<div class="bc-title">' + c.title + '</div>' +
      '<div class="bc-count">共 ' + total + ' 词</div>' +
      '<div class="bc-subs">' + (subs.length > 0 ? subs.join(' | ') : (total > 0 ? '点击进入查看详情' : '暂无单词') ) + '</div>' +
      '<button class="btn btn-s btn-sm" style="margin-top:6px;" onclick="event.stopPropagation();loadBookFromServer(\'' + c.id + '\',\'' + fname + '\');">' + (total > 0 ? '🔄 同步分类数据' : '📥 加载云端词库') + '</button>' +
    '</div>';
  });
  html += '</div>';

  document.getElementById('bookCards').innerHTML = html;
}

function showBookDetail(cat) {
  currentBookFilter = cat;
  currentSubFilter = 'all';
  wordTableOffset = 0;

  document.getElementById('bookCards').style.display = 'none';
  document.getElementById('bookDetailBar').style.display = 'flex';
  document.querySelector('#page-bank .filter-bar').style.display = '';
  document.querySelector('#page-bank .word-table').style.display = '';
  document.getElementById('wordCount').style.display = '';

  var labels = { cet4: 'CET-4 四级', cet6: 'CET-6 六级', ielts: '雅思', ky: '考研', zsb: '专升本' };
  document.getElementById('bookDetailTitle').textContent = labels[cat] || cat;

  document.querySelectorAll('.subcat-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.subcat === currentSubFilter);
  });

  renderWordTable();
}

function loadBookFromServer(cat, fname) {
  var url = 'word_banks/' + fname;
  var labels = { cet4: 'CET-4 四级', cet6: 'CET-6 六级', ielts: '雅思', ky: '考研', zsb: '专升本' };
  var label = labels[cat] || cat;
  showConfirm('加载云端词库', '正在从服务器加载 ' + label + ' 词库（' + url + '），新单词将合并到本地。确定继续？', function() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.onload = function() {
      if (xhr.status === 200) {
        importJSONBatched(xhr.responseText, function(done, total) {
          document.getElementById('confirmTitle').textContent = '正在导入... ' + done + '/' + total;
        }, function(newCount, updatedCount) {
          if (newCount >= 0) {
            refreshBankView(); updateAllUI();
            var msg = '已加载 ' + label + ': +' + newCount + ' 个新词';
            if (updatedCount > 0) msg += '，更新 ' + updatedCount + ' 个已有单词的分类';
            toast(msg);
          } else {
            toast('导入失败：JSON 格式错误');
          }
        });
      } else {
        toast('加载失败：服务器返回 ' + xhr.status + '（请确认 ' + fname + ' 文件存在）');
      }
    };
    xhr.onerror = function() { toast('加载失败：网络错误'); };
    xhr.send();
  });
}

// ── Word Table with Pagination ──
function renderWordTable() {
  var entries = Object.entries(words);
  if (currentBookFilter) {
    entries = entries.filter(function(e) { return e[1].category === currentBookFilter; });
  }
  if (currentBookFilter && currentSubFilter === 'high') {
    entries = entries.filter(function(e) { return e[1].subcat === 'high'; });
  } else if (currentBookFilter && currentSubFilter === 'exam') {
    entries = entries.filter(function(e) { return e[1].subcat === 'exam'; });
  }
  if (currentStatusFilter === 'mistake') {
    entries = entries.filter(function(e) { return e[1].mistakes > 0; });
  } else if (currentStatusFilter === 'unmastered') {
    entries = entries.filter(function(e) { return e[1].status !== 'mastered'; });
  } else if (currentStatusFilter !== 'all') {
    entries = entries.filter(function(e) { return e[1].status === currentStatusFilter; });
  }
  var search = document.getElementById('searchInput').value.toLowerCase();
  if (search) entries = entries.filter(function(e) { return e[1].en.toLowerCase().indexOf(search) !== -1 || e[1].zh.indexOf(search) !== -1; });

  var total = entries.length;
  var visible = entries.slice(0, wordTableOffset + WORD_TABLE_PAGE);

  var statusLabels = { 'new': '🌕 新学', 'learning': '🔄 学习中', 'mastered': '✅ 已掌握' };
  var html = visible.map(function(e) {
    var id = e[0], w = e[1];
    var catLabel = categoryLabel(w.category) || '-';
    return '<tr>' +
      '<td><b>' + w.en + '</b>' + (w.phonetic ? ' <span style="color:var(--sub);font-size:12px;">' + escHtml(w.phonetic) + '</span>' : '') + '</td>' +
      '<td>' + w.zh + '</td>' +
      '<td style="font-size:12px;">' + catLabel + '</td>' +
      '<td style="font-size:12px;">' + (statusLabels[w.status] || w.status) + '</td>' +
      '<td><button class="btn btn-s btn-sm" onclick="deleteWord(\'' + id + '\');renderWordTable();updateAllUI();">删除</button></td>' +
    '</tr>';
  }).join('');

  if (total > visible.length) {
    var remaining = total - visible.length;
    html += '<tr id="loadMoreRow"><td colspan="5" style="text-align:center;padding:12px;">' +
      '<button class="btn btn-s btn-sm" onclick="wordTableOffset+=' + WORD_TABLE_PAGE + ';renderWordTable();">加载更多（剩余 ' + remaining + ' 个）</button>' +
      '</td></tr>';
  }

  document.getElementById('wordTableBody').innerHTML = html || '<tr><td colspan="5" style="text-align:center;color:var(--sub);padding:20px;">暂无单词</td></tr>';
  document.getElementById('wordCount').textContent = '共 ' + total + ' 个单词' + (total > visible.length ? '（已显示 ' + visible.length + ' 个）' : '');
}

// ── Review UI ──
function renderReviewList() {
  var dueIds = getDueReviewIds();
  if (studyBook !== 'all') { dueIds = dueIds.filter(function(id) { return words[id].category === studyBook; }); }
  document.getElementById('reviewBadge').textContent = dueIds.length;
  document.getElementById('reviewBadge').style.display = dueIds.length > 0 ? 'inline' : 'none';
  document.getElementById('reviewSummary').textContent = dueIds.length > 0
    ? dueIds.length + ' 个单词等待复习' : '暂无需要复习的单词 ✓';
  if (dueIds.length === 0) {
    document.getElementById('reviewList').innerHTML = '<p style="color:var(--sub);text-align:center;margin-top:40px;">全部搞定，休息一下 🎉</p>';
    return;
  }
  var html = dueIds.map(function(id) {
    var w = words[id];
    var dueTime = new Date(w.nextReview);
    var ago = Math.round((Date.now() - dueTime) / 3600000);
    return '<div class="review-item">' +
      '<span><span class="ri-w">' + w.en + '</span> — ' + w.zh + '</span>' +
      '<span class="ri-d">' + (ago < 1 ? '刚刚到期' : ago + '小时前到期') + ' | 已复习' + w.reviews.length + '次</span>' +
    '</div>';
  }).join('');
  document.getElementById('reviewList').innerHTML = html;
}

function reviewAllDue() { buildStudyQueue(); switchPage('study'); }

// ── Update All UI ──
function updateAllUI() {
  var counts = { 'new': 0, 'learning': 0, 'mastered': 0 };
  Object.values(words).forEach(function(w) {
    if (studyBook !== 'all' && w.category !== studyBook) return;
    if (counts[w.status] !== undefined) counts[w.status]++;
  });
  document.getElementById('statUnmastered').textContent = counts['new'] + counts['learning'];
  document.getElementById('statLearning').textContent = counts['learning'];
  document.getElementById('statMastered').textContent = counts['mastered'];
  renderReviewList();
  updateMyDataUI();
}
