// dada-study.js — Study & quiz logic
// Dependencies: dada-data.js, dada-speech.js

var studyQueue = [];
var studyIdx = 0;
var studyMaxIdx = 0;
var quizMode = 'en2zh';
var quizWord = null;
var quizCorrect = 0, quizWrong = 0;
var quizCorrectAnswer = '';

// ── Study ──
function buildStudyQueue() {
  var pool = Object.keys(words);
  if (studyBook !== 'all') { pool = pool.filter(function(id) { return words[id].category === studyBook; }); }
  var due = getDueReviewIds().filter(function(id) { return pool.indexOf(id) !== -1; });
  var newPool = pool.filter(function(id) {
    return due.indexOf(id) === -1 && words[id].status === 'new';
  });
  shuffle(newPool);
  var slots = Math.max(0, dailyLimit - due.length);
  var picked = newPool.slice(0, slots);
  studyQueue = due.concat(picked);
  studyIdx = 0; studyMaxIdx = 0;
}

function showCard() {
  if (studyQueue.length === 0) {
    document.getElementById('cardEn').textContent = '🎉';
    document.getElementById('cardPhonetic').textContent = '';
    document.getElementById('cardEnBack').textContent = '';
    document.getElementById('cardZh').textContent = '没有单词啦！';
    document.getElementById('cardStatus').textContent = '';
    document.getElementById('studyProgress').innerHTML = '';
    return;
  }
  var w = words[studyQueue[studyIdx]];
  document.getElementById('cardEn').textContent = w.en;
  document.getElementById('cardPhonetic').textContent = w.phonetic || '';
  document.getElementById('cardEnBack').textContent = w.en;
  document.getElementById('cardZh').textContent = w.zh;
  document.getElementById('cardPhoneticBack').textContent = w.phonetic || '';
  var statusText = w.status === 'new' ? '🌕 新学' : (w.status === 'learning' ? '🔄 复习' : '');
  if (w.category) statusText += ' | ' + (categoryLabel(w.category));
  document.getElementById('cardStatus').textContent = statusText;
  document.getElementById('cardInner').classList.remove('flipped');
  renderStudyProgress();
  updateCardNav();
  try { speak(w.en); } catch(e) {}
}

function updateCardNav() {
  var info = document.getElementById('cardNavInfo');
  var prevBtn = document.getElementById('btnPrevWord');
  var nextBtn = document.getElementById('btnNextWord');
  if (!info || !prevBtn || !nextBtn) return;
  if (studyQueue.length === 0) { prevBtn.style.display = 'none'; nextBtn.style.display = 'none'; info.textContent = ''; return; }
  prevBtn.style.display = ''; nextBtn.style.display = '';
  prevBtn.disabled = studyIdx <= 0;
  nextBtn.disabled = studyIdx >= studyMaxIdx;
  info.textContent = '第 ' + (studyIdx + 1) + ' 词';
}

function prevWord() {
  if (studyIdx > 0) { studyIdx--; showCard(); }
}

function nextWord() {
  if (studyIdx < studyMaxIdx) { studyIdx++; showCard(); }
}

function renderStudyProgress() {
  document.getElementById('studyProgress').textContent = studyIdx + ' / ' + studyQueue.length;
}

function handleKnow() {
  if (studyQueue.length === 0) return;
  var id = studyQueue[studyIdx];
  var w = words[id];
  scheduleReview(id, w.reviews ? w.reviews.length : 0);
  stats.wordsStudied = (stats.wordsStudied || 0) + 1;
  recordWordStudied();
  saveWords();
  saveStats();
  studyIdx++; studyMaxIdx = Math.max(studyMaxIdx, studyIdx);
  if (studyIdx >= studyQueue.length) { buildStudyQueue(); studyIdx = 0; studyMaxIdx = 0; }
  showCard();
  updateAllUI();
}

function handleDunno() {
  if (studyQueue.length === 0) return;
  var id = studyQueue[studyIdx];
  var w = words[id];
  w.status = 'learning';
  if (!w.nextReview) w.nextReview = Date.now() + 86400000;
  saveWords();
  if (studyQueue.length > 1) { studyQueue.push(studyQueue.splice(studyIdx, 1)[0]); }
  else { studyIdx++; studyMaxIdx = Math.max(studyMaxIdx, studyIdx); }
  if (studyIdx >= studyQueue.length) { buildStudyQueue(); studyIdx = 0; studyMaxIdx = 0; }
  showCard();
  updateAllUI();
}

// ── Quiz ──
function switchQuizMode(mode) {
  quizMode = mode;
  document.querySelectorAll('.quiz-mode-bar button').forEach(function(b) { b.classList.remove('active'); });
  document.querySelector('.quiz-mode-bar button[data-mode="' + mode + '"]').classList.add('active');
  document.getElementById('quizOpts').style.display = mode === 'spell' ? 'none' : '';
  document.getElementById('quizSpellArea').style.display = mode === 'spell' ? 'block' : 'none';
  quizCorrect = 0; quizWrong = 0;
  updateQuizStatsUI();
  generateQuiz();
}

function generateQuiz() {
  var pool = Object.keys(words);
  if (pool.length < 4) {
    document.getElementById('quizWord').textContent = '词库不足4个单词';
    document.getElementById('quizOpts').innerHTML = '';
    document.getElementById('quizResult').textContent = '';
    return;
  }
  var correctIdx = Math.floor(Math.random() * pool.length);
  quizWord = words[pool[correctIdx]];
  var qWordEl = document.getElementById('quizWord');
  if (quizMode === 'en2zh') {
    if (quizWord.phonetic) qWordEl.innerHTML = quizWord.en + '<br><small style="color:var(--sub);font-size:16px;">' + quizWord.phonetic + '</small>';
    else qWordEl.textContent = quizWord.en;
    renderEn2ZhOpts(pool, correctIdx, quizWord.zh);
    try { speak(quizWord.en); } catch(e) {}
  } else if (quizMode === 'zh2en') {
    qWordEl.textContent = quizWord.zh;
    renderZh2EnOpts(pool, correctIdx, quizWord.en);
    try { speak(quizWord.en); } catch(e) {}
  } else if (quizMode === 'spell') {
    qWordEl.textContent = '🔊 听音拼写';
    document.getElementById('spellingInput').value = '';
    document.getElementById('quizResult').textContent = '';
    document.getElementById('spellingInput').focus();
    setTimeout(function() { speak(quizWord.en); }, 300);
  }
}

function renderEn2ZhOpts(pool, correctIdx, correctZh) {
  quizCorrectAnswer = correctZh;
  var distractors = [];
  var distPool = pool.filter(function(id) { return id !== pool[correctIdx]; });
  shuffle(distPool);
  for (var i = 0; i < 3 && i < distPool.length; i++) { distractors.push(words[distPool[i]].zh); }
  var opts = distractors.concat([correctZh]);
  shuffle(opts);
  var html = opts.map(function(zh) {
    return '<button class="quiz-opt" data-text="' + escHtml(zh) + '">' + escHtml(zh) + '</button>';
  }).join('');
  document.getElementById('quizOpts').innerHTML = html;
}

function renderZh2EnOpts(pool, correctIdx, correctEn) {
  quizCorrectAnswer = correctEn;
  var distractors = [];
  var distPool = pool.filter(function(id) { return id !== pool[correctIdx]; });
  shuffle(distPool);
  for (var i = 0; i < 3 && i < distPool.length; i++) { distractors.push(words[distPool[i]].en); }
  var opts = distractors.concat([correctEn]);
  shuffle(opts);
  var html = opts.map(function(en) {
    return '<button class="quiz-opt" data-text="' + escHtml(en) + '">' + escHtml(en) + '</button>';
  }).join('');
  document.getElementById('quizOpts').innerHTML = html;
}

function handleQuizClick(btn) {
  var chosen = btn.getAttribute('data-text');
  var correct = quizCorrectAnswer;
  var btns = document.querySelectorAll('.quiz-opt');
  btns.forEach(function(b) { b.disabled = true; });
  btns.forEach(function(b) { if (b.getAttribute('data-text') === correct) b.classList.add('correct'); });
  if (chosen === correct) {
    quizCorrect++;
    document.getElementById('quizResult').innerHTML = '<span style="color:var(--accent2)">✅ 正确!</span>';
  } else {
    quizWrong++;
    btn.classList.add('wrong');
    document.getElementById('quizResult').innerHTML = '<span style="color:#d44">❌ 错误! 正确答案: ' + escHtml(correct) + '</span>';
    trackMistake(quizWord.en);
  }
  updateQuizStatsUI();
  // Auto-next for inline quiz
  if (document.getElementById('quizInline') && document.getElementById('quizInline').style.display !== 'none') {
    setTimeout(function() { generateInlineQuiz(); }, 800);
  }
}

function checkSpelling() {
  var input = document.getElementById('spellingInput').value.trim().toLowerCase();
  var correct = quizWord.en.toLowerCase();
  if (input === correct) {
    quizCorrect++;
    document.getElementById('quizResult').innerHTML = '<span style="color:var(--accent2)">✅ 正确! ' + quizWord.en + '</span>';
  } else {
    quizWrong++;
    document.getElementById('quizResult').innerHTML = '<span style="color:#d44">❌ 错误! 正确答案: ' + quizWord.en + '</span>';
    trackMistake(quizWord.en);
  }
  updateQuizStatsUI();
  document.getElementById('spellingInput').value = '';
  // Auto-next for inline quiz
  if (document.getElementById('quizInline') && document.getElementById('quizInline').style.display !== 'none') {
    setTimeout(function() { generateInlineQuiz(); }, 1000);
  }
}

function trackMistake(en) {
  var id = Object.keys(words).find(function(k) { return words[k].en === en; });
  if (id) { words[id].mistakes = (words[id].mistakes || 0) + 1; saveWords(); }
}

function updateQuizStatsUI() {
  var elC = document.getElementById('qzCor');
  var elW = document.getElementById('qzWro');
  if (elC) elC.textContent = quizCorrect;
  if (elW) elW.textContent = quizWrong;
}

// ── Inline Quiz on Study Page ──

function toggleInlineQuiz() {
  var el = document.getElementById('quizInline');
  if (!el) return;
  if (el.style.display === 'none' || !el.style.display) {
    el.style.display = '';
    quizCorrect = 0; quizWrong = 0;
    updateQuizStatsUI();
    switchInlineQuiz('en2zh');
    document.getElementById('btnToggleQuiz').textContent = '🔄 换一组';
  } else {
    // Just regenerate with same mode
    quizCorrect = 0; quizWrong = 0;
    updateQuizStatsUI();
    generateInlineQuiz();
  }
}

function switchInlineQuiz(mode) {
  quizMode = mode;
  document.querySelectorAll('#quizInline .quiz-mode-bar button').forEach(function(b) {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  document.getElementById('quizOpts').style.display = mode === 'spell' ? 'none' : '';
  document.getElementById('spellingInput').style.display = mode === 'spell' ? '' : 'none';
  quizCorrect = 0; quizWrong = 0;
  updateQuizStatsUI();
  generateInlineQuiz();
}

function generateInlineQuiz() {
  // Pick from recently studied words or all available
  var pool = studyQueue.length > 0 ? studyQueue.slice(0, Math.min(studyQueue.length, 20)) : Object.keys(words);
  if (pool.length < 4) {
    document.getElementById('quizWord').textContent = '词库不足4个单词';
    document.getElementById('quizOpts').innerHTML = '';
    return;
  }
  var shuffled = pool.slice();
  shuffle(shuffled);
  var correctIdx = 0;
  quizWord = words[shuffled[correctIdx]];
  var qWordEl = document.getElementById('quizWord');
  document.getElementById('quizResult').innerHTML = '';
  if (quizMode === 'en2zh') {
    if (quizWord.phonetic) qWordEl.innerHTML = quizWord.en + '<br><small style="color:var(--sub);font-size:16px;">' + quizWord.phonetic + '</small>';
    else qWordEl.textContent = quizWord.en;
    renderEn2ZhOpts(shuffled, correctIdx, quizWord.zh);
    try { speak(quizWord.en); } catch(e) {}
  } else if (quizMode === 'zh2en') {
    qWordEl.textContent = quizWord.zh;
    renderZh2EnOpts(shuffled, correctIdx, quizWord.en);
    try { speak(quizWord.en); } catch(e) {}
  } else if (quizMode === 'spell') {
    qWordEl.textContent = '🔊 听音拼写';
    document.getElementById('spellingInput').value = '';
    document.getElementById('quizResult').innerHTML = '';
    setTimeout(function() { try { speak(quizWord.en); } catch(e) {} }, 300);
  }
}
