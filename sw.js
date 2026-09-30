/* Service worker — Programme hypertrophie
   v14 : le manifeste et la navigation passent en reseau-d'abord,
   les icones restent en cache-d'abord. */

const VERSION = "muscu-v14";

/* Mis en cache a l'installation. Un fichier manquant ne fait plus
   echouer toute l'installation. */
const FICHIERS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icone-192.png",
  "./icone-512.png",
  "./icone-maskable-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) =>
        Promise.all(
          FICHIERS.map((f) =>
            c.add(new Request(f, { cache: "reload" })).catch(() => null)
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((noms) =>
        Promise.all(noms.filter((n) => n !== VERSION).map((n) => caches.delete(n)))
      )
      .then(() => self.clients.claim())
  );
});

/* ── reseau d'abord : on demande toujours au serveur, le cache ne sert
      que de filet de secours hors ligne ── */
function reseauDabord(requete) {
  return fetch(requete)
    .then((r) => {
      if (r && r.status === 200 && r.type === "basic") {
        const clone = r.clone();
        caches.open(VERSION).then((c) => c.put(requete, clone));
      }
      return r;
    })
    .catch(() =>
      caches.match(requete).then((rep) => rep || caches.match("./index.html"))
    );
}

/* ── cache d'abord : pour les ressources figees (icones) ── */
function cacheDabord(requete) {
  return caches.match(requete).then((rep) => {
    if (rep) return rep;
    return fetch(requete).then((r) => {
      if (r && r.status === 200 && r.type === "basic") {
        const clone = r.clone();
        caches.open(VERSION).then((c) => c.put(requete, clone));
      }
      return r;
    });
  });
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  const navigation =
    e.request.mode === "navigate" ||
    (e.request.destination === "document");

  const manifeste =
    e.request.destination === "manifest" ||
    url.pathname.endsWith(".webmanifest") ||
    url.pathname.endsWith("manifest.json");

  if (navigation || manifeste) {
    e.respondWith(reseauDabord(e.request));
  } else {
    e.respondWith(cacheDabord(e.request));
  }
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
