/* =====================================================================
 * PET Kids 40天计划 - 核心应用逻辑 (app.js)
 * 技术栈：单文件 HTML + Tailwind(CDN) + Vanilla JS
 * 对应方案：第4节功能 / 第6节40天计划 / 第8节复习算法 / 第9节组件
 * ===================================================================== */

'use strict';

/* =====================================================================
 * 0. 全局状态与常量
 * ===================================================================== */

const TOTAL_DAYS = 40;
const LEARN_DAYS = 35;            // 前35天引入新词
const REVIEW_DAYS = TOTAL_DAYS - LEARN_DAYS; // 36-40 全面复习
const STORAGE_KEY = 'pet_progress_v1';
const DAILY_NEW_MAX = 6;          // 每日新词上限（复习算法避免疲劳）
const DAILY_REVIEW_MAX = 18;      // 每日复习上限
const PRACTICE_QUIZ_SIZE = 10;    // 练习中心每轮题数
const TEST_DAILY_Q = 10;
const TEST_STAGE_Q = 20;
const TEST_FINAL_Q = 40;

// 徽章定义（方案第6节奖励规则）
const BADGES = [
  { id: 'first_step',   icon: '🐾', name: '入门先锋',  desc: '完成第1天学习',      check: s => s.currentDay >= 1 && dayCompleted(1) },
  { id: 'streak_10',    icon: '🔥', name: '10天坚持',  desc: '连续打卡10天',      check: s => s.streak >= 10 },
  { id: 'streak_40',    icon: '🏆', name: '40天冠军',  desc: '完成40天挑战',      check: s => s.currentDay >= 40 },
  { id: 'spelling_200', icon: '⌨️', name: '拼写之星',  desc: '累计拼写正确200次', check: s => s.stats.spellingCorrect >= 200 },
  { id: 'stars_500',    icon: '⭐', name: '星星收集者', desc: '累计获得500星星',   check: s => s.totalStars >= 500 },
  { id: 'stars_2000',   icon: '🌟', name: '星星大师',  desc: '累计获得2000星星',  check: s => s.totalStars >= 2000 },
  { id: 'master_half',  icon: '📖', name: '小书虫',    desc: '掌握50%单词',       check: s => masteredCount() >= totalVocab() * 0.5 },
  { id: 'master_all',   icon: '🎓', name: '词汇大师',  desc: '掌握全部单词',      check: s => masteredCount() >= totalVocab() },
  { id: 'test_perfect', icon: '💯', name: '满分选手',  desc: '任一测试得满分',    check: s => s.stats.testPerfectCount >= 1 },
  { id: 'wrong_clear',  icon: '🧹', name: '错题清零',  desc: '错题本清空',        check: s => s.wrongWords.length === 0 && s.stats.spellingCorrect > 0 },
];

// 默认状态
function defaultState() {
  return {
    currentDay: 1,
    streak: 0,
    lastActiveDate: null,        // YYYY-MM-DD
    totalStars: 0,
    badges: [],                  // 已解锁 badge id
    wordMastery: {},             // { wordId: { level, lastReviewed, correctStreak, wrongCount } }
    dailyRecords: {},            // { day: { newLearned:[], practiceCorrect, stars, completed } }
    wrongWords: [],              // 错题池 wordId
    stats: { spellingCorrect: 0, testPerfectCount: 0 },
    reducedMotion: false,
    // 今日运行时缓存（不必持久化，但保留以便恢复）
    _todayLearnedQueue: [],
  };
}

let appState = defaultState();
let VOCAB = []; // 延迟到 init() 里从 window.PET_VOCAB 赋值，避免大文件解析时序问题

/* =====================================================================
 * 1. 工具函数
 * ===================================================================== */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function totalVocab() { return VOCAB.length; }

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function getWord(id) { return VOCAB.find(w => w.id === id); }

function masteredCount() {
  return Object.values(appState.wordMastery).filter(m => m.level >= 4).length;
}

// 字母比较（忽略大小写）
function norm(s) { return (s || '').toLowerCase().trim(); }

/* =====================================================================
 * 2. 持久化：localStorage 同步
 * ===================================================================== */
function saveState() {
  try {
    const persist = { ...appState };
    delete persist._todayLearnedQueue; // 运行时缓存不保存
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persist));
  } catch (e) { console.warn('保存失败', e); }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      appState = Object.assign(defaultState(), parsed);
      appState._todayLearnedQueue = [];
    }
  } catch (e) { console.warn('读取失败', e); }
}

/* =====================================================================
 * 3. 40天学习计划生成（方案第6节）
 *    前 LEARN_DAYS 天平均分配新词；后 REVIEW_DAYS 天无新词专注复习。
 * ===================================================================== */
function buildPlan() {
  const N = totalVocab();
  const perDay = Math.ceil(N / LEARN_DAYS);          // 每日新词数
  const plan = [];
  const ids = VOCAB.map(w => w.id);                   // 按词库顺序分配

  for (let day = 1; day <= TOTAL_DAYS; day++) {
    let newWords = [];
    let stage = '基础建立';
    let reviewFocus = '';
    let activity = '';
    let stars = 80;

    if (day <= LEARN_DAYS) {
      const start = (day - 1) * perDay;
      newWords = ids.slice(start, start + perDay);
      if (day <= 10)      { stage = '基础建立'; activity = '学习新词 + 拼写 + 选择'; reviewFocus = '前2天错词'; stars = 80; }
      else if (day <= 25) { stage = '扩展巩固'; activity = '学习 + 混合练习 + 错题重练'; reviewFocus = '前7天 + 错题'; stars = 90; }
      else if (day <= 30) { stage = '完成引入'; activity = '学习 + 主题分类复习 + 小测'; reviewFocus = '全前词高频'; stars = 95; }
      else                { stage = '收尾';     activity = '学习剩余 + 综合练习 + 错题清零'; reviewFocus = '全词库抽样'; stars = 100; }
    } else {
      newWords = [];
      stage = '全面复习';
      reviewFocus = '全词库';
      if (day === 36)      { activity = '混合测试50题 + 错题本'; stars = 110; }
      else if (day === 37) { activity = '针对性复习 + 拼写挑战'; stars = 100; }
      else if (day === 38) { activity = '例句与语境综合练习 + 小测'; stars = 110; }
      else if (day === 39) { activity = '全量错题重练 + 信心评估'; stars = 120; }
      else                 { activity = '毕业总测 + 证书'; stars = 200; }
    }
    plan.push({ day, stage, newCount: newWords.length, newWordIds: newWords, reviewFocus, activity, stars });
  }
  return plan;
}

let PLAN = [];

// 获取某天的新词
function dayNewWords(day) {
  return (PLAN[day - 1] || { newWordIds: [] }).newWordIds.map(getWord).filter(Boolean);
}

/* =====================================================================
 * 4. 复习算法（方案第8节，Leitner 简化版）
 * ===================================================================== */
function masteryOf(id) {
  return appState.wordMastery[id] || { level: 0, lastReviewed: 0, correctStreak: 0, wrongCount: 0 };
}

// 计算到期复习词：lastReviewed + interval < currentDay
function dueReviewIds() {
  const today = appState.currentDay;
  const due = [];
  for (const [idStr, m] of Object.entries(appState.wordMastery)) {
    if (m.level === 0) continue;
    const interval = m.level * 2;              // level1→2天, level3→6天
    if (m.lastReviewed + interval <= today) due.push(parseInt(idStr));
  }
  return due.slice(0, DAILY_REVIEW_MAX);
}

// 记录练习结果
function recordAnswer(id, correct) {
  const m = masteryOf(id);
  if (correct) {
    m.level = Math.min(5, m.level + 1);
    m.correctStreak += 1;
    m.wrongCount = m.wrongCount; // 不变
    // 答对则从错题池移除
    appState.wrongWords = appState.wrongWords.filter(w => w !== id);
  } else {
    m.level = Math.max(0, m.level - 1);
    m.correctStreak = 0;
    m.wrongCount += 1;
    // 加入错题池
    if (!appState.wrongWords.includes(id)) appState.wrongWords.push(id);
  }
  m.lastReviewed = appState.currentDay;
  appState.wordMastery[id] = m;
  saveState();
}

function addStars(n) {
  appState.totalStars += n;
  saveState();
}

function dayCompleted(day) {
  const r = appState.dailyRecords[day];
  return !!(r && r.completed);
}

function markDayComplete(day, stars) {
  if (!appState.dailyRecords[day]) appState.dailyRecords[day] = { newLearned: [], practiceCorrect: 0, stars: 0, completed: false };
  appState.dailyRecords[day].completed = true;
  appState.dailyRecords[day].stars = Math.max(appState.dailyRecords[day].stars, stars);
  saveState();
}

// 连续打卡：进入新一天时更新
function advanceDayIfNeeded() {
  const today = todayStr();
  if (appState.lastActiveDate !== today) {
    // 如果上次活跃是昨天，streak+1；否则重置为1
    if (appState.lastActiveDate) {
      const last = new Date(appState.lastActiveDate);
      const now = new Date(today);
      const diff = Math.round((now - last) / 86400000);
      appState.streak = (diff === 1) ? appState.streak + 1 : 1;
    } else {
      appState.streak = 1;
    }
    appState.lastActiveDate = today;
    // 若上一天已完成，推进 currentDay（最多40）
    if (appState.currentDay < TOTAL_DAYS && dayCompleted(appState.currentDay)) {
      appState.currentDay += 1;
    }
    saveState();
  }
}

/* =====================================================================
 * 5. 路由：页面切换
 * ===================================================================== */
function showPage(name) {
  $$('.page').forEach(p => p.classList.remove('active'));
  const page = $(`#page-${name}`);
  if (page) page.classList.add('active');
  // 底部导航高亮
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === name));
  // 页面渲染钩子
  if (name === 'home')      renderHome();
  if (name === 'learn')     renderLearnInit();
  if (name === 'practice')  renderPracticeInit();
  if (name === 'review')    renderReview();
  if (name === 'test')      renderTestIntro();
  if (name === 'progress')  renderProgress();
  if (name === 'rewards')   renderRewards();
  if (name === 'plan')      renderPlan();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* =====================================================================
 * 6. TTS 发音（Web Speech API）
 * ===================================================================== */
let voicesCache = [];
function loadVoices() {
  if ('speechSynthesis' in window) {
    voicesCache = speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
  }
}
if ('speechSynthesis' in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.85;
  u.pitch = 1.1;
  const v = voicesCache.find(v => v.default) || voicesCache[0];
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

/* =====================================================================
 * 7. Confetti 撒花（canvas-confetti CDN）
 * ===================================================================== */
function celebrate(big = false) {
  if (appState.reducedMotion) return;
  if (typeof confetti !== 'function') return;
  const colors = ['#4FC3F7', '#81C784', '#FFD54F', '#FF8A65'];
  if (big) {
    const end = Date.now() + 1200;
    (function frame() {
      confetti({ particleCount: 5, angle: 60, spread: 70, origin: { x: 0 }, colors });
      confetti({ particleCount: 5, angle: 120, spread: 70, origin: { x: 1 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  } else {
    confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors });
  }
}

/* =====================================================================
 * 8. Mascot 鼓励语
 * ===================================================================== */
const PRAISE = ['太棒了！🎉', '答对啦，你真厉害！⭐', '完美！继续保持！', '哇，你越来越棒了！🌟', '答对了，给你点赞！👍'];
const ENCOURAGE = ['没关系，再试一次，你可以的！💪', '别灰心，慢慢来～', '差一点点，加油！'];
function mascotSay() { return pick(PRAISE); }
function mascotEncourage() { return pick(ENCOURAGE); }

/* =====================================================================
 * 9. Modal 弹窗（教程/结果/证书）
 * ===================================================================== */
function showModal(html, onMount) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-mask"><div class="modal-box">${html}</div></div>`;
  const mask = $('.modal-mask', root);
  mask.addEventListener('click', e => { if (e.target === mask) closeModal(); });
  if (onMount) onMount(root);
}
function closeModal() { $('#modal-root').innerHTML = ''; }

function showResultModal(title, bodyHtml, opts = {}) {
  const starLine = opts.stars ? `<p class="text-amber-500 font-extrabold text-xl mt-2"><i class="fa-solid fa-star"></i> +${opts.stars} 星星</p>` : '';
  const html = `
    <span class="mascot lg" aria-hidden="true">${opts.mascot || '🦊'}</span>
    <h3 class="text-2xl font-extrabold text-ink mt-2">${title}</h3>
    ${starLine}
    <div class="text-gray-500 text-sm mt-3">${bodyHtml}</div>
    <button class="modal-ok kid-btn kid-btn-primary w-full h-14 mt-5">好的</button>
  `;
  showModal(html, root => {
    $('.modal-ok', root).addEventListener('click', () => { closeModal(); if (opts.onOk) opts.onOk(); });
  });
}

function showCertificate(score) {
  const html = `
    <div class="bg-gradient-to-br from-sun to-coral rounded-2xl p-5 text-white">
      <p class="text-sm opacity-90">PET Kids 40天单词挑战</p>
      <h3 class="text-3xl font-extrabold my-2">毕业证书 🎓</h3>
      <p class="text-lg font-bold">恭喜完成40天挑战！</p>
      <p class="text-4xl font-extrabold my-3">${score} 分</p>
      <p class="text-sm opacity-90">掌握单词 ${masteredCount()}/${totalVocab()} · 累计星星 ${appState.totalStars}</p>
    </div>
    <p class="text-gray-500 text-sm mt-4">截屏保存这份属于你的荣誉证书吧！</p>
    <button class="modal-ok kid-btn kid-btn-primary w-full h-14 mt-4">太开心了！</button>
  `;
  showModal(html, root => {
    $('.modal-ok', root).addEventListener('click', closeModal);
  });
  celebrate(true);
}

/* =====================================================================
 * 10. 首页 Dashboard 渲染
 * ===================================================================== */
function renderHome() {
  const day = appState.currentDay;
  $('#hero-day').textContent = day;

  const rec = appState.dailyRecords[day] || { newLearned: [], practiceCorrect: 0, stars: 0, completed: false };
  const newTotal = dayNewWords(day).length;
  const learnedCnt = (rec.newLearned || []).length;
  const progPct = newTotal ? Math.round(learnedCnt / newTotal * 100) : 0;
  $('#hero-progress').textContent = progPct + '%';
  $('#hero-progress-fill').style.width = progPct + '%';

  $('#stat-streak').textContent = appState.streak;
  $('#stat-mastered').textContent = masteredCount();
  $('#stat-total').textContent = totalVocab();
  $('#stat-stars-today').textContent = rec.stars || 0;
  $('#stat-stars-total').textContent = appState.totalStars;

  const doneDays = Object.values(appState.dailyRecords).filter(r => r.completed).length;
  $('#overall-progress-text').textContent = `${doneDays}/${TOTAL_DAYS}`;
  $('#overall-progress-fill').style.width = (doneDays / TOTAL_DAYS * 100) + '%';

  $('#wrong-count').textContent = appState.wrongWords.length;

  // 顶部进度条 = 总体进度
  $('#top-progress-fill').style.width = (doneDays / TOTAL_DAYS * 100) + '%';
}

/* =====================================================================
 * 11. 今日学习 Learn（VocabCard 组件）
 * ===================================================================== */
let learnQueue = [];      // 今日新词队列（word 对象）
let learnIdx = 0;

function renderLearnInit() {
  // 初始化今日学习队列：新词 + 未学过的（level 0）
  const day = appState.currentDay;
  const newWords = dayNewWords(day);
  // 过滤已 level>=1 的（已学过），剩余即今日待学
  const todo = newWords.filter(w => (masteryOf(w.id).level || 0) === 0);
  learnQueue = todo.length ? todo : newWords; // 若都学过则展示全部
  learnIdx = 0;
  renderLearnCard();
}

function renderLearnCard() {
  $('#learn-total').textContent = learnQueue.length;
  $('#learn-current').textContent = Math.min(learnIdx + 1, learnQueue.length);
  const pct = learnQueue.length ? Math.round((learnIdx) / learnQueue.length * 100) : 0;
  $('#learn-progress-fill').style.width = pct + '%';
  $('#learn-progress-text').textContent = pct + '%';

  const area = $('#learn-card-area');
  if (!learnQueue.length) {
    area.innerHTML = `
      <div class="flex-1 flex flex-col items-center justify-center text-center">
        <span class="mascot lg mb-3">🦊</span>
        <p class="text-xl font-extrabold text-ink">今天的单词都学完啦！</p>
        <p class="text-gray-400 text-sm mt-2">去「练习中心」巩固一下吧～</p>
        <button class="kid-btn kid-btn-primary mt-5 px-8" onclick="showPage('practice')">去练习</button>
      </div>`;
    // 标记今日学习完成（若无新词）
    if (dayNewWords(appState.currentDay).length === 0) {
      markDayComplete(appState.currentDay, 30);
    }
    return;
  }
  const w = learnQueue[learnIdx];
  area.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <span class="text-xs font-bold text-sky bg-sky/10 px-3 py-1 rounded-full">${w.topic}</span>
      <span class="text-xs font-bold text-gray-400">${w.pos} · ${w.frequency}</span>
    </div>
    <div class="flex-1 flex flex-col items-center justify-center text-center">
      <p class="vocab-word text-ink">${w.word}</p>
      <p class="vocab-phonetic mt-2">${w.phonetic}</p>
      <div class="my-4 text-5xl">${topicEmoji(w.topic)}</div>
      <p class="text-lg font-bold text-coral">${w.definition_cn}</p>
      <p class="text-sm text-gray-400 mt-1">${w.definition_en}</p>
      <div class="kid-card bg-soft p-3 mt-4 w-full text-left">
        <p class="text-sm text-ink font-semibold">📖 ${w.example_en}</p>
        <p class="text-xs text-gray-400 mt-1">${w.example_cn}</p>
      </div>
    </div>
  `;
  // 自动朗读
  speak(w.word);
}

// 主题对应 emoji（简化版图片占位）
function topicEmoji(topic) {
  const map = {
    Clothing: '👕', General: '📘', Technology: '💻', Education: '🏫',
    Places: '🏥', Nature: '🌳', Transport: '🚌', Music: '🎸', Sport: '⚽', Food: '🍎'
  };
  return map[topic] || '📚';
}

function learnNext() {
  if (learnIdx < learnQueue.length - 1) {
    learnIdx++;
    renderLearnCard();
  } else {
    // 全部学完
    const day = appState.currentDay;
    const rec = appState.dailyRecords[day] || { newLearned: [], practiceCorrect: 0, stars: 0, completed: false };
    // 记录已学新词
    learnQueue.forEach(w => {
      if (!rec.newLearned.includes(w.id)) rec.newLearned.push(w.id);
      // 新词首次出现，level 置1
      if ((masteryOf(w.id).level || 0) === 0) {
        appState.wordMastery[w.id] = { level: 1, lastReviewed: day, correctStreak: 0, wrongCount: 0 };
      }
    });
    appState.dailyRecords[day] = rec;
    const stars = 20;
    addStars(stars);
    rec.stars = (rec.stars || 0) + stars;
    saveState();
    showResultModal('今日单词学完啦！', `<p>你学习了 ${learnQueue.length} 个新词</p><p>去练习中心巩固一下吧！</p>`, { stars, onOk: () => showPage('practice') });
  }
}

function learnMastered() {
  const w = learnQueue[learnIdx];
  if (!w) return;
  appState.wordMastery[w.id] = { level: Math.max(2, masteryOf(w.id).level || 2), lastReviewed: appState.currentDay, correctStreak: 1, wrongCount: 0 };
  appState.wrongWords = appState.wrongWords.filter(id => id !== w.id);
  addStars(5);
  saveState();
  celebrate();
  learnNext();
}

/* =====================================================================
 * 12. 练习中心 Practice（拼写/选择/例句）
 * ===================================================================== */
let practiceTab = 'spelling';
let practiceQueue = [];
let practiceIdx = 0;
let practiceScore = 0;
let spellAttempts = 3;

function renderPracticeInit() {
  // 重置练习
  practiceQueue = buildPracticeQueue();
  practiceIdx = 0;
  practiceScore = 0;
  switchPracticeTab(practiceTab);
}

// 练习题库：今日新词 + 到期复习词 + 错题
function buildPracticeQueue() {
  const day = appState.currentDay;
  const newIds = dayNewWords(day).map(w => w.id);
  const dueIds = dueReviewIds();
  const wrongIds = appState.wrongWords.slice(0, 8);
  const pool = shuffle([...new Set([...newIds, ...dueIds, ...wrongIds])]);
  return pool.slice(0, PRACTICE_QUIZ_SIZE).map(getWord).filter(Boolean);
}

function switchPracticeTab(tab) {
  practiceTab = tab;
  $$('.practice-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.practice-tab').forEach(b => {
    b.classList.toggle('kid-btn-primary', b.dataset.tab === tab);
    b.classList.toggle('kid-btn-ghost', b.dataset.tab !== tab);
  });
  $$('.practice-panel').forEach(p => p.classList.add('hidden-page'));
  $(`#practice-${tab}`).classList.remove('hidden-page');
  practiceIdx = 0;
  practiceScore = 0;
  $('#practice-total').textContent = practiceQueue.length || PRACTICE_QUIZ_SIZE;
  if (practiceQueue.length === 0) {
    // 无可练习词，用随机词
    practiceQueue = shuffle(VOCAB).slice(0, PRACTICE_QUIZ_SIZE);
  }
  if (tab === 'spelling') renderSpelling();
  if (tab === 'choice')   renderChoice();
  if (tab === 'sentence') renderSentence();
}

function updatePracticeProgress() {
  $('#practice-current').textContent = practiceIdx + 1;
  $('#practice-score').textContent = '得分 ' + practiceScore;
}

// ---- 拼写输入 SpellingInput ----
function renderSpelling() {
  if (practiceIdx >= practiceQueue.length) { finishPractice(); return; }
  const w = practiceQueue[practiceIdx];
  spellAttempts = 3;
  $('#spell-phonetic').textContent = w.phonetic;
  $('#spell-def').textContent = w.definition_cn;
  $('#spell-attempt').textContent = '剩余机会：3';
  $('#spell-input').value = '';
  // 字母占位
  const letters = w.word.split('');
  $('#spell-chips').innerHTML = letters.map(() => `<span class="letter-chip">?</span>`).join('');
  $('#spell-input').focus();
  updatePracticeProgress();
}

function submitSpelling() {
  const w = practiceQueue[practiceIdx];
  const input = norm($('#spell-input').value);
  const target = norm(w.word);
  const chips = $$('#spell-chips .letter-chip');
  const targetLetters = w.word.split('');

  // 字母级反馈
  let allCorrect = true;
  const inputLetters = $('#spell-input').value.split('');
  targetLetters.forEach((ch, i) => {
    const chip = chips[i];
    if (!chip) return;
    const inCh = inputLetters[i];
    if (inCh && norm(inCh) === norm(ch)) {
      chip.className = 'letter-chip correct';
      chip.textContent = ch;
    } else {
      chip.className = 'letter-chip wrong';
      chip.textContent = ch;
      allCorrect = false;
    }
  });

  if (input === target) {
    practiceScore += 10;
    appState.stats.spellingCorrect += 1;
    recordAnswer(w.id, true);
    addStars(10);
    celebrate();
    showResultModal(mascotSay(), `<p>"${w.word}" 拼写正确！</p>`, { stars: 10, onOk: nextSpelling });
  } else {
    spellAttempts--;
    recordAnswer(w.id, false);
    $('#spell-attempt').textContent = '剩余机会：' + Math.max(0, spellAttempts);
    if (spellAttempts <= 0) {
      // 显示正确答案
      chips.forEach((chip, i) => { chip.className = 'letter-chip hint'; chip.textContent = targetLetters[i] || ''; });
      showResultModal('正确答案', `<p class="text-lg font-bold text-sky">${w.word}</p><p>${mascotEncourage()}</p>`, { mascot: '🦊', onOk: nextSpelling });
    } else {
      showResultModal(mascotEncourage(), `<p>再试试看，还剩 ${spellAttempts} 次机会</p>`, { mascot: '🦊', onOk: () => {
        $('#spell-input').value = '';
        $('#spell-input').focus();
        // 重置占位
        const letters = w.word.split('');
        $('#spell-chips').innerHTML = letters.map(() => `<span class="letter-chip">?</span>`).join('');
      }});
    }
  }
  saveState();
}

function nextSpelling() {
  practiceIdx++;
  renderSpelling();
}

// ---- 选择题 QuizChoice ----
function renderChoice() {
  if (practiceIdx >= practiceQueue.length) { finishPractice(); return; }
  const w = practiceQueue[practiceIdx];
  $('#choice-def').textContent = w.definition_cn;
  $('#choice-phonetic').textContent = w.phonetic;
  // 生成干扰项：同主题或随机
  const distractors = shuffle(VOCAB.filter(x => x.id !== w.id)).slice(0, 3);
  const options = shuffle([w, ...distractors]);
  $('#choice-options').innerHTML = options.map(o => `
    <button class="choice-btn" data-id="${o.id}">${o.word}</button>
  `).join('');
  $$('#choice-options .choice-btn').forEach(btn => {
    btn.addEventListener('click', () => onChoiceAnswer(btn, w));
  });
  updatePracticeProgress();
}

function onChoiceAnswer(btn, w) {
  const chosenId = parseInt(btn.dataset.id);
  $$('#choice-options .choice-btn').forEach(b => b.disabled = true);
  if (chosenId === w.id) {
    btn.classList.add('correct');
    practiceScore += 10;
    recordAnswer(w.id, true);
    addStars(10);
    celebrate();
    setTimeout(() => { practiceIdx++; showResultModal(mascotSay(), `<p>"${w.word}" 选择正确！</p>`, { stars: 10, onOk: renderChoice }); }, 700);
  } else {
    btn.classList.add('wrong');
    // 高亮正确答案
    $$('#choice-options .choice-btn').forEach(b => { if (parseInt(b.dataset.id) === w.id) b.classList.add('correct'); });
    recordAnswer(w.id, false);
    setTimeout(() => { practiceIdx++; showResultModal('正确答案', `<p class="text-lg font-bold text-sky">${w.word}</p><p>${mascotEncourage()}</p>`, { mascot: '🦊', onOk: renderChoice }); }, 1200);
  }
  saveState();
}

// ---- 例句练习：填空选择 ----
function renderSentence() {
  if (practiceIdx >= practiceQueue.length) { finishPractice(); return; }
  const w = practiceQueue[practiceIdx];
  // 把例句中的目标词替换为空白
  const re = new RegExp(w.word, 'i');
  const blanked = w.example_en.replace(re, '______');
  $('#sentence-text').innerHTML = blanked + ` <br><span class="text-xs text-gray-400">${w.example_cn}</span>`;
  const distractors = shuffle(VOCAB.filter(x => x.id !== w.id)).slice(0, 3);
  const options = shuffle([w, ...distractors]);
  $('#sentence-options').innerHTML = options.map(o => `
    <button class="choice-btn" data-id="${o.id}">${o.word}</button>
  `).join('');
  $$('#sentence-options .choice-btn').forEach(btn => {
    btn.addEventListener('click', () => onSentenceAnswer(btn, w));
  });
  updatePracticeProgress();
}

function onSentenceAnswer(btn, w) {
  const chosenId = parseInt(btn.dataset.id);
  $$('#sentence-options .choice-btn').forEach(b => b.disabled = true);
  if (chosenId === w.id) {
    btn.classList.add('correct');
    practiceScore += 10;
    recordAnswer(w.id, true);
    addStars(10);
    celebrate();
    setTimeout(() => { practiceIdx++; showResultModal(mascotSay(), `<p>例句填空正确！</p>`, { stars: 10, onOk: renderSentence }); }, 700);
  } else {
    btn.classList.add('wrong');
    $$('#sentence-options .choice-btn').forEach(b => { if (parseInt(b.dataset.id) === w.id) b.classList.add('correct'); });
    recordAnswer(w.id, false);
    setTimeout(() => { practiceIdx++; showResultModal('正确答案', `<p class="text-lg font-bold text-sky">${w.word}</p><p>${mascotEncourage()}</p>`, { mascot: '🦊', onOk: renderSentence }); }, 1200);
  }
  saveState();
}

function finishPractice() {
  const stars = practiceScore;
  const day = appState.currentDay;
  const rec = appState.dailyRecords[day] || { newLearned: [], practiceCorrect: 0, stars: 0, completed: false };
  rec.practiceCorrect = (rec.practiceCorrect || 0) + practiceScore / 10;
  rec.stars = (rec.stars || 0) + Math.round(stars / 10);
  // 完美日额外奖励
  const perfect = practiceScore >= practiceQueue.length * 10;
  let bonus = 0;
  if (perfect) { bonus = 50; addStars(50); rec.stars += 50; }
  appState.dailyRecords[day] = rec;
  // 若今日学习+练习都完成，标记天完成
  const newTotal = dayNewWords(day).length;
  if (rec.newLearned.length >= newTotal && rec.practiceCorrect > 0) {
    rec.completed = true;
  }
  saveState();
  checkBadges();
  showResultModal('练习完成！', `<p>本轮得分：${practiceScore} 分</p>${perfect ? '<p class="text-grass font-bold">完美一轮！+50 星星</p>' : ''}<p>去复习专区或测试一下吧～</p>`, { stars: Math.round(stars / 10) + bonus, onOk: () => showPage('review') });
}

/* =====================================================================
 * 13. 复习专区 Review
 * ===================================================================== */
function renderReview() {
  $('#due-count').textContent = dueReviewIds().length;
  $('#wrong-count-r').textContent = appState.wrongWords.length;
  renderTopicFilters();
  renderVocabList('');
}

function renderTopicFilters() {
  const topics = [...new Set(VOCAB.map(w => w.topic))];
  $('#topic-filters').innerHTML = `<button class="topic-chip kid-btn kid-btn-primary h-9 text-xs px-3" data-topic="all">全部</button>` +
    topics.map(t => `<button class="topic-chip kid-btn kid-btn-ghost h-9 text-xs px-3" data-topic="${t}">${t}</button>`).join('');
  $$('.topic-chip').forEach(b => b.addEventListener('click', () => {
    $$('.topic-chip').forEach(x => { x.classList.remove('kid-btn-primary'); x.classList.add('kid-btn-ghost'); });
    b.classList.add('kid-btn-primary'); b.classList.remove('kid-btn-ghost');
    renderVocabList($('#vocab-search').value, b.dataset.topic);
  }));
}

function renderVocabList(query, topic = 'all') {
  const q = norm(query);
  const list = VOCAB.filter(w => {
    const matchTopic = topic === 'all' || w.topic === topic;
    const matchQ = !q || norm(w.word).includes(q) || norm(w.definition_cn).includes(q);
    return matchTopic && matchQ;
  });
  $('#vocab-list').innerHTML = list.map(w => {
    const m = masteryOf(w.id);
    const lvl = m.level || 0;
    const dots = '●'.repeat(lvl) + '○'.repeat(5 - lvl);
    const wrongTag = appState.wrongWords.includes(w.id) ? '<span class="text-coral text-xs">错</span>' : '';
    return `
      <div class="kid-card p-3 flex items-center justify-between">
        <div class="text-left">
          <p class="font-bold text-ink">${w.word} ${wrongTag}</p>
          <p class="text-xs text-gray-400">${w.phonetic} · ${w.definition_cn}</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-grass font-bold tracking-wider">${dots}</p>
          <button class="text-sky text-xs mt-1" onclick="speak('${w.word.replace(/'/g, "\\'")}')"><i class="fa-solid fa-volume-high"></i></button>
        </div>
      </div>`;
  }).join('') || '<p class="text-gray-400 text-center py-6 text-sm">没有找到单词</p>';
}

// 到期复习 / 错题复习：复用学习卡片
function startReviewMode(mode) {
  let ids;
  if (mode === 'due')   ids = dueReviewIds();
  else if (mode === 'wrong') ids = appState.wrongWords.slice();
  if (!ids.length) {
    showResultModal('暂无需要复习的词', '<p>你已经复习得很棒了！🎉</p>', { mascot: '🦊' });
    return;
  }
  // 用练习中心拼写模式复习
  showPage('practice');
  practiceQueue = ids.map(getWord).filter(Boolean);
  practiceIdx = 0; practiceScore = 0;
  switchPracticeTab('spelling');
}

/* =====================================================================
 * 14. 综合测试 Test
 * ===================================================================== */
let testQueue = [];
let testIdx = 0;
let testScore = 0;
let testType = '';
let testTimer = null;
let testStartTs = 0;

function renderTestIntro() {
  $('#test-intro').classList.remove('hidden-page');
  $('#test-running').classList.add('hidden-page');
}

function startTest(type) {
  testType = type;
  const size = type === 'daily' ? TEST_DAILY_Q : type === 'stage' ? TEST_STAGE_Q : TEST_FINAL_Q;
  // 题源：优先 level<4 的词 + 随机
  const weak = Object.entries(appState.wordMastery).filter(([id, m]) => m.level < 4).map(([id]) => parseInt(id));
  const pool = weak.length >= size ? weak : [...weak, ...shuffle(VOCAB.map(w => w.id))];
  testQueue = shuffle([...new Set(pool)]).slice(0, size).map(getWord).filter(Boolean);
  if (testQueue.length < size) testQueue = shuffle(VOCAB).slice(0, size); // 兜底
  testIdx = 0; testScore = 0;
  $('#test-intro').classList.add('hidden-page');
  $('#test-running').classList.remove('hidden-page');
  $('#test-q-total').textContent = testQueue.length;
  // 计时
  testStartTs = Date.now();
  if (testTimer) clearInterval(testTimer);
  testTimer = setInterval(updateTestTimer, 1000);
  renderTestQuestion();
}

function updateTestTimer() {
  const sec = Math.floor((Date.now() - testStartTs) / 1000);
  const m = Math.floor(sec / 60), s = sec % 60;
  $('#test-timer').textContent = `⏱ ${m}:${String(s).padStart(2,'0')}`;
}

function renderTestQuestion() {
  if (testIdx >= testQueue.length) { finishTest(); return; }
  const w = testQueue[testIdx];
  $('#test-q-current').textContent = testIdx + 1;
  $('#test-progress-fill').style.width = (testIdx / testQueue.length * 100) + '%';
  // 随机拼写/选择
  const isSpell = Math.random() < 0.4;
  if (isSpell) {
    $('#test-question-area').innerHTML = `
      <p class="text-sm text-gray-400 font-semibold mb-1">拼写题 · 请输入单词</p>
      <p class="text-lg font-bold text-coral">${w.definition_cn}</p>
      <p class="text-sm text-gray-400">${w.phonetic}</p>
      <input id="test-spell-input" type="text" autocomplete="off" class="w-full text-center text-2xl font-extrabold border-2 border-coral/30 rounded-2xl py-3 mt-4 focus:outline-none focus:border-coral" placeholder="输入单词…" />
    `;
    $('#test-options-area').innerHTML = `<button id="test-spell-submit" class="kid-btn kid-btn-coral w-full h-14">提交</button>`;
    $('#test-spell-submit').addEventListener('click', () => {
      const val = norm($('#test-spell-input').value);
      if (val === norm(w.word)) {
        testScore += 10; recordAnswer(w.id, true); celebrate();
      } else {
        recordAnswer(w.id, false);
      }
      testIdx++; renderTestQuestion();
    });
    $('#test-spell-input').focus();
  } else {
    $('#test-question-area').innerHTML = `
      <p class="text-sm text-gray-400 font-semibold mb-1">选择题 · 选择正确的单词</p>
      <p class="text-lg font-bold text-ink">${w.definition_cn}</p>
      <p class="text-sm text-gray-400">${w.phonetic}</p>
    `;
    const distractors = shuffle(VOCAB.filter(x => x.id !== w.id)).slice(0, 3);
    const options = shuffle([w, ...distractors]);
    $('#test-options-area').innerHTML = options.map(o => `<button class="choice-btn test-opt" data-id="${o.id}">${o.word}</button>`).join('');
    $$('.test-opt').forEach(btn => btn.addEventListener('click', () => {
      $$('.test-opt').forEach(b => b.disabled = true);
      if (parseInt(btn.dataset.id) === w.id) { btn.classList.add('correct'); testScore += 10; recordAnswer(w.id, true); celebrate(); }
      else { btn.classList.add('wrong'); recordAnswer(w.id, false); $$('.test-opt').forEach(b => { if (parseInt(b.dataset.id) === w.id) b.classList.add('correct'); }); }
      setTimeout(() => { testIdx++; renderTestQuestion(); }, 900);
    }));
  }
}

function finishTest() {
  if (testTimer) clearInterval(testTimer);
  const total = testQueue.length * 10;
  const pct = Math.round(testScore / total * 100);
  const stars = testScore;
  addStars(stars);
  if (pct === 100) { appState.stats.testPerfectCount += 1; celebrate(true); }
  // 毕业总测 → 证书
  if (testType === 'final') {
    markDayComplete(TOTAL_DAYS, stars);
    checkBadges();
    showCertificate(pct);
    return;
  }
  checkBadges();
  const grade = pct >= 90 ? '优秀 🌟' : pct >= 70 ? '良好 👍' : pct >= 50 ? '及格 ✅' : '继续加油 💪';
  showResultModal('测试完成！', `<p>得分：${testScore}/${total}（${pct}%）</p><p class="text-lg font-bold text-sky mt-1">${grade}</p><p>错题已加入错题本，记得复习哦～</p>`, { stars, onOk: renderTestIntro });
}

/* =====================================================================
 * 15. 进度页 Progress
 * ===================================================================== */
let chartMastery = null, chartTopic = null;

function renderProgress() {
  // 40天日历
  const cal = $('#progress-calendar');
  cal.innerHTML = '';
  for (let d = 1; d <= TOTAL_DAYS; d++) {
    const rec = appState.dailyRecords[d];
    let cls = 'day-cell';
    if (rec && rec.completed) cls += ' done';
    else if (rec && rec.newLearned.length) cls += ' partial';
    if (d === appState.currentDay) cls += ' today';
    const cell = document.createElement('button');
    cell.className = cls;
    cell.innerHTML = `<span>${d}</span>`;
    cell.title = `第${d}天`;
    cell.addEventListener('click', () => showDayDetail(d));
    cal.appendChild(cell);
  }

  // 掌握率饼图
  const mastered = masteredCount();
  const learning = Object.values(appState.wordMastery).filter(m => m.level > 0 && m.level < 4).length;
  const unknown = totalVocab() - mastered - learning;
  if (chartMastery) chartMastery.destroy();
  chartMastery = new Chart($('#chart-mastery'), {
    type: 'doughnut',
    data: {
      labels: ['已掌握', '学习中', '未学习'],
      datasets: [{ data: [mastered, learning, unknown], backgroundColor: ['#81C784', '#FFD54F', '#e5edf5'], borderWidth: 0 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 12, family: 'Baloo 2' } } } } }
  });

  // 主题柱状图
  const topics = [...new Set(VOCAB.map(w => w.topic))];
  const data = topics.map(t => {
    const ids = VOCAB.filter(w => w.topic === t).map(w => w.id);
    const m = ids.filter(id => (masteryOf(id).level || 0) >= 4).length;
    return Math.round(m / ids.length * 100);
  });
  if (chartTopic) chartTopic.destroy();
  chartTopic = new Chart($('#chart-topic'), {
    type: 'bar',
    data: { labels: topics, datasets: [{ label: '掌握率%', data, backgroundColor: '#4FC3F7', borderRadius: 8 }] },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { max: 100, beginAtZero: true } }, plugins: { legend: { display: false } } }
  });
}

function showDayDetail(day) {
  const rec = appState.dailyRecords[day] || { newLearned: [], stars: 0, completed: false };
  const p = PLAN[day - 1] || {};
  const words = (rec.newLearned || []).map(getWord).filter(Boolean);
  showResultModal(`第 ${day} 天`, `
    <p class="text-sm">阶段：${p.stage || '-'}</p>
    <p class="text-sm">活动：${p.activity || '-'}</p>
    <p class="text-sm">状态：${rec.completed ? '✅ 已完成' : (rec.newLearned.length ? '🟡 部分完成' : '⚪ 未开始')}</p>
    <p class="text-sm">星星：${rec.stars || 0}</p>
    ${words.length ? `<p class="text-sm mt-2 font-bold">已学单词：</p><p class="text-xs text-gray-500">${words.map(w => w.word).join(', ')}</p>` : ''}
  `, { mascot: '🦊' });
}

/* =====================================================================
 * 16. 奖励中心 Rewards
 * ===================================================================== */
function renderRewards() {
  $('#reward-stars').textContent = appState.totalStars;
  // 徽章墙
  $('#badge-wall').innerHTML = BADGES.map(b => {
    const unlocked = appState.badges.includes(b.id);
    return `<div class="badge-tile ${unlocked ? 'unlocked' : 'locked'}">
      <span class="text-3xl">${b.icon}</span>
      <p class="text-xs font-bold text-ink text-center">${b.name}</p>
      <p class="text-[10px] text-gray-400 text-center">${b.desc}</p>
    </div>`;
  }).join('');
  // 成长记录：按天倒序
  const days = Object.keys(appState.dailyRecords).sort((a, b) => b - a).slice(0, 10);
  $('#reward-log').innerHTML = days.map(d => {
    const r = appState.dailyRecords[d];
    return `<div class="kid-card p-3 flex items-center justify-between">
      <p class="text-sm font-bold text-ink">第 ${d} 天</p>
      <p class="text-xs text-gray-400">${r.completed ? '✅ 完成' : '🟡 进行中'} · <span class="star-coin text-xs"><i class="fa-solid fa-star"></i>${r.stars || 0}</span></p>
    </div>`;
  }).join('') || '<p class="text-gray-400 text-center py-6 text-sm">还没有记录，快去学习吧！</p>';
}

function checkBadges() {
  BADGES.forEach(b => {
    if (!appState.badges.includes(b.id) && b.check(appState)) {
      appState.badges.push(b.id);
      addStars(30);
      saveState();
      setTimeout(() => showResultModal('解锁新徽章！', `<div class="text-5xl my-2">${b.icon}</div><p class="text-lg font-extrabold text-ink">${b.name}</p><p class="text-sm text-gray-400">${b.desc}</p><p class="text-amber-500 font-bold mt-2">+30 星星奖励</p>`, { stars: 30, mascot: '🎉' }), 600);
    }
  });
}

/* =====================================================================
 * 17. 学习计划页 Plan
 * ===================================================================== */
function renderPlan() {
  $('#plan-total-words').textContent = totalVocab();
  const tbl = $('#plan-table');
  tbl.innerHTML = PLAN.map(p => {
    const rec = appState.dailyRecords[p.day];
    const status = rec && rec.completed ? '✅' : (rec && rec.newLearned.length ? '🟡' : '⚪');
    const isToday = p.day === appState.currentDay;
    return `
      <button class="kid-card w-full p-3 flex items-center gap-3 ${isToday ? 'ring-2 ring-coral' : ''}" onclick="goToDay(${p.day})">
        <span class="w-10 h-10 rounded-2xl bg-sky/10 flex items-center justify-center font-extrabold text-sky text-sm flex-shrink-0">${p.day}</span>
        <div class="text-left flex-1 min-w-0">
          <p class="text-sm font-bold text-ink truncate">${p.stage} · ${p.newCount}新词</p>
          <p class="text-xs text-gray-400 truncate">${p.activity}</p>
        </div>
        <span class="text-lg">${status}</span>
      </button>`;
  }).join('');
}

function goToDay(day) {
  if (day > appState.currentDay) {
    showResultModal('这一天还没解锁', '<p>请按顺序学习，先把前面的内容完成吧～</p>', { mascot: '🦊' });
    return;
  }
  appState.currentDay = day;
  saveState();
  showPage('learn');
}

/* =====================================================================
 * 18. 导出 / 导入 / 重置
 * ===================================================================== */
function exportProgress() {
  const data = JSON.stringify({ state: appState, vocab: VOCAB, exportedAt: new Date().toISOString() }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `pet-progress-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showResultModal('导出成功', '<p>进度备份已下载到本地</p>', { mascot: '💾' });
}

function importVocab() {
  const html = `
    <p class="text-gray-500 text-sm mb-4 text-left">导入新的词库 JSON 文件，格式如下（字段同词库结构）：<br>
    <code class="text-xs bg-soft p-2 rounded block mt-2">[{"id":1,"word":"...","pos":"n","phonetic":"/.../","definition_cn":"...","definition_en":"...","example_en":"...","example_cn":"...","topic":"...","frequency":"high"}]</code>
    </p>
    <input id="import-file" type="file" accept=".json,application/json" class="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-sky file:text-white file:font-bold" />
    <div class="grid grid-cols-2 gap-3 mt-4">
      <button class="modal-cancel kid-btn kid-btn-ghost h-12">取消</button>
      <button id="import-confirm" class="kid-btn kid-btn-primary h-12">确认导入</button>
    </div>
  `;
  showModal(html, root => {
    $('.modal-cancel', root).addEventListener('click', closeModal);
    $('#import-confirm', root).addEventListener('click', () => {
      const file = $('#import-file').files[0];
      if (!file) { alert('请先选择文件'); return; }
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const arr = JSON.parse(e.target.result);
          if (!Array.isArray(arr) || !arr.length) throw new Error('格式错误');
          VOCAB = arr;
          window.PET_VOCAB = arr;
          // 重建计划
          PLAN = buildPlan();
          // 重置 mastery 中不存在的词
          const ids = new Set(arr.map(w => w.id));
          Object.keys(appState.wordMastery).forEach(k => { if (!ids.has(parseInt(k))) delete appState.wordMastery[k]; });
          saveState();
          closeModal();
          showResultModal('导入成功！', `<p>已加载 ${arr.length} 个单词</p><p>40天计划已重新生成</p>`, { mascot: '🎉', onOk: () => showPage('home') });
        } catch (err) {
          alert('文件格式错误：' + err.message);
        }
      };
      reader.readAsText(file);
    });
  });
}

function resetProgress() {
  const html = `
    <span class="mascot lg">⚠️</span>
    <h3 class="text-2xl font-extrabold text-coral mt-2">确定要重置吗？</h3>
    <p class="text-gray-500 text-sm mt-3">所有学习进度、星星、徽章将被清空，无法恢复！</p>
    <div class="grid grid-cols-2 gap-3 mt-5">
      <button class="modal-cancel kid-btn kid-btn-ghost h-14">再想想</button>
      <button id="reset-confirm" class="kid-btn kid-btn-coral h-14">确认重置</button>
    </div>
  `;
  showModal(html, root => {
    $('.modal-cancel', root).addEventListener('click', closeModal);
    $('#reset-confirm', root).addEventListener('click', () => {
      appState = defaultState();
      saveState();
      PLAN = buildPlan();
      closeModal();
      showPage('home');
      showResultModal('已重置', '<p>重新开始你的40天挑战吧！💪</p>', { mascot: '🦊' });
    });
  });
}

/* =====================================================================
 * 19. 设置 / 教程 / 帮助
 * ===================================================================== */
function showSettings() {
  const html = `
    <span class="mascot lg">🦊</span>
    <h3 class="text-2xl font-extrabold text-ink mt-2">设置</h3>
    <div class="text-left mt-4 space-y-3">
      <label class="flex items-center justify-between kid-card p-3">
        <span class="text-sm font-bold text-ink">减少动画</span>
        <input id="setting-motion" type="checkbox" ${appState.reducedMotion ? 'checked' : ''} class="w-6 h-6 accent-sky" />
      </label>
      <button id="setting-tutorial" class="kid-btn kid-btn-ghost w-full h-12 text-sm"><i class="fa-solid fa-graduation-cap"></i> 查看新手教程</button>
      <button id="setting-about" class="kid-btn kid-btn-ghost w-full h-12 text-sm"><i class="fa-solid fa-circle-info"></i> 关于</button>
    </div>
    <button class="modal-ok kid-btn kid-btn-primary w-full h-14 mt-5">完成</button>
  `;
  showModal(html, root => {
    $('#setting-motion', root).addEventListener('change', e => {
      appState.reducedMotion = e.target.checked;
      document.body.classList.toggle('reduce-motion', appState.reducedMotion);
      saveState();
    });
    $('#setting-tutorial', root).addEventListener('click', () => { closeModal(); showTutorial(); });
    $('#setting-about', root).addEventListener('click', () => {
      $('#modal-root .modal-box').querySelector('h3').nextElementSibling.innerHTML = `
        <p class="text-sm text-gray-500 text-left">PET Kids 40天单词挑战 · 儿童友好型英语词汇学习 Web App</p>
        <p class="text-xs text-gray-400 text-left mt-2">基于 Cambridge PET B1 词汇，融合间隔重复、多模态练习与游戏化奖励。</p>`;
    });
    $('.modal-ok', root).addEventListener('click', closeModal);
  });
}

function showTutorial() {
  const steps = [
    { icon: '🦊', title: '欢迎来到 PET Kids！', text: '我是你的学习伙伴小狐狸，接下来 40 天我们一起挑战 PET 单词！' },
    { icon: '📖', title: '第1步：每日学习', text: '在「学习」页查看今日新词卡片，点听音按钮跟读，点「已掌握」标记。' },
    { icon: '✏️', title: '第2步：练习巩固', text: '在「练习」页做拼写、选择、例句练习，答对有星星和撒花奖励哦！' },
    { icon: '🏆', title: '第3步：收集奖励', text: '坚持打卡解锁徽章，毕业总测还能拿到专属证书！准备好了吗？' },
  ];
  let i = 0;
  function next() {
    if (i >= steps.length) { closeModal(); showPage('learn'); return; }
    const s = steps[i++];
    const last = i >= steps.length;
    showModal(`
      <span class="mascot lg">${s.icon}</span>
      <h3 class="text-2xl font-extrabold text-ink mt-2">${s.title}</h3>
      <p class="text-gray-500 text-sm mt-3">${s.text}</p>
      <div class="flex gap-1 justify-center mt-4">${steps.map((_, idx) => `<span class="w-2 h-2 rounded-full ${idx < i ? 'bg-sky' : 'bg-gray-200'}"></span>`).join('')}</div>
      <button class="tut-next kid-btn kid-btn-primary w-full h-14 mt-5">${last ? '开始学习 🚀' : '下一步'}</button>
    `, root => $('.tut-next', root).addEventListener('click', next));
  }
  next();
}

function showHelp() {
  const tips = [
    '每天先去「学习」页学新词，再去「练习」巩固～',
    '答错的词会自动进入错题本，记得常去「复习」看看！',
    '坚持连续打卡，streak 越长越酷哦！🔥',
    '星星可以解锁徽章，毕业总测有惊喜证书！🎓',
    '点单词旁的喇叭图标可以听发音～🔊',
  ];
  showResultModal('小狐狸提示', `<p class="text-sm">${pick(tips)}</p>`, { mascot: '🦊' });
}

/* =====================================================================
 * 20. 事件绑定与初始化
 * ===================================================================== */
function bindEvents() {
  // 底部导航
  $$('.nav-item').forEach(b => b.addEventListener('click', () => showPage(b.dataset.page)));
  // 返回按钮（回首页）
  $$('.nav-back').forEach(b => b.addEventListener('click', () => showPage('home')));

  // 首页
  $('#btn-start-today').addEventListener('click', () => showPage('learn'));
  $('#btn-quick-review').addEventListener('click', () => startReviewMode('wrong'));
  $('#btn-settings').addEventListener('click', showSettings);
  $('#btn-help').addEventListener('click', showHelp);

  // 学习页
  $('#learn-btn-speak').addEventListener('click', () => { if (learnQueue[learnIdx]) speak(learnQueue[learnIdx].word); });
  $('#learn-btn-next').addEventListener('click', learnNext);
  $('#learn-btn-master').addEventListener('click', learnMastered);

  // 练习页
  $$('.practice-tab').forEach(b => b.addEventListener('click', () => switchPracticeTab(b.dataset.tab)));
  $('#spell-submit').addEventListener('click', submitSpelling);
  $('#spell-speak').addEventListener('click', () => { if (practiceQueue[practiceIdx]) speak(practiceQueue[practiceIdx].word); });
  $('#spell-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitSpelling(); });

  // 复习页
  $('#review-due').addEventListener('click', () => startReviewMode('due'));
  $('#review-wrong').addEventListener('click', () => startReviewMode('wrong'));
  $('#vocab-search').addEventListener('input', e => {
    const topic = $('.topic-chip.kid-btn-primary')?.dataset.topic || 'all';
    renderVocabList(e.target.value, topic);
  });

  // 测试页
  $('#test-daily').addEventListener('click', () => startTest('daily'));
  $('#test-stage').addEventListener('click', () => startTest('stage'));
  $('#test-final').addEventListener('click', () => startTest('final'));

  // 进度页
  $('#btn-export').addEventListener('click', exportProgress);
  $('#btn-import-vocab').addEventListener('click', importVocab);
  $('#btn-reset').addEventListener('click', resetProgress);
}

function init() {
  loadState();
  // 在 DOMContentLoaded 后再读 window.PET_VOCAB，确保 vocab-data.js 已完整执行
  VOCAB = (window.PET_VOCAB && window.PET_VOCAB.length) ? window.PET_VOCAB : [];
  if (!VOCAB.length) {
    console.error('[PET] vocab-data.js 未就绪，词库为空');
  } else {
    console.log('[PET] 词库加载成功：' + VOCAB.length + ' 词');
  }
  PLAN = buildPlan();
  document.body.classList.toggle('reduce-motion', appState.reducedMotion);
  bindEvents();
  advanceDayIfNeeded();
  showPage('home');
  // 首次使用弹出教程
  if (Object.keys(appState.wordMastery).length === 0 && appState.totalStars === 0) {
    setTimeout(showTutorial, 600);
  }
  checkBadges();
}

document.addEventListener('DOMContentLoaded', function() {
  // 轮询等待 window.PET_VOCAB 就绪（最多等 10 秒，每 100ms 查一次）
  var attempts = 0;
  var maxAttempts = 100;
  function tryInit() {
    if (window.PET_VOCAB && window.PET_VOCAB.length > 0) {
      init();
    } else if (attempts < maxAttempts) {
      attempts++;
      setTimeout(tryInit, 100);
    } else {
      console.error('[PET] 超时：window.PET_VOCAB 未就绪');
    }
  }
  tryInit();
});
