/* =====================================================================
 * PET-Words · Supabase Auth + Cloud Sync
 * 功能：Email/Google 登入、學習進度雲端讀寫、離線優先合併策略
 * ===================================================================== */

'use strict';

// ── Supabase 設定 ─────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://xokpnnavlntwnfsxffua.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhva3BubmF2bG50d25mc3hmZnVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MTE5MDEsImV4cCI6MjA5ODA4NzkwMX0.DGzGUKbQlGk_TLbKcPfy_8AmigHTrnCcQhlMJA29Axw';

// ── 全域狀態 ──────────────────────────────────────────────────────────
let _supabase = null;          // Supabase client
let _currentUser = null;       // 當前登入用戶
let _syncDebounceTimer = null; // 防抖計時器
const SYNC_DEBOUNCE_MS = 2000; // 2 秒後才真正寫入雲端

// ── 初始化 Supabase Client ────────────────────────────────────────────
function initSupabase() {
  if (!window.supabase) {
    console.warn('[Sync] Supabase SDK 未載入');
    return false;
  }
  _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      // GitHub Pages 部署後的 redirect URL
      redirectTo: window.location.origin + window.location.pathname,
      persistSession: true,
      autoRefreshToken: true,
    }
  });

  // 監聽 Auth 狀態變化（登入/登出/Token 刷新）
  _supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('[Sync] Auth event:', event);
    _currentUser = session?.user ?? null;
    updateAuthUI();

    if (event === 'SIGNED_IN') {
      // 登入後：從雲端拉取進度，與本地合併
      await pullAndMergeProgress();
    } else if (event === 'SIGNED_OUT') {
      // 登出後：清空同步狀態，繼續用本地資料
      showSyncStatus('未登入', 'gray');
    }
  });

  return true;
}

// ── 取得當前用戶 ─────────────────────────────────────────────────────
function getCurrentUser() { return _currentUser; }
function isLoggedIn() { return !!_currentUser; }

// ── Auth UI 更新 ──────────────────────────────────────────────────────
function updateAuthUI() {
  const btn = document.getElementById('btn-auth');
  const indicator = document.getElementById('sync-indicator');
  if (!btn) return;

  if (_currentUser) {
    const email = _currentUser.email || '已登入';
    const shortEmail = email.length > 14 ? email.substring(0, 12) + '…' : email;
    btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up text-grass"></i><span class="text-xs font-bold text-grass">${shortEmail}</span>`;
    btn.title = `已登入：${email}，點擊管理帳號`;
    if (indicator) { indicator.className = 'w-2 h-2 rounded-full bg-grass'; indicator.title = '雲端同步已啟用'; }
  } else {
    btn.innerHTML = `<i class="fa-solid fa-user text-gray-400"></i><span class="text-xs font-bold text-gray-400">登入</span>`;
    btn.title = '登入以啟用雲端同步';
    if (indicator) { indicator.className = 'w-2 h-2 rounded-full bg-gray-300'; indicator.title = '未登入'; }
  }
}

// ── 顯示同步狀態提示 ─────────────────────────────────────────────────
function showSyncStatus(msg, color = 'sky') {
  const el = document.getElementById('sync-status-text');
  if (el) {
    el.textContent = msg;
    el.className = `text-xs text-${color}-500 font-semibold`;
    // 3 秒後淡出
    clearTimeout(el._fadeTimer);
    el._fadeTimer = setTimeout(() => { el.textContent = ''; }, 3000);
  }
}

// ── 防抖雲端寫入（每次 saveState 後呼叫） ───────────────────────────
function scheduleSyncToCloud() {
  if (!isLoggedIn()) return;
  clearTimeout(_syncDebounceTimer);
  _syncDebounceTimer = setTimeout(pushProgressToCloud, SYNC_DEBOUNCE_MS);
}

// ── 推送進度到雲端 ────────────────────────────────────────────────────
async function pushProgressToCloud() {
  if (!isLoggedIn() || !_supabase) return;
  // appState 由主應用提供（全域變數）
  if (typeof appState === 'undefined') return;

  try {
    const persist = { ...appState };
    delete persist._todayLearnedQueue;

    const payload = {
      user_id:          _currentUser.id,
      current_day:      persist.currentDay      || 1,
      streak:           persist.streak          || 0,
      last_active_date: persist.lastActiveDate  || null,
      total_stars:      persist.totalStars      || 0,
      badges:           persist.badges          || [],
      word_mastery:     persist.wordMastery     || {},
      daily_records:    persist.dailyRecords    || {},
      wrong_words:      persist.wrongWords      || [],
      stats:            persist.stats           || { spellingCorrect: 0, testPerfectCount: 0 },
      reduced_motion:   persist.reducedMotion   || false,
    };

    const { error } = await _supabase
      .from('user_progress')
      .upsert(payload, { onConflict: 'user_id' });

    if (error) throw error;
    showSyncStatus('✓ 已同步', 'grass');
    console.log('[Sync] 進度已推送至雲端');
  } catch (err) {
    console.warn('[Sync] 推送失敗：', err.message);
    showSyncStatus('同步失敗', 'coral');
  }
}

// ── 從雲端拉取並與本地合併 ────────────────────────────────────────────
async function pullAndMergeProgress() {
  if (!isLoggedIn() || !_supabase) return;

  try {
    showSyncStatus('同步中…', 'sky');
    const { data, error } = await _supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', _currentUser.id)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = 無記錄（首次登入）

    if (!data) {
      // 首次登入：將本地進度上傳到雲端
      console.log('[Sync] 首次登入，上傳本地進度');
      await pushProgressToCloud();
      showSyncStatus('✓ 本地進度已備份', 'grass');
      return;
    }

    // 合併策略：取本地與雲端中「進度較多」的一方
    const cloudState = {
      currentDay:      data.current_day,
      streak:          data.streak,
      lastActiveDate:  data.last_active_date,
      totalStars:      data.total_stars,
      badges:          data.badges || [],
      wordMastery:     data.word_mastery || {},
      dailyRecords:    data.daily_records || {},
      wrongWords:      data.wrong_words || [],
      stats:           data.stats || { spellingCorrect: 0, testPerfectCount: 0 },
      reducedMotion:   data.reduced_motion || false,
    };

    const localStars  = (typeof appState !== 'undefined') ? (appState.totalStars || 0) : 0;
    const cloudStars  = cloudState.totalStars || 0;
    const localWords  = (typeof appState !== 'undefined') ? Object.keys(appState.wordMastery || {}).length : 0;
    const cloudWords  = Object.keys(cloudState.wordMastery || {}).length;

    // 以「星星 + 掌握詞彙數」作為進度指標，取較大值的那份
    const localScore  = localStars + localWords;
    const cloudScore  = cloudStars + cloudWords;

    if (cloudScore > localScore) {
      // 雲端進度更多：用雲端覆蓋本地
      console.log('[Sync] 雲端進度更多，覆蓋本地');
      if (typeof appState !== 'undefined') {
        Object.assign(appState, cloudState);
        appState._todayLearnedQueue = [];
        if (typeof saveState === 'function') saveState();
        if (typeof showPage === 'function') showPage('home');
      }
      showSyncStatus('✓ 已從雲端恢復進度', 'grass');
    } else {
      // 本地進度更多或相等：推送本地到雲端
      console.log('[Sync] 本地進度更多，推送至雲端');
      await pushProgressToCloud();
      showSyncStatus('✓ 進度已同步', 'grass');
    }
  } catch (err) {
    console.warn('[Sync] 拉取失敗：', err.message);
    showSyncStatus('同步失敗', 'coral');
  }
}

// ── 登入彈窗 ──────────────────────────────────────────────────────────
function showAuthModal() {
  if (!_supabase) {
    alert('Supabase 未初始化，請稍後再試');
    return;
  }

  if (isLoggedIn()) {
    // 已登入：顯示帳號管理
    showAccountModal();
    return;
  }

  const html = `
    <span class="mascot lg">☁️</span>
    <h3 class="text-2xl font-extrabold text-ink mt-2">登入 / 注冊</h3>
    <p class="text-gray-400 text-xs mt-1">登入後，學習進度自動雲端備份，換裝置也不怕丟失！</p>

    <div id="auth-error" class="hidden text-coral text-xs mt-2 p-2 bg-coral/10 rounded-xl"></div>

    <div class="mt-4 space-y-3 text-left">
      <div>
        <label class="text-xs font-bold text-gray-500 mb-1 block">電子郵件</label>
        <input id="auth-email" type="email" placeholder="your@email.com"
          class="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-sky" />
      </div>
      <div>
        <label class="text-xs font-bold text-gray-500 mb-1 block">密碼（至少 6 位）</label>
        <input id="auth-password" type="password" placeholder="••••••••"
          class="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-sky" />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 mt-4">
      <button id="auth-signin" class="kid-btn kid-btn-primary h-12 text-sm">登入</button>
      <button id="auth-signup" class="kid-btn kid-btn-ghost h-12 text-sm">注冊</button>
    </div>

    <div class="relative my-4">
      <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-gray-200"></div></div>
      <div class="relative flex justify-center"><span class="bg-white px-3 text-xs text-gray-400">或</span></div>
    </div>

    <button id="auth-google" class="kid-btn kid-btn-ghost w-full h-12 text-sm flex items-center justify-center gap-2">
      <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
      使用 Google 登入
    </button>

    <button class="modal-cancel kid-btn kid-btn-ghost w-full h-10 mt-2 text-sm text-gray-400">稍後再說</button>
  `;

  if (typeof showModal === 'function') {
    showModal(html, root => {
      const emailEl    = root.querySelector('#auth-email');
      const passEl     = root.querySelector('#auth-password');
      const errorEl    = root.querySelector('#auth-error');

      function showError(msg) {
        errorEl.textContent = msg;
        errorEl.classList.remove('hidden');
      }

      root.querySelector('#auth-signin').addEventListener('click', async () => {
        const email = emailEl.value.trim();
        const pass  = passEl.value;
        if (!email || !pass) { showError('請輸入郵件和密碼'); return; }
        root.querySelector('#auth-signin').textContent = '登入中…';
        const { error } = await _supabase.auth.signInWithPassword({ email, password: pass });
        if (error) { showError(error.message); root.querySelector('#auth-signin').textContent = '登入'; }
        else { if (typeof closeModal === 'function') closeModal(); }
      });

      root.querySelector('#auth-signup').addEventListener('click', async () => {
        const email = emailEl.value.trim();
        const pass  = passEl.value;
        if (!email || !pass) { showError('請輸入郵件和密碼'); return; }
        if (pass.length < 6) { showError('密碼至少需要 6 位'); return; }
        const signupBtn = root.querySelector('#auth-signup');
        signupBtn.textContent = '注冊中…';
        signupBtn.disabled = true;

        const { data: signUpData, error: signUpError } = await _supabase.auth.signUp({ email, password: pass });
        if (signUpError) {
          showError(signUpError.message);
          signupBtn.textContent = '注冊';
          signupBtn.disabled = false;
          return;
        }

        // 若 email 確認已關閉，session 會直接回傳；否則需要再次 signIn
        if (signUpData?.session) {
          // 已直接取得 session（email confirm 已關閉）
          if (typeof closeModal === 'function') closeModal();
          showSyncStatus('✓ 注冊並登入成功', 'grass');
        } else {
          // email confirm 開啟中，嘗試直接 signIn
          const { error: signInError } = await _supabase.auth.signInWithPassword({ email, password: pass });
          if (signInError) {
            // 登入失敗（可能需要驗證 email）
            if (typeof closeModal === 'function') closeModal();
            if (typeof showResultModal === 'function') {
              showResultModal('注冊成功！', '<p>請查收確認郵件，驗證後即可登入。</p>', { mascot: '🎉' });
            }
          } else {
            if (typeof closeModal === 'function') closeModal();
            showSyncStatus('✓ 注冊並登入成功', 'grass');
          }
        }
      });

      root.querySelector('#auth-google').addEventListener('click', async () => {
        const { error } = await _supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin + window.location.pathname }
        });
        if (error) showError(error.message);
      });

      root.querySelector('.modal-cancel').addEventListener('click', () => {
        if (typeof closeModal === 'function') closeModal();
      });
    });
  }
}

// ── 帳號管理彈窗（已登入時顯示） ─────────────────────────────────────
function showAccountModal() {
  const email = _currentUser?.email || '未知';
  const html = `
    <span class="mascot lg">☁️</span>
    <h3 class="text-2xl font-extrabold text-ink mt-2">我的帳號</h3>
    <p class="text-gray-400 text-sm mt-1">${email}</p>
    <div class="mt-4 space-y-3">
      <button id="account-sync-now" class="kid-btn kid-btn-primary w-full h-12 text-sm">
        <i class="fa-solid fa-cloud-arrow-up"></i> 立即同步進度
      </button>
      <button id="account-pull" class="kid-btn kid-btn-ghost w-full h-12 text-sm">
        <i class="fa-solid fa-cloud-arrow-down"></i> 從雲端恢復進度
      </button>
      <button id="account-signout" class="kid-btn kid-btn-ghost w-full h-12 text-sm text-coral">
        <i class="fa-solid fa-right-from-bracket"></i> 登出
      </button>
    </div>
    <button class="modal-cancel kid-btn kid-btn-ghost w-full h-10 mt-2 text-sm text-gray-400">關閉</button>
  `;

  if (typeof showModal === 'function') {
    showModal(html, root => {
      root.querySelector('#account-sync-now').addEventListener('click', async () => {
        root.querySelector('#account-sync-now').textContent = '同步中…';
        await pushProgressToCloud();
        root.querySelector('#account-sync-now').innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> 立即同步進度';
      });

      root.querySelector('#account-pull').addEventListener('click', async () => {
        if (typeof closeModal === 'function') closeModal();
        await pullAndMergeProgress();
      });

      root.querySelector('#account-signout').addEventListener('click', async () => {
        await _supabase.auth.signOut();
        if (typeof closeModal === 'function') closeModal();
        if (typeof showResultModal === 'function') {
          showResultModal('已登出', '<p>進度已保存在本機，下次登入會自動同步。</p>', { mascot: '🦊' });
        }
      });

      root.querySelector('.modal-cancel').addEventListener('click', () => {
        if (typeof closeModal === 'function') closeModal();
      });
    });
  }
}

// ── 對外暴露 API ──────────────────────────────────────────────────────
window.PetSync = {
  init:              initSupabase,
  isLoggedIn,
  getCurrentUser,
  scheduleSyncToCloud,
  pushProgressToCloud,
  pullAndMergeProgress,
  showAuthModal,
  showAccountModal,
  updateAuthUI,
};
