/* UZAYX live app: network-first, never serve an obsolete HTML shell. */
const VERSION='uzayx-live-4.09-20261025';
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const names=await caches.keys();await Promise.all(names.filter(n=>n.startsWith('uzayx-')).map(n=>caches.delete(n)));await self.clients.claim();})()));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const u=new URL(event.request.url);if(u.origin!==self.location.origin)return;event.respondWith(fetch(event.request,{cache:'no-store'}));});
