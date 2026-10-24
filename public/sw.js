// © ONOKO-CRÉATIONS — Tous droits réservés.
// Service worker léger : nettoie les anciens caches pour éviter tout écran blanc après mise à jour.
const VERSION = "minkebe-v5";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", () => {
  // Laisse passer toutes les requêtes directement au réseau pour garantir un affichage toujours à jour.
});
