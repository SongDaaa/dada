// dada-challenge.js — 3条命挑战模式
// Dependencies: dada-data.js (words, stats, EBBINGHAUS, scheduleReview, getDueReviewIds, shuffle, categoryLabel)

var CHALLENGE_SIZE = 20;
var MAX_LIVES = 3;
var challengeWords = [];
var challengeIdx = 0;
var lives = MAX_LIVES;
var challengeCorrect = 0;
var challengeWrongWords = []; // words answered incorrectly
var challengeStreak = parseInt(localStorage.getItem('dada_cstreak') || '0');
var challengeDate = localStorage.getItem('dada_cdate') || '';

// ── Build ──

function buildChallenge() {
  var allIds = Object.keys(words);
  if (allIds.length < 4) {
    document.getElementById('challengeWord').textContent = '需要至少4个单词才能挑战';
    document.getElementById('challengeOpts').innerHTML = '';
    return;
  }

  // Priority: due reviews > learning > new > any
  var dueIds = getDueReviewIds();
  var ids = allIds.slice();
  shuffle(ids);

  // Separate by status
  var due = [], learning = [], fresh = [], rest = [];
  for (var i = 0; i < ids.length; i++) {
    var w = words[ids[i]];
    if (dueIds.indexOf(ids[i]) !== -1) due.push(ids[i]);
    else if (w.status === 'learning') learning.push(ids[i]);
    else if (w.status === 'new') fresh.push(ids[i]);
    else rest.push(ids[i]);
  }

  // Assemble: due first, then learning, then new, then mastered
  challengeWords = [];
  var pools = [due, learning, fresh, rest];
  for (var p = 0; p < pools.length; p++) {
    shuffle(pools[p]);
    for (var j = 0; j < pools[p].length && challengeWords.length < CHALLENGE_SIZE; j++) {
      challengeWords.push(pools[p][j]);
    }
  }

  challengeIdx = 0;
  lives = MAX_LIVES;
  challengeCorrect = 0;
  challengeWrongWords = [];

  renderChallengeUI();
  renderChallengeCard();
}

// ── Render ──

function renderChallengeUI() {
  updateChallengeHearts();
  updateChallengeProgress();
  document.getElementById('challengeStreakBadge').textContent = challengeStreak;
  document.getElementById('challengeResult').innerHTML = '';
  document.getElementById('challengeResult').style.display = 'none';
  document.getElementById('challengeCard').style.display = '';
  document.getElementById('btnRestartChallenge').style.display = 'none';
  document.getElementById('btnChallengeDone').style.display = 'none';
}

function updateChallengeHearts() {
  var html = '';
  for (var i = 0; i < MAX_LIVES; i++) {
    html += i < lives ? '❤️' : '🖤';
  }
  document.getElementById('challengeHearts').textContent = html;
}

function updateChallengeProgress() {
  var pct = challengeWords.length > 0 ? Math.round(challengeIdx / challengeWords.length * 100) : 0;
  document.getElementById('challengeBar').style.width = pct + '%';
  document.getElementById('challengeCount').textContent = challengeIdx + '/' + challengeWords.length;
}

function renderChallengeCard() {
  if (challengeIdx >= challengeWords.length) {
    challengeVictory();
    return;
  }

  var id = challengeWords[challengeIdx];
  var w = words[id];
  if (!w) { challengeIdx++; renderChallengeCard(); return; }

  document.getElementById('challengeWord').textContent = w.en;
  if (w.phonetic) {
    document.getElementById('challengeWord').innerHTML = w.en + ' <small style="font-size:16px;color:var(--sub);">' + w.phonetic + '</small>';
  }

  // Generate 4 options: 1 correct + 3 distractors from same category or random
  var correctZh = w.zh;
  var distractors = buildDistractors(id, correctZh);

  var opts = [{ zh: correctZh, correct: true }];
  for (var i = 0; i < distractors.length; i++) {
    opts.push({ zh: distractors[i], correct: false });
  }
  shuffle(opts);

  var html = '';
  for (var i = 0; i < opts.length; i++) {
    html += '<button class="quiz-opt" onclick="handleChallengeClick(this)" data-correct="' + opts[i].correct + '">' + opts[i].zh + '</button>';
  }
  document.getElementById('challengeOpts').innerHTML = html;
  document.getElementById('challengeOpts').style.display = '';
}

function buildDistractors(excludeId, correctZh) {
  var pool = [];
  var w = words[excludeId];
  var allIds = Object.keys(words);

  // Prefer same category
  if (w.category) {
    for (var i = 0; i < allIds.length; i++) {
      if (allIds[i] !== excludeId && words[allIds[i]].category === w.category && words[allIds[i]].zh !== correctZh) {
        pool.push(words[allIds[i]].zh);
      }
    }
  }

  // Fill from any category
  if (pool.length < 3) {
    for (var i = 0; i < allIds.length; i++) {
      if (allIds[i] !== excludeId && words[allIds[i]].zh !== correctZh && pool.indexOf(words[allIds[i]].zh) === -1) {
        pool.push(words[allIds[i]].zh);
      }
    }
  }

  shuffle(pool);
  return pool.slice(0, 3);
}

// ── Answer ──

function handleChallengeClick(btn) {
  var correct = btn.getAttribute('data-correct') === 'true';
  var id = challengeWords[challengeIdx];
  var w = words[id];

  // Disable all buttons
  var btns = document.querySelectorAll('#challengeOpts .quiz-opt');
  for (var i = 0; i < btns.length; i++) {
    btns[i].disabled = true;
    if (btns[i].getAttribute('data-correct') === 'true') {
      btns[i].classList.add('correct');
    }
  }

  if (correct) {
    challengeCorrect++;
    // Advance Ebbinghaus stage
    scheduleReview(id, w.reviews ? w.reviews.length : 0);
    saveWords();
  } else {
    lives--;
    challengeWrongWords.push({ en: w.en, zh: w.zh, phonetic: w.phonetic });
    // Reset to stage 0
    w.reviews = [];
    w.nextReview = Date.now() + 86400000;
    w.status = 'learning';
    saveWords();
    btn.classList.add('wrong');
    updateChallengeHearts();

    if (lives <= 0) {
      setTimeout(challengeGameOver, 600);
      return;
    }
  }

  updateChallengeHearts();
  challengeIdx++;
  updateChallengeProgress();

  setTimeout(function() {
    renderChallengeCard();
  }, 300);
}

// ── Game Over ──

function challengeGameOver() {
  document.getElementById('challengeCard').style.display = 'none';
  document.getElementById('btnRestartChallenge').style.display = '';
  document.getElementById('btnChallengeDone').style.display = '';

  var result = document.getElementById('challengeResult');
  result.style.display = '';
  var missed = challengeWrongWords.map(function(w) {
    return '<div style="margin:4px 0;"><b>' + w.en + '</b> <span style="color:var(--sub);">' + (w.phonetic || '') + '</span> — ' + w.zh + '</div>';
  }).join('');

  result.innerHTML = '<div style="text-align:center;padding:24px;">' +
    '<div style="font-size:48px;margin-bottom:8px;">💔</div>' +
    '<h3 style="color:#d44;">挑战失败</h3>' +
    '<p style="color:var(--sub);margin:8px 0;">正确 ' + challengeCorrect + ' / ' + challengeWords.length + '</p>' +
    (challengeWrongWords.length > 0 ? '<div style="text-align:left;margin-top:12px;"><b>需要复习：</b>' + missed + '</div>' : '') +
    '</div>';
}

function challengeVictory() {
  document.getElementById('challengeCard').style.display = 'none';
  document.getElementById('btnRestartChallenge').style.display = '';
  document.getElementById('btnChallengeDone').style.display = '';

  var streakUpdated = false;
  var today = new Date().toISOString().slice(0, 10);
  if (challengeDate !== today) {
    challengeStreak++;
    challengeDate = today;
    localStorage.setItem('dada_cstreak', challengeStreak);
    localStorage.setItem('dada_cdate', challengeDate);
    streakUpdated = true;
  }
  document.getElementById('challengeStreakBadge').textContent = challengeStreak;

  var perfect = challengeWrongWords.length === 0;
  var result = document.getElementById('challengeResult');
  result.style.display = '';

  var depthContent = '';
  if (perfect && challengeWords.length > 0) {
    var sampleId = challengeWords[0];
    var w = words[sampleId];
    var rootHint = getEtymologyHint(w.en);
    if (rootHint) {
      depthContent = '<div style="background:#fdf5f1;border-radius:10px;padding:12px;margin-top:12px;text-align:left;">' +
        '<b>📖 深度内容解锁</b><br><span style="font-size:13px;color:var(--sub);">' + rootHint + '</span></div>';
    }
  }

  result.innerHTML = '<div style="text-align:center;padding:24px;">' +
    '<div style="font-size:48px;margin-bottom:8px;">' + (perfect ? '🏆' : '🎉') + '</div>' +
    '<h3 style="color:var(--accent2);">' + (perfect ? '完美通关！' : '挑战通关！') + '</h3>' +
    '<p style="color:var(--sub);margin:8px 0;">' + (perfect ? '零失误！' : '存活通过') + ' 正确 ' + challengeCorrect + ' / ' + challengeWords.length + '</p>' +
    '<p style="color:var(--accent);">🏆 连续挑战 ' + challengeStreak + ' 天</p>' +
    depthContent +
    '</div>';
}

// Simple etymology hints for common prefixes/roots
function getEtymologyHint(word) {
  var hints = {
    'abandon': 'a-（离开）+ bandon（控制）→ 放弃控制 → 抛弃',
    'abnormal': 'ab-（偏离）+ normal（正常）→ 反常的',
    'absence': 'ab-（离开）+ sence（存在）→ 缺席',
    'absorb': 'ab-（离开）+ sorb（吸）→ 吸走 → 吸收',
    'abstract': 'abs-（离开）+ tract（拉）→ 拉出来 → 抽象的',
    'accept': 'ac-（朝向）+ cept（拿）→ 拿过来 → 接受',
    'access': 'ac-（朝向）+ cess（走）→ 走向 → 进入',
    'accompany': 'ac-（朝向）+ company（伙伴）→ 陪伴',
    'accurate': 'ac-（朝向）+ cura（关心）→ 仔细的 → 精确的',
    'achieve': 'a-（到）+ chief（头）→ 到头 → 完成、实现',
    'active': 'act（做）+ -ive（形容词）→ 活跃的',
    'actual': 'act（做）+ -ual（形容词）→ 做出来的 → 实际的',
    'adapt': 'ad-（朝向）+ apt（适合）→ 使适合 → 适应',
    'addition': 'add（加）+ -ition（名词）→ 加法、增加',
    'address': 'ad-（朝向）+ dress（引导）→ 引导方向 → 地址',
    'adjust': 'ad-（朝向）+ just（正确）→ 使正确 → 调整',
    'adopt': 'ad-（朝向）+ opt（选择）→ 选择 → 采纳',
    'advance': 'adv-（向前）+ ance（走）→ 向前走 → 前进',
    'benefit': 'bene（好）+ fit（做）→ 做好事 → 利益、好处',
    'biology': 'bio（生命）+ logy（学科）→ 生物学',
    'bilingual': 'bi（二）+ lingual（语言的）→ 双语的',
    'century': 'cent（百）+ -ury → 一百年 → 世纪',
    'circumstance': 'circum（周围）+ stance（站）→ 站在周围 → 环境',
    'combine': 'com（一起）+ bine（二） → 合二为一 → 结合',
    'comfort': 'com（加强）+ fort（力量）→ 给予力量 → 安慰',
    'command': 'com（加强）+ mand（命令）→ 命令、指挥',
    'comment': 'com（加强）+ ment（思考）→ 评论',
    'compare': 'com（一起）+ par（相等）→ 放在一起 → 比较',
    'compete': 'com（一起）+ pete（追求）→ 一起追求 → 竞争',
    'complete': 'com（加强）+ plete（满）→ 填满 → 完成',
    'compose': 'com（一起）+ pose（放）→ 放在一起 → 组成',
    'concentrate': 'con（一起）+ centr（中心）+ ate → 集中',
    'conclude': 'con（一起）+ clude（关闭）→ 一起关闭 → 结束、结论',
    'condition': 'con（一起）+ dit（说）+ ion → 一起说好的 → 条件',
    'conduct': 'con（一起）+ duct（引导）→ 引导 → 行为、指挥',
    'confirm': 'con（加强）+ firm（坚定）→ 使坚定 → 确认',
    'connect': 'con（一起）+ nect（连接）→ 连接在一起',
    'consider': 'con（一起）+ sider（星星）→ 一起看星星 → 思考',
    'consist': 'con（一起）+ sist（站）→ 站在一起 → 由…组成',
    'construct': 'con（一起）+ struct（建造）→ 建造',
    'contain': 'con（一起）+ tain（持有）→ 持有在一起 → 包含',
    'content': 'con（一起）+ tent（持有）→ 持有的东西 → 内容',
    'continue': 'con（一起）+ tinue（保持）→ 保持在一起 → 继续',
    'contract': 'con（一起）+ tract（拉）→ 拉到一起 → 合同、收缩',
    'contribute': 'con（一起）+ tribute（给予）→ 贡献',
    'conversation': 'con（一起）+ vers（转）+ ation → 一起转来转去 → 对话',
    'convert': 'con（加强）+ vert（转）→ 转变',
    'convey': 'con（一起）+ vey（路）→ 一起上路 → 传达、运送',
    'cooperate': 'co（共同）+ operate（操作）→ 合作',
    'correct': 'cor（加强）+ rect（直）→ 使变直 → 纠正、正确的',
    'create': 'cre（生长）+ ate → 使生长 → 创造',
    'culture': 'cult（耕种）+ ure → 耕种出来的 → 文化',
    'decide': 'de（下）+ cide（切）→ 切下去 → 决定',
    'decline': 'de（下）+ cline（倾斜）→ 向下倾斜 → 下降、拒绝',
    'decrease': 'de（下）+ crease（增长）→ 向下增长 → 减少',
    'defend': 'de（离开）+ fend（打击）→ 挡开打击 → 防守',
    'define': 'de（下）+ fine（界限）→ 定下界限 → 定义',
    'degree': 'de（下）+ gree（步）→ 下一步 → 程度、学位',
    'deliver': 'de（离开）+ liver（自由）→ 使自由 → 释放、投递',
    'demand': 'de（下）+ mand（命令）→ 下命令 → 要求',
    'depend': 'de（下）+ pend（悬挂）→ 挂在下面 → 依赖',
    'describe': 'de（下）+ scribe（写）→ 写下来 → 描述',
    'design': 'de（下）+ sign（标记）→ 做标记 → 设计',
    'desire': 'de（来自）+ sire（星星）→ 来自星星的 → 渴望',
    'destroy': 'de（相反）+ struct（建造）→ 反建造 → 破坏',
    'determine': 'de（下）+ termine（界限）→ 定下界限 → 决定',
    'develop': 'de（相反）+ velop（包裹）→ 打开包裹 → 发展',
    'differ': 'dif（分开）+ fer（携带）→ 分开带 → 不同',
    'digest': 'di（分开）+ gest（携带）→ 分开携带 → 消化',
    'direct': 'di（分开）+ rect（直）→ 直的 → 直接的、指导',
    'discover': 'dis（相反）+ cover（盖）→ 揭开盖子 → 发现',
    'discuss': 'dis（分开）+ cuss（摇动）→ 分开讨论 → 讨论',
    'display': 'dis（相反）+ play（折叠）→ 展开 → 展示',
    'distance': 'di（分开）+ stance（站）→ 分开站 → 距离',
    'distribute': 'dis（分开）+ tribute（给予）→ 分开给予 → 分配',
    'document': 'docu（教）+ ment → 教学材料 → 文件',
    'economy': 'eco（家）+ nomy（管理）→ 家庭管理 → 经济',
    'education': 'e（出）+ duc（引导）+ ation → 引导出来 → 教育',
    'effect': 'ef（出）+ fect（做）→ 做出来 → 效果',
    'effort': 'ef（出）+ fort（力量）→ 使出力量 → 努力',
    'emotion': 'e（出）+ motion（动）→ 心里的动 → 情绪',
    'employ': 'em（进入）+ ploy（折叠）→ 卷入 → 雇佣',
    'encourage': 'en（使）+ courage（勇气）→ 使有勇气 → 鼓励',
    'energy': 'en（在…内）+ ergy（工作）→ 内在的工作能力 → 能量',
    'engine': 'en（在…内）+ gine（产生）→ 内在产生力量 → 引擎',
    'enjoy': 'en（使）+ joy（快乐）→ 使快乐 → 享受',
    'enough': 'e（加强）+ nough（足够）→ 足够的',
    'enter': 'en（进入）+ ter → 进入',
    'environment': 'environ（环绕）+ ment → 环境',
    'escape': 'es（出）+ cape（斗篷）→ 从斗篷中出来 → 逃脱',
    'establish': 'e（加强）+ stabl（站立）+ ish → 使站立 → 建立',
    'evidence': 'e（出）+ vid（看）+ ence → 看出 → 证据',
    'examine': 'ex（出）+ amine（检查）→ 检查出来 → 检验',
    'example': 'ex（出）+ ample（样本）→ 拿出的样本 → 例子',
    'excellent': 'ex（出）+ cell（升）+ ent → 出众的 → 优秀的',
    'except': 'ex（出）+ cept（拿）→ 拿出来 → 除…外',
    'exchange': 'ex（出）+ change（换）→ 换出去 → 交换',
    'excite': 'ex（出）+ cite（唤起）→ 唤起 → 兴奋',
    'exercise': 'ex（出）+ ercise（练习）→ 练习',
    'exhibit': 'ex（出）+ hibit（持有）→ 拿出来 → 展览',
    'exist': 'ex（出）+ sist（站）→ 站出来 → 存在',
    'expect': 'ex（出）+ spect（看）→ 向外看 → 期待',
    'expense': 'ex（出）+ pense（称量）→ 称量出去 → 花费',
    'experience': 'ex（出）+ peri（尝试）+ ence → 尝试出来的 → 经验',
    'experiment': 'ex（出）+ peri（尝试）+ ment → 实验',
    'explain': 'ex（出）+ plain（平）→ 铺平说清楚 → 解释',
    'explore': 'ex（出）+ plore（喊叫）→ 喊出来 → 探索',
    'export': 'ex（出）+ port（运）→ 运出去 → 出口',
    'express': 'ex（出）+ press（压）→ 压出来 → 表达',
    'extend': 'ex（出）+ tend（伸展）→ 伸展出去 → 扩展',
    'extra': 'ex（超出）+ tra → 额外的',
    'extreme': 'ex（超出）+ treme（界限）→ 超出界限 → 极端的',
    'fact': 'fact（做）→ 做出来的事 → 事实',
    'factory': 'fact（做）+ ory（地点）→ 制造东西的地方 → 工厂',
    'familiar': 'famili（家庭）+ ar → 像家人一样的 → 熟悉的',
    'famous': 'fam（名誉）+ ous → 有名誉的 → 著名的',
    'finance': 'fin（结束）+ ance → 结束债务 → 金融',
    'finish': 'fin（结束）+ ish → 结束',
    'flexible': 'flex（弯曲）+ ible（能…的）→ 能弯曲的 → 灵活的',
    'forecast': 'fore（前）+ cast（投射）→ 预先投射 → 预报',
    'foreign': 'fore（外）+ ign → 外面的 → 外国的',
    'forget': 'for（离开）+ get（得到）→ 离开得到的东西 → 忘记',
    'forgive': 'for（离开）+ give（给）→ 给出去 → 原谅',
    'forward': 'fore（前）+ ward（向）→ 向前',
    'freedom': 'free（自由）+ dom（状态）→ 自由',
    'frequent': 'frequ（频繁）+ ent → 频繁的',
    'generate': 'gener（产生）+ ate → 产生、生成',
    'geography': 'geo（地）+ graphy（写）→ 写地的 → 地理',
    'geometry': 'geo（地）+ metry（测量）→ 测量地 → 几何',
    'govern': 'govern（驾驶船）→ 驾驶 → 治理',
    'graduate': 'gradu（步）+ ate → 一步步完成 → 毕业',
    'grammar': 'gram（写）+ mar → 写字的规则 → 语法',
    'gratitude': 'grat（感谢）+ itude → 感激',
    'guarantee': 'guarant（保证）+ ee → 保证',
    'harmony': 'harmo（和谐）+ ny → 和谐',
    'hesitate': 'hes（粘住）+ itate → 粘住不动 → 犹豫',
    'history': 'histor（知道）+ y → 知道过去 → 历史',
    'honest': 'hon（荣誉）+ est → 有荣誉的 → 诚实的',
    'horizon': 'horiz（界限）+ on → 界限 → 地平线',
    'humorous': 'humor（幽默）+ ous → 幽默的',
    'identify': 'ident（相同）+ ify → 认出相同 → 识别',
    'ignore': 'i（不）+ gnore（知道）→ 假装不知道 → 忽视',
    'imagine': 'imagin（形象）+ e → 在脑中有形象 → 想象',
    'imitate': 'imit（模仿）+ ate → 模仿',
    'immediate': 'im（不）+ medi（中间）+ ate → 没有中间环节的 → 立即的',
    'immigrant': 'im（进入）+ migr（迁移）+ ant → 迁入的人 → 移民',
    'impact': 'im（进入）+ pact（压紧）→ 压入 → 冲击、影响',
    'import': 'im（进入）+ port（运）→ 运进来 → 进口',
    'important': 'im（进入）+ port（运）+ ant → 运进来的 → 重要的',
    'impress': 'im（进入）+ press（压）→ 压进去 → 留下印象',
    'improve': 'im（使）+ prove（利益）→ 使有利 → 改善',
    'include': 'in（进入）+ clude（关闭）→ 关进去 → 包含',
    'income': 'in（进入）+ come（来）→ 进来的 → 收入',
    'increase': 'in（进入）+ crease（增长）→ 增长',
    'indicate': 'in（进入）+ dic（说）+ ate → 说出来 → 指示',
    'individual': 'in（不）+ divid（分开）+ ual → 不可分的 → 个人的',
    'industry': 'indu（在内）+ stry（建造）→ 内在建造 → 工业',
    'influence': 'in（进入）+ flu（流）+ ence → 流入 → 影响',
    'inform': 'in（进入）+ form（形状）→ 输入形状 → 通知',
    'initial': 'in（进入）+ it（走）+ ial → 走入的 → 开始的',
    'injure': 'in（不）+ jure（法律）→ 不公正 → 伤害',
    'innocent': 'in（不）+ noc（伤害）+ ent → 没伤害的 → 无辜的',
    'insect': 'in（进入）+ sect（切）→ 切进去的身体 → 昆虫',
    'insert': 'in（进入）+ sert（放）→ 放入 → 插入',
    'inside': 'in（在…内）+ side（边）→ 里边 → 内部',
    'insist': 'in（进入）+ sist（站）→ 站进去 → 坚持',
    'inspect': 'in（进入）+ spect（看）→ 看进去 → 检查',
    'inspire': 'in（进入）+ spire（呼吸）→ 吸入 → 激励',
    'install': 'in（进入）+ stall（放）→ 放入 → 安装',
    'instance': 'in（进入）+ stance（站）→ 站出来的 → 例子',
    'instant': 'in（不）+ stant（站立）→ 不能站立的 → 瞬间',
    'instead': 'in（在…内）+ stead（位置）→ 在位置内 → 代替',
    'institute': 'in（进入）+ stitute（建立）→ 建立 → 学会、学院',
    'instruct': 'in（进入）+ struct（建造）→ 在脑中建造 → 教导',
    'intend': 'in（进入）+ tend（伸展）→ 向内伸展 → 打算',
    'intense': 'in（加强）+ tense（伸展）→ 强力伸展 → 强烈的',
    'interest': 'inter（在…之间）+ est（存在）→ 在中间存在 → 兴趣',
    'interfere': 'inter（在…之间）+ fere（打击）→ 在中间打 → 干涉',
    'international': 'inter（在…之间）+ nation（国家）+ al → 国际的',
    'interrupt': 'inter（在…之间）+ rupt（断裂）→ 在中间断裂 → 打断',
    'introduce': 'intro（向内）+ duce（引导）→ 引入 → 介绍',
    'invent': 'in（进入）+ vent（来）→ 走进来 → 发明',
    'invest': 'in（进入）+ vest（衣服）→ 穿上衣服 → 投入 → 投资',
    'investigate': 'in（进入）+ vestigate（跟踪）→ 跟踪进去 → 调查',
    'involve': 'in（进入）+ volve（卷）→ 卷入 → 涉及',
    'isolate': 'isol（岛）+ ate → 变成孤岛 → 隔离',
    'journey': 'jour（一日）+ ney → 一日行程 → 旅程',
    'judge': 'jud（法律）+ ge → 按法律判断 → 法官、判断',
    'justice': 'just（公正）+ ice → 公正',
    'justify': 'just（公正）+ ify → 使公正 → 辩护',
    'knowledge': 'know（知道）+ ledge → 知道的东西 → 知识',
    'language': 'langu（舌头）+ age → 用舌头说的 → 语言',
    'liberate': 'liber（自由）+ ate → 使自由 → 解放',
    'library': 'libr（书）+ ary（地点）→ 放书的地方 → 图书馆',
    'license': 'lic（允许）+ ense → 许可证',
    'locate': 'loc（地方）+ ate → 找地方 → 定位',
    'logical': 'log（言语、逻辑）+ ical → 逻辑的',
    'magnificent': 'magni（大）+ fic（做）+ ent → 做大 → 壮丽的',
    'maintain': 'main（手）+ tain（持）→ 手持 → 维持',
    'manage': 'man（手）+ age → 用手做 → 管理',
    'manufacture': 'manu（手）+ fact（做）+ ure → 用手做 → 制造',
    'maximum': 'max（最大）+ imum → 最大量',
    'meaning': 'mean（意味）+ ing → 意思',
    'measure': 'meas（测量）+ ure → 测量',
    'medicine': 'med（治疗）+ icine → 医学、药',
    'memory': 'memor（记忆）+ y → 记忆',
    'mental': 'ment（心智）+ al → 心智的',
    'message': 'mess（送）+ age → 送的东西 → 消息',
    'method': 'method（方法）→ 方法',
    'migrate': 'migr（迁移）+ ate → 迁移',
    'military': 'milit（士兵）+ ary → 军事的',
    'million': 'milli（千）+ on → 一千千 → 百万',
    'minimum': 'min（小）+ imum → 最小量',
    'miracle': 'mir（惊奇）+ acle → 惊奇的事 → 奇迹',
    'mistake': 'mis（错误）+ take（拿）→ 拿错 → 错误',
    'misunderstand': 'mis（错误）+ understand（理解）→ 误解',
    'mixture': 'mix（混合）+ ture → 混合物',
    'modern': 'mod（模式）+ ern → 新模式 → 现代的',
    'modify': 'mod（方式）+ ify → 使合方式 → 修改',
    'monitor': 'mon（警告）+ itor → 警告的人 → 班长、监控',
    'movement': 'move（移动）+ ment → 移动 → 运动',
    'multiply': 'multi（多）+ ply（折叠）→ 多次折叠 → 乘、增加',
    'muscle': 'mus（老鼠）+ cle（小）→ 小老鼠 → 肌肉',
    'museum': 'muse（缪斯、灵感）+ um → 灵感之地 → 博物馆',
    'nation': 'nat（出生）+ ion → 出生地 → 国家',
    'native': 'nat（出生）+ ive → 本地的',
    'natural': 'natur（自然）+ al → 自然的',
    'necessary': 'ne（不）+ cess（走）+ ary → 走不了的 → 必要的',
    'negative': 'neg（否定）+ ative → 否定的',
    'neglect': 'neg（不）+ lect（选）→ 不选 → 忽视',
    'negotiate': 'neg（不）+ oti（闲暇）+ ate → 不闲暇 → 谈判',
    'neighbor': 'neigh（近）+ bor（居住者）→ 近的居住者 → 邻居',
    'nervous': 'nerv（神经）+ ous → 神经紧张的',
    'network': 'net（网）+ work（工作）→ 网络',
    'normal': 'norm（标准）+ al → 标准的 → 正常的',
    'notable': 'not（知道）+ able → 可知道的 → 显著的',
    'notice': 'not（知道）+ ice → 知道 → 注意',
    'notify': 'not（知道）+ ify → 使知道 → 通知',
    'numerous': 'numer（数量）+ ous → 数量多的',
    'object': 'ob（对面）+ ject（扔）→ 扔到对面 → 反对；物体',
    'objective': 'ob（对面）+ ject（扔）+ ive → 扔向对面的 → 目标；客观的',
    'oblige': 'ob（朝向）+ lige（绑）→ 绑向 → 迫使',
    'observe': 'ob（朝）+ serve（保持）→ 保持观察 → 观察',
    'obtain': 'ob（加强）+ tain（持）→ 拿到 → 获得',
    'obvious': 'ob（对面）+ vious（路）→ 路对面的 → 明显的',
    'occupy': 'oc（加强）+ cupy（抓住）→ 抓住 → 占据',
    'offend': 'of（对面）+ fend（打击）→ 打击对面 → 冒犯',
    'offer': 'of（向）+ fer（带）→ 带去 → 提供',
    'operate': 'oper（工作）+ ate → 操作',
    'opinion': 'opin（观点）+ ion → 意见',
    'oppose': 'op（对面）+ pose（放）→ 放在对面 → 反对',
    'opposite': 'op（对面）+ pos（放）+ ite → 放在对面的 → 相反的',
    'optimistic': 'opt（最好）+ imistic → 想最好的 → 乐观的',
    'ordinary': 'ordin（顺序）+ ary → 按顺序的 → 普通的',
    'organize': 'organ（器官、组织）+ ize → 组织',
    'original': 'origin（起源）+ al → 原始的',
    'otherwise': 'other（其他）+ wise（方式）→ 另外的方式 → 否则',
    'outline': 'out（外）+ line（线）→ 外线 → 轮廓、大纲',
    'overcome': 'over（过）+ come（来）→ 过来 → 克服',
    'overlook': 'over（上）+ look（看）→ 从上面看 → 俯瞰、忽略',
    'overtake': 'over（过）+ take（拿）→ 拿过 → 超越',
    'participate': 'part（部分）+ cip（拿）+ ate → 拿一部分 → 参与',
    'particular': 'part（部分）+ icular → 关注部分的 → 特别的',
    'passage': 'pass（通过）+ age → 通过的路 → 通道、段落',
    'passenger': 'pass（通过）+ enger → 通过的人 → 乘客',
    'patience': 'pati（受苦）+ ence → 忍受 → 耐心',
    'patient': 'pati（受苦）+ ent → 受苦的人 → 病人；耐心的',
    'percent': 'per（每）+ cent（百）→ 每百分之一 → 百分比',
    'perform': 'per（彻底）+ form（形成）→ 彻底形成 → 执行、表演',
    'period': 'peri（周围）+ od（路）→ 周围的路 → 周期',
    'permanent': 'per（贯穿）+ man（保持）+ ent → 一直保持 → 永久的',
    'permit': 'per（通过）+ mit（送）→ 允许通过 → 许可',
    'person': 'per（通过）+ son（声音）→ 通过声音 → 人',
    'persuade': 'per（彻底）+ suade（建议）→ 彻底建议 → 说服',
    'photograph': 'photo（光）+ graph（写）→ 用光写 → 照片',
    'physics': 'phys（自然）+ ics → 自然科学 → 物理',
    'planet': 'plan（平）+ et → 平坦的天体 → 行星',
    'pollution': 'pollut（弄脏）+ ion → 污染',
    'popular': 'popul（人民）+ ar → 人民的 → 流行的',
    'portable': 'port（携带）+ able → 可携带的 → 便携的',
    'position': 'posit（放）+ ion → 放的地方 → 位置',
    'positive': 'posit（放）+ ive → 确定放好的 → 肯定的、积极的',
    'possess': 'pos（能）+ sess（坐）→ 能坐在上面 → 拥有',
    'possible': 'poss（能）+ ible → 可能的',
    'potential': 'potent（力量）+ ial → 有力量的 → 潜在的、潜力',
    'practice': 'pract（做）+ ice → 反复做 → 练习',
    'predict': 'pre（前）+ dict（说）→ 提前说 → 预言',
    'prefer': 'pre（前）+ fer（带）→ 带到前面 → 偏爱',
    'prepare': 'pre（前）+ pare（准备）→ 提前准备 → 准备',
    'preposition': 'pre（前）+ position（位置）→ 放在前面的 → 介词',
    'prescribe': 'pre（前）+ scribe（写）→ 提前写好 → 开处方',
    'preserve': 'pre（前）+ serve（保持）→ 提前保存 → 保存',
    'pretend': 'pre（前）+ tend（伸展）→ 向前表现 → 假装',
    'prevent': 'pre（前）+ vent（来）→ 先来一步 → 阻止',
    'previous': 'pre（前）+ vious（路）→ 前面的路 → 先前的',
    'primary': 'prim（第一）+ ary → 第一的 → 主要的',
    'principle': 'prin（第一）+ cip（拿）+ le → 最先拿的 → 原则',
    'private': 'priv（个人）+ ate → 个人的',
    'probable': 'prob（证明）+ able → 可证明的 → 可能的',
    'proceed': 'pro（向前）+ ceed（走）→ 向前走 → 继续',
    'process': 'pro（向前）+ cess（走）→ 向前走 → 过程',
    'produce': 'pro（向前）+ duce（引导）→ 向前引出 → 生产',
    'profession': 'pro（向前）+ fess（说）+ ion → 公开说 → 职业',
    'profit': 'pro（向前）+ fit（做）→ 向前做 → 利润',
    'progress': 'pro（向前）+ gress（走）→ 向前走 → 进步',
    'project': 'pro（向前）+ ject（扔）→ 扔向前 → 项目、投射',
    'promise': 'pro（向前）+ mise（送）→ 送向前 → 承诺',
    'promote': 'pro（向前）+ mote（移动）→ 向前移动 → 提升',
    'pronounce': 'pro（向前）+ nounce（说）→ 说出 → 发音',
    'proper': 'proper（自己的）→ 合适的',
    'property': 'proper（自己的）+ ty → 自己的东西 → 财产',
    'propose': 'pro（向前）+ pose（放）→ 向前放 → 提议',
    'protect': 'pro（向前）+ tect（盖）→ 盖在前面 → 保护',
    'provide': 'pro（向前）+ vide（看）→ 向前看 → 提供',
    'public': 'publ（人民）+ ic → 人民的 → 公共的',
    'publish': 'publ（人民）+ ish → 给人民看 → 出版',
    'punish': 'pun（惩罚）+ ish → 惩罚',
    'purchase': 'pur（向前）+ chase（追）→ 追着买 → 购买',
    'purpose': 'pur（向前）+ pose（放）→ 放在前面的 → 目的',
    'quality': 'qual（什么）+ ity → 什么样的 → 质量',
    'quantity': 'quant（多少）+ ity → 多少 → 数量',
    'question': 'quest（寻求）+ ion → 寻求答案 → 问题',
    'realize': 'real（真实）+ ize → 使真实 → 实现、意识到',
    'receive': 're（回）+ ceive（拿）→ 拿回来 → 收到',
    'recognize': 're（再）+ cogn（知道）+ ize → 再次知道 → 认出',
    'recommend': 're（再）+ commend（赞扬）→ 再次赞扬 → 推荐',
    'record': 're（再）+ cord（心）→ 再次记在心里 → 记录',
    'recover': 're（再）+ cover（盖）→ 重新盖好 → 恢复',
    'reduce': 're（回）+ duce（引导）→ 引回 → 减少',
    'refer': 're（回）+ fer（带）→ 带回 → 参考、提及',
    'reflect': 're（回）+ flect（弯曲）→ 弯回 → 反射、反思',
    'reform': 're（再）+ form（形状）→ 再形成 → 改革',
    'regard': 're（再）+ gard（看）→ 再看 → 视为',
    'region': 'reg（统治）+ ion → 统治范围 → 地区',
    'register': 're（再）+ gister（带）→ 再带回 → 登记',
    'regret': 're（再）+ gret（哭）→ 再哭 → 后悔',
    'regular': 'reg（规则）+ ular → 规则的 → 定期的',
    'reject': 're（回）+ ject（扔）→ 扔回 → 拒绝',
    'relate': 're（回）+ late（带）→ 带回 → 关联',
    'relax': 're（回）+ lax（松）→ 松回 → 放松',
    'release': 're（回）+ lease（松）→ 松回 → 释放',
    'relief': 're（回）+ lief（轻）→ 变轻 → 减轻、安慰',
    'religion': 're（再）+ lig（绑）+ ion → 再绑在一起 → 宗教',
    'rely': 're（再）+ ly（绑）→ 再绑在一起 → 依赖',
    'remain': 're（回）+ main（留）→ 留下 → 保持、剩余',
    'remark': 're（再）+ mark（标记）→ 再标记 → 评论',
    'remember': 're（再）+ member（记忆）→ 再记忆 → 记住',
    'remind': 're（再）+ mind（心）→ 再放在心上 → 提醒',
    'remove': 're（回）+ move（移）→ 移回 → 移除',
    'repeat': 're（再）+ peat（寻求）→ 再次寻求 → 重复',
    'replace': 're（回）+ place（放）→ 放回 → 替换',
    'reply': 're（回）+ ply（折叠）→ 折回 → 回复',
    'report': 're（回）+ port（带）→ 带回消息 → 报告',
    'represent': 're（再）+ present（呈现）→ 再次呈现 → 代表',
    'require': 're（再）+ quire（寻求）→ 再次寻求 → 要求',
    'reserve': 're（回）+ serve（保持）→ 保持回 → 保留',
    'resign': 're（回）+ sign（标记）→ 退回标记 → 辞职',
    'resist': 're（回）+ sist（站）→ 站回 → 抵抗',
    'resolve': 're（再）+ solve（解）→ 再解决 → 决心',
    'respect': 're（再）+ spect（看）→ 再看 → 尊重',
    'respond': 're（回）+ spond（承诺）→ 承诺回 → 回应',
    'responsible': 're（回）+ spons（承诺）+ ible → 回应承诺的 → 负责的',
    'restore': 're（再）+ store（建）→ 再建 → 恢复',
    'restrict': 're（回）+ strict（拉紧）→ 拉紧回 → 限制',
    'result': 're（回）+ sult（跳）→ 跳回 → 结果',
    'retire': 're（回）+ tire（拉）→ 拉回 → 退休',
    'return': 're（回）+ turn（转）→ 转回 → 返回',
    'reveal': 're（回）+ veal（面纱）→ 揭开面纱 → 揭示',
    'revenue': 're（回）+ venue（来）→ 回来 → 收入',
    'reverse': 're（回）+ verse（转）→ 转回 → 逆转',
    'review': 're（再）+ view（看）→ 再看 → 复习',
    'revise': 're（再）+ vise（看）→ 再看 → 修订',
    'revolution': 're（回）+ volut（转）+ ion → 转回 → 革命',
    'satellite': 'satell（随从）+ ite → 卫星',
    'satisfy': 'satis（足够）+ fy（做）→ 做足够 → 满足',
    'schedule': 'sched（纸片）+ ule → 纸片 → 时间表',
    'science': 'sci（知道）+ ence → 知识 → 科学',
    'section': 'sect（切）+ ion → 切开的部分 → 部分',
    'select': 'se（分开）+ lect（选）→ 分开选 → 选择',
    'sensation': 'sens（感觉）+ ation → 感觉、轰动',
    'sentence': 'sent（感觉）+ ence → 感觉的表达 → 句子',
    'separate': 'se（分开）+ par（准备）+ ate → 分开准备 → 分开',
    'service': 'serv（服务）+ ice → 服务',
    'session': 'sess（坐）+ ion → 坐下的时间 → 会议、时段',
    'signal': 'sign（标记）+ al → 标记 → 信号',
    'similar': 'simil（相似）+ ar → 相似的',
    'simplify': 'simpli（简单）+ fy → 使简单',
    'situation': 'situ（位置）+ ation → 所处的位置 → 情况',
    'society': 'soci（同伴）+ ety → 同伴关系 → 社会',
    'solution': 'solut（解开）+ ion → 解开的方法 → 解决方案',
    'specific': 'speci（种类）+ fic（做）→ 做成种类的 → 具体的',
    'standard': 'stand（站）+ ard → 站住的标准 → 标准',
    'statement': 'state（陈述）+ ment → 陈述',
    'straight': 'straight（直的）→ 直的',
    'strategy': 'strat（军队）+ egy → 军队的 → 策略',
    'strength': 'strength（力量）→ 力量',
    'structure': 'struct（建）+ ure → 建起来的东西 → 结构',
    'struggle': 'struggle（挣扎）→ 挣扎、斗争',
    'subject': 'sub（下）+ ject（扔）→ 扔到下面的 → 主题、科目',
    'submarine': 'sub（下）+ marine（海）→ 海下的 → 潜艇',
    'submit': 'sub（下）+ mit（送）→ 从下送上 → 提交',
    'substance': 'sub（下）+ stance（站）→ 站在下面的 → 物质',
    'substitute': 'sub（下）+ stitute（站）→ 站在下面 → 替代',
    'succeed': 'suc（下）+ ceed（走）→ 走下去 → 成功',
    'success': 'suc（下）+ cess（走）→ 走下去 → 成功',
    'sufficient': 'suf（下）+ fic（做）+ ient → 做够的 → 足够的',
    'suggest': 'sug（下）+ gest（带）→ 从下带上来 → 建议',
    'summarize': 'summ（总和）+ arize → 总合 → 总结',
    'supervise': 'super（上）+ vise（看）→ 从上往下看 → 监督',
    'supply': 'sup（下）+ ply（填满）→ 从下填满 → 供应',
    'support': 'sup（下）+ port（带）→ 从下面带 → 支持',
    'suppose': 'sup（下）+ pose（放）→ 放在下面 → 假设',
    'surface': 'sur（上）+ face（面）→ 上面 → 表面',
    'surplus': 'sur（上）+ plus（更多）→ 更多 → 过剩',
    'surround': 'sur（上）+ round（圆）→ 在上面围圈 → 包围',
    'survive': 'sur（上）+ vive（活）→ 活在上面 → 生存',
    'suspect': 'sus（下）+ spect（看）→ 从下看 → 怀疑',
    'suspend': 'sus（下）+ pend（挂）→ 挂在下面 → 暂停',
    'sustain': 'sus（下）+ tain（持）→ 在下面持 → 维持',
    'symbol': 'sym（一起）+ bol（扔）→ 扔在一起 → 符号',
    'sympathy': 'sym（一起）+ pathy（感情）→ 一起的感情 → 同情',
    'system': 'sy（一起）+ stem（站）→ 站在一起 → 系统',
    'technique': 'techn（技艺）+ ique → 技术',
    'technology': 'techno（技艺）+ logy（学科）→ 技术学科',
    'telephone': 'tele（远）+ phone（声音）→ 远方声音 → 电话',
    'temperature': 'temper（调节）+ ature → 调节的 → 温度',
    'temporary': 'tempor（时间）+ ary → 一时的 → 暂时的',
    'terminal': 'termin（界限）+ al → 界限的 → 终点的',
    'territory': 'terr（土地）+ itory → 土地 → 领土',
    'thermometer': 'thermo（热）+ meter（测量）→ 测量热 → 温度计',
    'thorough': 'thor（贯穿）+ ough → 贯穿的 → 彻底的',
    'tournament': 'tourn（转）+ ament → 轮流比 → 锦标赛',
    'tradition': 'tra（跨）+ dit（给）+ ion → 跨代给 → 传统',
    'transfer': 'trans（跨）+ fer（带）→ 跨带 → 转移',
    'transform': 'trans（跨）+ form（形状）→ 跨形状 → 改变',
    'translate': 'trans（跨）+ late（带）→ 跨语言带 → 翻译',
    'transmit': 'trans（跨）+ mit（送）→ 跨送 → 传输',
    'transport': 'trans（跨）+ port（带）→ 跨带 → 运输',
    'tunnel': 'tun（桶）+ nel → 桶状 → 隧道',
    'unanimous': 'un（一）+ anim（心）+ ous → 一心一意的 → 一致同意的',
    'uncle': 'un（不）+ cle → 不是父亲 → 叔叔',
    'undergo': 'under（下）+ go（走）→ 在下面走 → 经历',
    'underground': 'under（下）+ ground（地）→ 地下的',
    'underline': 'under（下）+ line（线）→ 下划线',
    'understand': 'under（下）+ stand（站）→ 站在下面 → 理解',
    'unique': 'uni（一）+ que → 独一无二的',
    'unite': 'uni（一）+ te → 统一',
    'universe': 'uni（一）+ verse（转）→ 一起转 → 宇宙',
    'university': 'uni（一）+ vers（转）+ ity → 统一 → 大学',
    'urgent': 'urg（催促）+ ent → 催促的 → 紧急的',
    'usual': 'usu（用）+ al → 常用的 → 通常的',
    'value': 'val（强）+ ue → 强的地方 → 价值',
    'various': 'vari（变化）+ ous → 多样的',
    'vehicle': 'veh（运）+ icle → 运输工具 → 车辆',
    'version': 'vers（转）+ ion → 转过来的 → 版本',
    'victory': 'vict（征服）+ ory → 征服 → 胜利',
    'violence': 'viol（力量）+ ence → 暴力',
    'vision': 'vis（看）+ ion → 视力、视野',
    'vocabulary': 'voc（声音）+ abulary → 词汇',
    'volcano': 'volcan（火神）+ o → 火山',
    'volume': 'vol（卷）+ ume → 卷 → 体积、音量',
    'voluntary': 'volunt（意愿）+ ary → 意愿的 → 自愿的'
  };
  return hints[word.toLowerCase()] || '';
}

function restartChallenge() {
  buildChallenge();
}
