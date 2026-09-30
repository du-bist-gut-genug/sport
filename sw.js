/* Service worker : hors-ligne + notification de fin de repos.
   Change VERSION à chaque modification d'index.html pour forcer la mise à jour. */
const VERSION = "muscu-v13";
const FICHIERS = [
  "./", "./index.html", "./manifest.webmanifest",
  "./icone-192.png", "./icone-512.png", "./icone-maskable-512.png", "./apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((rep) => {
      const reseau = fetch(e.request)
        .then((r) => {
          if (r && r.status === 200) {
            const clone = r.clone();
            caches.open(VERSION).then((c) => c.put(e.request, clone));
          }
          return r;
        })
        .catch(() => rep);
      return rep || reseau;
    })
  );
});

/* ── chrono de repos en arrière-plan ──
   La page envoie l'heure de fin quand elle passe en arrière-plan.
   Le service worker déclenche alors la notification à l'heure dite. */
let minuteur = null;

function notifier() {
  return self.registration.showNotification("C'est reparti", {
    body: "Repos terminé — enchaîne ta série.",
    tag: "repos",
    renotify: true,
    requireInteraction: true,
    icon: "icone-192.png",
    badge: "icone-192.png",
    vibrate: [200, 100, 200],
    data: { url: "./index.html" }
  });
}

self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type === "repos") {
    clearTimeout(minuteur);
    const delai = Math.max(0, d.at - Date.now());
    minuteur = setTimeout(() => { notifier(); }, delai);
  }
  if (d.type === "annule") {
    clearTimeout(minuteur);
    minuteur = null;
  }
});

/* Un appui sur la notification ramène l'application au premier plan. */
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((liste) => {
      for (const c of liste) {
        if ("focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./index.html");
    })
  );
});
