/* =====================================================================
 * PET Kids Service Worker — 離線快取策略
 * 版本：v20260718  ← 每次部署必須更新此版本號
 * 策略：Network First（核心頁面）+ Cache First（音頻/圖片靜態資源）
 * ===================================================================== */

const CACHE_NAME = 'pet-kids-20260718b';
const OFFLINE_URL = '/PET-Words/';

// 預快取的核心靜態資源（只快取最關鍵的，音頻按需快取）
const PRECACHE_URLS = [
  '/PET-Words/',
  '/PET-Words/index.html',
  '/PET-Words/js/supabase-sync.js',
  '/PET-Words/js/vocab-data.js',
  '/PET-Words/manifest.json',
];

// ===== Install：預快取核心資源 =====
self.addEventListener('install', event => {
  console.log('[SW] Installing v20260718b (sentence MP3s)...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-caching core assets');
        return Promise.allSettled(
          PRECACHE_URLS.map(url =>
            cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err))
          )
        );
      })
      .then(() => {
        console.log('[SW] Install complete, skipping waiting');
        return self.skipWaiting();  // 立即激活新版本，不等待舊頁面關閉
      })
  );
});

// ===== Activate：清理所有舊快取 =====
self.addEventListener('activate', event => {
  console.log('[SW] Activating v20260718b...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Claiming all clients');
      return self.clients.claim();  // 立即接管所有已開啟的頁面
    })
  );
});

// ===== Fetch：請求攔截策略 =====
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 跳過非 GET 請求
  if (request.method !== 'GET') return;

  // Supabase API 請求：Network Only（不快取，離線時靜默失敗）
  if (url.hostname.includes('supabase.co') || url.hostname.includes('supabase.com')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(JSON.stringify({ error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Google TTS 請求：Network Only（不快取，避免快取問題）
  if (url.hostname.includes('translate.googleapis.com')) {
    event.respondWith(fetch(request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // CDN 資源（Tailwind、FontAwesome 等）：Stale While Revalidate
  if (url.hostname.includes('cdn.jsdelivr.net') ||
      url.hostname.includes('cdn.bootcdn.net') ||
      url.hostname.includes('cdn.tailwindcss.com') ||
      url.hostname.includes('fonts.loli.net') ||
      url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(request).then(cached => {
          const fetchPromise = fetch(request).then(response => {
            if (response && response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // 本地音頻 MP3 資源：Cache First（快取後離線可用）
  if (url.origin === self.location.origin && url.pathname.includes('/audio/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
          }
          return response;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // 核心頁面和 JS 資源：Network First（優先從網路取最新版，失敗才用快取）
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // 成功取得新版本，更新快取
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => {
          // 網路失敗，回退到快取
          return caches.match(request).then(cached => {
            if (cached) return cached;
            // 文件請求回退到主頁
            if (request.destination === 'document') {
              return caches.match(OFFLINE_URL);
            }
            return new Response('', { status: 503 });
          });
        })
    );
    return;
  }
});

// ===== 接收來自頁面的訊息 =====
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(names => {
      Promise.all(names.map(n => caches.delete(n))).then(() => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ success: true });
        }
      });
    });
  }
});
