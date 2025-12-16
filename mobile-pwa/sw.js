/**
 * Service Worker - PWA 오프라인 지원
 */

const CACHE_NAME = 'bangsel-helper-v1';

// 캐시할 파일 목록
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './camera.js',
  './webrtc-sender.js',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

// 설치 이벤트
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Installation complete');
        return self.skipWaiting();
      })
  );
});

// 활성화 이벤트
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Activation complete');
        return self.clients.claim();
      })
  );
});

// Fetch 이벤트 (Network First 전략)
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Firebase 등 외부 API는 캐시하지 않음
  if (request.url.includes('firebaseio.com') ||
      request.url.includes('googleapis.com') ||
      request.url.includes('gstatic.com')) {
    return;
  }

  event.respondWith(
    // 네트워크 우선 시도
    fetch(request)
      .then((response) => {
        // 성공하면 캐시 업데이트
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(request, responseClone);
            });
        }
        return response;
      })
      .catch(() => {
        // 네트워크 실패 시 캐시에서 가져오기
        return caches.match(request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }

            // HTML 요청이면 오프라인 페이지 반환
            if (request.headers.get('accept').includes('text/html')) {
              return caches.match('./index.html');
            }

            // 그 외는 에러 반환
            return new Response('Offline', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});

// 푸시 알림 (선택적)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();

    self.registration.showNotification(data.title || '방셀 헬퍼', {
      body: data.body || '',
      icon: './assets/icons/icon-192.png',
      badge: './assets/icons/icon-72.png',
      tag: 'bangsel-helper'
    });
  }
});

// 알림 클릭
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window' })
      .then((clientList) => {
        // 이미 열린 창이 있으면 포커스
        for (const client of clientList) {
          if (client.url.includes('bangsel') && 'focus' in client) {
            return client.focus();
          }
        }
        // 없으면 새 창 열기
        if (clients.openWindow) {
          return clients.openWindow('./');
        }
      })
  );
});
