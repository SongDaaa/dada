// dada-swipe.js — Tinder式刷词模式
// Dependencies: dada-data.js (words, scheduleReview, getDueReviewIds, shuffle, saveWords, stats)

var SWIPE_SIZE = 100;
var swipeQueue = [];
var swipeIdx = 0;
var swipeKnown = 0;
var swipeUnknown = 0;

// ── Build ──

function buildSwipeQueue() {
  var allIds = Object.keys(words);
  if (allIds.length === 0) {
    document.getElementById('swipeWord').textContent = '词库为空';
    return;
  }

  // Priority: due reviews > learning > new > mastered
  var dueIds = getDueReviewIds();
  var ids = allIds.slice();

  var due = [], learning = [], fresh = [], rest = [];
  for (var i = 0; i < ids.length; i++) {
    var w = words[ids[i]];
    if (dueIds.indexOf(ids[i]) !== -1) due.push(ids[i]);
    else if (w.status === 'learning') learning.push(ids[i]);
    else if (w.status === 'new') fresh.push(ids[i]);
    else rest.push(ids[i]);
  }

  swipeQueue = [];
  var pools = [due, learning, fresh, rest];
  for (var p = 0; p < pools.length; p++) {
    shuffle(pools[p]);
    for (var j = 0; j < pools[p].length && swipeQueue.length < SWIPE_SIZE; j++) {
      swipeQueue.push(pools[p][j]);
    }
  }

  swipeIdx = 0;
  swipeKnown = 0;
  swipeUnknown = 0;

  updateSwipeStats();
  renderSwipeCard();
}

// ── Render ──

function renderSwipeCard() {
  if (swipeIdx >= swipeQueue.length) {
    swipeDone();
    return;
  }

  var id = swipeQueue[swipeIdx];
  var w = words[id];
  if (!w) { swipeIdx++; renderSwipeCard(); return; }

  var card = document.getElementById('swipeCard');
  card.style.transition = 'none';
  card.style.transform = 'translateX(0) rotate(0deg)';
  card.style.opacity = '1';
  card.className = 'swipe-card';

  document.getElementById('swipeWord').textContent = w.en;
  document.getElementById('swipePhonetic').textContent = w.phonetic || '';

  try { speak(w.en); } catch(e) {}

  // Reset reveal state
  swipeRevealState = false;
  card.style.borderLeft = '';
  card.className = 'swipe-card';

  // Click zones on card: left half = don't know, right half = know
  card.onclick = function(e) {
    var rect = card.getBoundingClientRect();
    var mid = rect.left + rect.width / 2;
    if (e.clientX < mid) doSwipe('left');
    else doSwipe('right');
  };

  // Show category badge
  var cat = document.getElementById('swipeCategory');
  if (w.category) {
    cat.textContent = categoryLabel(w.category);
    cat.style.display = '';
  } else {
    cat.style.display = 'none';
  }
}

function updateSwipeStats() {
  document.getElementById('swipeTotal').textContent = swipeIdx;
  document.getElementById('swipeKnownCount').textContent = swipeKnown;
  document.getElementById('swipeUnknownCount').textContent = swipeUnknown;
}

// ── Swipe Action ──

var swipeRevealState = false; // true = showing answer, waiting for tap to continue

function doSwipe(direction) {
  if (swipeIdx >= swipeQueue.length) return;
  var id = swipeQueue[swipeIdx];
  var w = words[id];
  if (!w) return;

  // If already showing answer, advance to next
  if (swipeRevealState) {
    swipeRevealState = false;
    swipeIdx++;
    updateSwipeStats();
    saveWords();
    renderSwipeCard();
    return;
  }

  // First tap: record answer and show result
  if (direction === 'right') {
    scheduleReview(id, w.reviews ? w.reviews.length : 0);
    recordWordStudied();
    swipeKnown++;
  } else {
    if (!w.nextReview) w.nextReview = Date.now() + 86400000;
    w.status = 'learning';
    swipeUnknown++;
  }
  updateSwipeStats();

  // Reveal the answer
  swipeRevealState = true;
  showSwipeAnswer(id, direction);
}

function showSwipeAnswer(id, direction) {
  var w = words[id];
  var card = document.getElementById('swipeCard');
  var isKnown = direction === 'right';

  card.style.transition = 'transform 0.2s ease';
  card.style.transform = 'scale(1.02)';
  card.className = 'swipe-card swipe-reveal';
  card.style.borderLeft = isKnown ? '4px solid var(--accent2)' : '4px solid var(--accent)';

  card.onclick = function(e) {
    doSwipe(direction); // second click advances
  };

  document.getElementById('swipeWord').textContent = w.en;
  document.getElementById('swipePhonetic').textContent = w.phonetic || '';

  var resultHtml = '<div class="swipe-reveal-content">' +
    '<div style="font-size:28px;font-weight:700;color:var(--text);margin-bottom:4px;">' + w.zh + '</div>' +
    '<div style="margin-top:12px;font-size:12px;color:var(--sub);">点击继续下一个</div>' +
    '</div>';

  document.getElementById('swipePhonetic').innerHTML = resultHtml;
}

// ── Done ──

function swipeDone() {
  document.getElementById('swipeCard').style.display = 'none';
  document.getElementById('swipeWord').textContent = '';
  document.getElementById('swipePhonetic').textContent = '';

  var total = swipeKnown + swipeUnknown;
  var pct = total > 0 ? Math.round(swipeKnown / total * 100) : 0;

  var msg = total === 0 ? '词库为空，先去词库添加单词吧' :
    '<h3>本轮结束</h3>' +
    '<p style="margin:8px 0;color:var(--sub);">共刷 ' + total + ' 词 | 认识 ' + swipeKnown + ' | 不认识 ' + swipeUnknown + '</p>' +
    '<p style="font-size:24px;font-weight:700;color:' + (pct >= 80 ? 'var(--accent2)' : 'var(--accent)') + ';">正确率 ' + pct + '%</p>';

  document.getElementById('swipeDone').innerHTML = msg;
  document.getElementById('swipeDone').style.display = '';
  document.getElementById('btnSwipeRestart').style.display = '';
}

function restartSwipe() {
  document.getElementById('swipeCard').style.display = '';
  document.getElementById('swipeDone').style.display = 'none';
  document.getElementById('btnSwipeRestart').style.display = 'none';
  buildSwipeQueue();
}

// ── Touch Handlers ──

var touchStartX = 0;
var touchStartY = 0;
var touchMoved = false;

function setupSwipeTouch() {
  var card = document.getElementById('swipeCard');
  if (!card) return;

  card.addEventListener('touchstart', function(e) {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchMoved = false;
      card.style.transition = 'none';
    }
  }, { passive: true });

  card.addEventListener('touchmove', function(e) {
    if (e.touches.length === 1 && swipeIdx < swipeQueue.length) {
      var dx = e.touches[0].clientX - touchStartX;
      var dy = e.touches[0].clientY - touchStartY;
      if (Math.abs(dx) > 5) touchMoved = true;
      if (Math.abs(dx) > Math.abs(dy)) {
        e.preventDefault();
        var rotate = dx * 0.1;
        var opacity = 1 - Math.abs(dx) / 300;
        card.style.transform = 'translateX(' + dx + 'px) rotate(' + rotate + 'deg)';
        card.style.opacity = Math.max(0.3, opacity);
        if (dx > 50) card.className = 'swipe-card swipe-hint-right';
        else if (dx < -50) card.className = 'swipe-card swipe-hint-left';
        else card.className = 'swipe-card';
      }
    }
  });

  card.addEventListener('touchend', function(e) {
    if (swipeIdx >= swipeQueue.length) return;
    // If showing answer, a tap advances to next word
    if (swipeRevealState) {
      doSwipe('right'); // direction doesn't matter for advancing
      return;
    }
    if (!touchMoved) {
      card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      card.style.transform = 'translateX(0) rotate(0deg)';
      card.style.opacity = '1';
      card.className = 'swipe-card';
      return;
    }
    var dx = (e.changedTouches[0] || {}).clientX - touchStartX || 0;
    if (dx > 70) { doSwipe('right'); }
    else if (dx < -70) { doSwipe('left'); }
    else {
      card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      card.style.transform = 'translateX(0) rotate(0deg)';
      card.style.opacity = '1';
      card.className = 'swipe-card';
    }
    touchMoved = false;
  });
}

// ── Keyboard Handler ──

function setupSwipeKeyboard() {
  document.addEventListener('keydown', function(e) {
    if (!document.getElementById('page-swipe').classList.contains('active')) return;
    if (swipeIdx >= swipeQueue.length) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); doSwipe('right'); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); doSwipe('left'); }
  });
}
