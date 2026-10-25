/* Service Worker —— 让网页首次打开后可以完全离线使用
   注意：file:// 直接双击打开时浏览器不允许注册 SW，此时靠 data.js 内联数据仍可离线运行。 */
const CACHE = 'mankiw-macro-20261025-104150';   // 构建时由 tools/build_web.py 自动改成版本号，改了网页资源务必重新构建
const IMAGES = [
  './data/images/c10_img0.png',
  './data/images/c10_img1.png',
  './data/images/c10_img2.png',
  './data/images/c10_img3.png',
  './data/images/c10_img4.png',
  './data/images/c10_img5.png',
  './data/images/c11_img0.png',
  './data/images/c11_img1.png',
  './data/images/c11_img2.png',
  './data/images/c11_img3.png',
  './data/images/c11_img4.png',
  './data/images/c11_img5.png',
  './data/images/c11_img6.png',
  './data/images/c12_img0.png',
  './data/images/c12_img1.png',
  './data/images/c12_img10.png',
  './data/images/c12_img2.png',
  './data/images/c12_img3.png',
  './data/images/c12_img4.png',
  './data/images/c12_img5.png',
  './data/images/c12_img6.png',
  './data/images/c12_img7.png',
  './data/images/c12_img8.png',
  './data/images/c12_img9.png',
  './data/images/c14_img0.png',
  './data/images/c14_img1.png',
  './data/images/c14_img2.png',
  './data/images/c14_img3.png',
  './data/images/c14_img4.png',
  './data/images/c14_img5.png',
  './data/images/c14_img6.png',
  './data/images/c16_img0.png',
  './data/images/c16_img1.png',
  './data/images/c16_img2.png',
  './data/images/c1_img0.png',
  './data/images/c2_img0.png',
  './data/images/c2_img1.png',
  './data/images/c2_img2.png',
  './data/images/c3_img0.png',
  './data/images/c3_img1.png',
  './data/images/c3_img2.png',
  './data/images/c3_img3.png',
  './data/images/c3_img4.png',
  './data/images/c3_img5.png',
  './data/images/c4_img0.png',
  './data/images/c4_img1.png',
  './data/images/c4_img2.png',
  './data/images/c6_img0.png',
  './data/images/c6_img1.png',
  './data/images/c6_img2.png',
  './data/images/c6_img3.png',
  './data/images/c6_img4.png',
  './data/images/c6_img5.png',
  './data/images/c6_img6.png',
  './data/images/c6_img7.png',
  './data/images/c8_eqA.png',
  './data/images/c8_eqB.png',
  './data/images/c8_img0.png',
  './data/images/c8_img1.png',
  './data/images/c8_img2.png',
  './data/images/c8_img3.png',
  './data/images/c8_img4.png',
  './data/images/c8_img5.png',
  './data/images/c8_img6.png',
];
const CORE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './data.js',
  './dict.js',
  './config.js',
  './sync.js',
  './backup.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(CORE.map(u => c.add(u)).concat(IMAGES.map(u => c.add(u)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 页面导航：优先网络，断网时回落到缓存的 index.html
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(r => {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return r;
        })
        .catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }

  // 静态资源：缓存优先 + 后台更新（stale-while-revalidate）
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      const net = fetch(req).then(r => {
        if (r && r.status === 200 && r.type === 'basic') {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return r;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
