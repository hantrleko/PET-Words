/* =====================================================================
 * PET Kids Service Worker — 離線快取策略
 * 版本：v1.0
 * 策略：Cache First（靜態資源）+ Network First（API 請求）
 * ===================================================================== */

const CACHE_NAME = 'pet-kids-v1';
const OFFLINE_URL = '/PET-Words/';

// 預快取的核心靜態資源
const PRECACHE_URLS = [
  '/PET-Words/',
  '/PET-Words/index.html',
  '/PET-Words/js/supabase-sync.js',
  '/PET-Words/js/app.js',
  '/PET-Words/js/vocab-data.js',
  '/PET-Words/css/style.css',
  '/PET-Words/manifest.json',
  '/PET-Words/icons/icon-192.png',
  '/PET-Words/icons/icon-512.png',
];

// ===== Install：預快取核心資源 =====
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-caching core assets');
        // 逐一快取，避免單個失敗導致整體失敗
        return Promise.allSettled(
          PRECACHE_URLS.map(url =>
            cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ===== Activate：清理舊快取 =====
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
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
    }).then(() => self.clients.claim())
  );
});

// ===== Fetch：請求攔截策略 =====
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 跳過非 GET 請求
  if (request.method !== 'GET') return;

  // Supabase API 請求：Network First（優先網路，失敗不快取）
  if (url.hostname.includes('supabase.co') || url.hostname.includes('supabase.com')) {
    event.respondWith(
      fetch(request).catch(() => {
        // Supabase 離線時靜默失敗，不影響 App 主體
        return new Response(JSON.stringify({ error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // CDN 資源（Tailwind、FontAwesome、Chart.js 等）：Stale While Revalidate
  if (url.hostname.includes('cdn.jsdelivr.net') ||
      url.hostname.includes('cdn.bootcdn.net') ||
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

  // 本地靜態資源：Cache First
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
          }
          return response;
        }).catch(() => {
          // 離線時回退到主頁
          if (request.destination === 'document') {
            return caches.match(OFFLINE_URL);
          }
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
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0].postMessage({ success: true });
    });
  }
});
