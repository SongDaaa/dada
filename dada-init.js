// dada-init.js — PWA, initialization, event wiring
// Dependencies: dada-data.js, dada-speech.js, dada-study.js, dada-ui.js

// ── PWA Setup ──
(function setupPWA() {
  try {
    var m = {
      name: 'DADA', short_name: 'DADA',
      start_url: location.href.split('?')[0],
      display: 'standalone',
      background_color: '#f5f0eb', theme_color: '#e07b5a',
      icons: [{ src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192"><rect width="192" height="192" rx="36" fill="#e07b5a"/><text x="96" y="120" text-anchor="middle" font-family="sans-serif" font-size="100" font-weight="bold" fill="white">Da</text></svg>'), sizes: '192x192', type: 'image/svg+xml' }]
    };
    var link = document.createElement('link');
    link.rel = 'manifest';
    link.href = 'data:application/json;base64,' + btoa(unescape(encodeURIComponent(JSON.stringify(m))));
    document.head.appendChild(link);
  } catch(e) {}
})();

// ── Init ──
function init() {
  var errLog = [];
  var el = document.getElementById('loadStatus');
  function safe(fn, label) {
    try { fn(); el.textContent = 'OK:' + label; } catch(e) { errLog.push(label + ': ' + e.message); el.textContent = 'ERR:' + label; el.style.color = 'red'; }
  }

  safe(function(){loadStats();},'loadStats');
  safe(function(){loadWords();},'loadWords');
  safe(function(){setupDailyStreak();},'streak');
  safe(function(){rate=parseFloat(localStorage.getItem('dada_speech_rate')||'0.9');},'rate');

  // Nav
  safe(function(){
    var navBtns=document.querySelectorAll('nav button');
    for(var i=0;i<navBtns.length;i++){(function(b){b.addEventListener('click',function(){switchPage(b.dataset.page);});})(navBtns[i]);}
  },'nav');

  // Card flip
  safe(function() {
    document.getElementById('cardWrap').addEventListener('click', function(e) {
      if (e.target.tagName === 'BUTTON') return;
      document.getElementById('cardInner').classList.toggle('flipped');
    });
  }, 'cardWrap');

  // Speak buttons
  safe(function() {
    document.getElementById('speakBtn').addEventListener('click', function(e) {
      e.stopPropagation();
      var text = document.getElementById('cardEn').textContent;
      if (text && text !== '🎉') speak(text);
    });
  }, 'speakBtn1');
  safe(function() {
    document.getElementById('speakBtn2').addEventListener('click', function(e) {
      e.stopPropagation();
      var text = document.getElementById('cardEn').textContent;
      if (text && text !== '🎉') speak(text);
    });
  }, 'speakBtn2');

  // Rate slider
  safe(function() {
    var rateSlider = document.getElementById('rateSlider');
    var rateLabel = document.getElementById('rateLabel');
    rateSlider.value = rate;
    rateLabel.textContent = rate.toFixed(1) + 'x';
    rateSlider.addEventListener('input', function() {
      rate = parseFloat(rateSlider.value);
      rateLabel.textContent = rate.toFixed(1) + 'x';
      localStorage.setItem('dada_speech_rate', rate);
    });
  }, 'rateSlider');

  // Daily limit selector
  safe(function() {
    var sel = document.getElementById('dailyLimitSelect');
    sel.value = dailyLimit;
    sel.addEventListener('change', function() {
      dailyLimit = parseInt(sel.value);
      localStorage.setItem('dada_daily_limit', dailyLimit);
      buildStudyQueue(); showCard(); renderStudyProgress(); updateAllUI();
    });
  }, 'dailyLimit');

  // Study book selector
  safe(function() {
    var sel = document.getElementById('studyBookSelect');
    sel.value = studyBook;
    sel.addEventListener('change', function() {
      studyBook = sel.value;
      localStorage.setItem('dada_study_book', studyBook);
      buildStudyQueue(); showCard(); renderStudyProgress(); updateAllUI();
    });
  }, 'studyBook');

  // Study buttons
  safe(function() {
    document.getElementById('btnKnow').addEventListener('click', handleKnow);
    document.getElementById('btnDunno').addEventListener('click', handleDunno);
  }, 'studyBtns');

  // Check-in button
  safe(function() {
    document.getElementById('btnCheckIn').addEventListener('click', checkIn);
  }, 'checkInBtn');

  // MyData toggle
  safe(function() {
    document.getElementById('mydataToggle').addEventListener('click', function() {
      document.getElementById('mydataBody').classList.toggle('collapsed');
      var txt = document.getElementById('mydataBody').classList.contains('collapsed') ? '▶' : '▾';
      document.getElementById('mydataToggle').textContent = '📊 我的数据 ' + txt;
    });
  }, 'mydataToggle');

  // Prev/Next word navigation
  safe(function() {
    document.getElementById('btnPrevWord').addEventListener('click', prevWord);
    document.getElementById('btnNextWord').addEventListener('click', nextWord);
  }, 'cardNav');

  // Quiz
  safe(function() {
    generateQuiz();
    document.getElementById('quizOpts').addEventListener('click', function(e) {
      var btn = e.target.closest('.quiz-opt');
      if (!btn || btn.disabled) return;
      handleQuizClick(btn);
    });
    document.getElementById('btnNextQuiz').addEventListener('click', generateQuiz);
    document.getElementById('btnSpellCheck').addEventListener('click', checkSpelling);
    document.getElementById('btnListenAgain').addEventListener('click', function() {
      if (quizWord) speak(quizWord.en);
    });
    document.getElementById('spellingInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') checkSpelling();
    });
    var modeBtns = document.querySelectorAll('.quiz-mode-bar button');
    for (var j = 0; j < modeBtns.length; j++) {
      (function(btn) { btn.addEventListener('click', function() { switchQuizMode(btn.dataset.mode); }); })(modeBtns[j]);
    }
  }, 'quiz');

  // Review
  safe(function() {
    document.getElementById('btnReviewAll').addEventListener('click', reviewAllDue);
  }, 'review');

  // Word bank add
  safe(function() {
    document.getElementById('btnAdd').addEventListener('click', function() {
      var en = document.getElementById('addEn').value;
      var zh = document.getElementById('addZh').value;
      var ph = document.getElementById('addPhonetic').value;
      if (!en.trim() || !zh.trim()) { toast('请填写单词和释义'); return; }
      addWord(en, zh, ph, currentBookFilter || '');
      document.getElementById('addEn').value = '';
      document.getElementById('addZh').value = '';
      document.getElementById('addPhonetic').value = '';
      refreshBankView(); updateAllUI();
      toast('已添加: ' + en);
    });
  }, 'wordBank');

  // Search with debounce
  safe(function() {
    var searchTimer = null;
    document.getElementById('searchInput').addEventListener('input', function() {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(function() { wordTableOffset = 0; renderWordTable(); }, 250);
    });
  }, 'search');

  // Status filters
  safe(function() {
    var fbtns = document.querySelectorAll('.filter-btn');
    for (var k = 0; k < fbtns.length; k++) {
      (function(btn) {
        btn.addEventListener('click', function() {
          document.querySelectorAll('.filter-btn').forEach(function(b){b.classList.remove('active');});
          btn.classList.add('active');
          currentStatusFilter = btn.dataset.filter;
          wordTableOffset = 0; renderWordTable();
        });
      })(fbtns[k]);
    }
  }, 'statusFilters');

  // Book detail: back button + subcat filters
  safe(function() {
    document.getElementById('btnBackToBooks').addEventListener('click', function() {
      currentBookFilter = null; wordTableOffset = 0; showBookCards();
    });
    var sbtns = document.querySelectorAll('.subcat-btn');
    for (var m = 0; m < sbtns.length; m++) {
      (function(btn) {
        btn.addEventListener('click', function() {
          document.querySelectorAll('.subcat-btn').forEach(function(b){b.classList.remove('active');});
          btn.classList.add('active');
          currentSubFilter = btn.dataset.subcat;
          wordTableOffset = 0; renderWordTable();
        });
      })(sbtns[m]);
    }
  }, 'bookDetail');

  // Import CSV modal
  safe(function() {
    document.getElementById('btnImport').addEventListener('click', function() {
      document.getElementById('importModal').style.display = 'flex';
    });
    document.getElementById('btnImportCancel').addEventListener('click', function() {
      document.getElementById('importModal').style.display = 'none';
    });
    document.getElementById('btnImportConfirm').addEventListener('click', function() {
      var text = document.getElementById('importText').value.trim();
      if (!text) return;
      var rows = parseCSVText(text);
      var count = importCSVRows(rows);
      document.getElementById('importModal').style.display = 'none';
      document.getElementById('importText').value = '';
      refreshBankView(); updateAllUI();
      toast('已导入 ' + count + ' 个单词');
    });
  }, 'importCSV');

  // Preset modal
  safe(function() {
    document.getElementById('btnPreset').addEventListener('click', function() {
      document.getElementById('presetModal').style.display = 'flex';
    });
    document.getElementById('btnPresetCancel').addEventListener('click', function() {
      document.getElementById('presetModal').style.display = 'none';
    });
    var pbtns = document.querySelectorAll('.preset-btn');
    for (var p = 0; p < pbtns.length; p++) {
      (function(btn) {
        btn.addEventListener('click', function() {
          var cat = btn.dataset.preset;
          var count = initPreset(cat);
          document.getElementById('presetModal').style.display = 'none';
          refreshBankView(); updateAllUI();
          toast('已加载 ' + categoryLabel(cat) + ' 词库: +' + count + ' 个新词');
        });
      })(pbtns[p]);
    }
  }, 'presetModal');

  // Export / Import files
  safe(function() {
    document.getElementById('btnExport').addEventListener('click', exportJSON);
    document.getElementById('btnImportFile').addEventListener('click', function() {
      document.getElementById('importFileInput').click();
    });
    document.getElementById('importFileInput').addEventListener('change', function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(ev) {
        var jsonStr = ev.target.result;
        showConfirm('导入数据', '导入将合并新单词，已有单词不会被覆盖。确定继续？', function() {
          // Use batched import for large files
          importJSONBatched(jsonStr, function(done, total) {
            document.getElementById('confirmTitle').textContent = '正在导入... ' + done + '/' + total;
          }, function(newCount, updatedCount) {
            if (newCount >= 0) {
              refreshBankView(); updateAllUI();
              var msg = '已导入 ' + newCount + ' 个新单词';
              if (updatedCount > 0) msg += '，更新 ' + updatedCount + ' 个已有单词的分类';
              toast(msg);
            } else {
              toast('导入失败：JSON 格式错误');
            }
          });
        });
      };
      reader.readAsText(file);
      e.target.value = '';
    });
    // CSV file import
    document.getElementById('btnImportCSVFile').addEventListener('click', function() {
      document.getElementById('importCSVFileInput').click();
    });
    document.getElementById('importCSVFileInput').addEventListener('change', function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(ev) {
        var rows = parseCSVText(ev.target.result);
        if (rows.length === 0) { toast('文件为空或格式不正确'); return; }
        showConfirm('导入CSV词库', '检测到 ' + rows.length + ' 行数据。导入将合并新单词，已有单词不会被覆盖。确定继续？', function() {
          var count = importCSVRows(rows);
          refreshBankView(); updateAllUI();
          toast('已导入 ' + count + ' 个新单词（共 ' + rows.length + ' 行）');
        });
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  }, 'exportImport');

  // Confirm modal
  safe(function() {
    document.getElementById('btnConfirmCancel').addEventListener('click', function() {
      document.getElementById('confirmModal').style.display = 'none';
      confirmCallback = null;
    });
    document.getElementById('btnConfirmOk').addEventListener('click', function() {
      document.getElementById('confirmModal').style.display = 'none';
      if (confirmCallback) { confirmCallback(); confirmCallback = null; }
    });
  }, 'confirmModal');

  // Keyboard shortcuts
  safe(function() {
    document.addEventListener('keydown', function(e) {
      if (!document.getElementById('page-study').classList.contains('active')) return;
      if (e.key === 'ArrowLeft') document.getElementById('cardInner').classList.add('flipped');
      if (e.key === 'ArrowRight') document.getElementById('cardInner').classList.remove('flipped');
      if (e.key === 'y' || e.key === 'Y') handleKnow();
      if (e.key === 'n' || e.key === 'N') handleDunno();
    });
  }, 'keyboard');

  // Init study state
  safe(function(){buildStudyQueue();},'buildQueue');
  safe(function(){showCard();},'showCard');
  safe(function(){updateAllUI();},'updateUI');
  safe(function(){startLearnTimer();},'timer');

  // Final status
  el.textContent = errLog.length > 0 ? 'ERRS(' + errLog.length + '): ' + errLog.join(' | ') : 'DADA OK';
  el.style.color = errLog.length > 0 ? 'red' : '#4a4';
  el.style.display = 'block';
  if (errLog.length === 0) { setTimeout(function() { el.style.display = 'none'; }, 3000); }
}

// ── Beforeunload cleanup ──
window.addEventListener('beforeunload', function() {
  stopLearnTimer();
  saveStats();
  saveWords();
});

// ── DOMContentLoaded ──
document.addEventListener('DOMContentLoaded', function() {
  var el = document.getElementById('loadStatus');
  try { el.textContent = 'init...'; init(); }
  catch(e) { el.textContent = 'FATAL: ' + e.message; el.style.color = 'red'; }
  el.style.display = 'block';
});
