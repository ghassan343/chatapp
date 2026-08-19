// ============================================
// sw.js — Service Worker
// شرط أساسي عشان المتصفح يعتبر الموقع "قابل للتثبيت" (Installable PWA).
// نخزن هنا فقط ملفات الواجهة الثابتة (Shell)، ولا نخزن أبداً استجابات
// الشات نفسها لأنها لازم تكون حية دايماً من السيرفر.
// ============================================

const CACHE_NAME = 'mohadathati-shell-v1';
const SHELL_FILES = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
];

// عند التثبيت: نخزن ملفات الواجهة الأساسية
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

// عند التفعيل: ننظف أي نسخ كاش قديمة
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// عند الطلب:
// - طلبات الـ API (/api/...) تروح دايماً للشبكة مباشرة (بيانات حية، ما نكاشها)
// - باقي الملفات الثابتة: نجرب الكاش أول، ولو ما فيها نروح للشبكة
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/api/')) {
    return; // اتركه يمر للشبكة مباشرة بدون تدخل
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).catch(() => {
          // لو أوفلاين ولا فيه كاش، رجّع الصفحة الرئيسية على الأقل
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        })
      );
    })
  );
});
