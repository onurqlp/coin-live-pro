/* Offline shell cache; NEVER cache exchange quotes, pinned GitHub research or live feeds. */
const NAME='uzayx-shell-v4-2-20261019';
const SHELL=['./','./index.html','./styles.css','./finish.css','./desk.css','./proof.css','./atlas.css','./mobile-shell.css','./atlas.js','./mobile-shell.js','./icon.svg'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(NAME).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()).catch(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(x=>x.startsWith('uzayx-shell-')&&x!==NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url);
 if(event.request.method!=='GET'||u.origin!==self.location.origin||!/\/coin-live-pro\/uzayx\//.test(u.pathname))return;
 if(!SHELL.some(p=>u.pathname.endsWith(p.slice(1))))return;
 event.respondWith(fetch(event.request).then(r=>r.ok?r:(caches.match(event.request).then(x=>x||r))).catch(()=>caches.match(event.request)));
});
