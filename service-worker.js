// Service worker "app shell" : rend le site installable et relançable
// instantanément (PWA), mais ne met PAS en cache le texte des poèmes
// (data/poemes_content.json) ni les données (content.js) de façon agressive :
// il faut du réseau pour lire un poème. Seule la coquille (HTML/CSS/JS/icônes)
// fonctionne hors-ligne.
//
// IMPORTANT : si vous changez les ?v=N dans index.html (style.css, script.js,
// content.js, logo), mettez aussi à jour la liste SHELL_URLS ci-dessous et
// incrémentez CACHE_NAME, sinon le service worker servira une version périmée.
const CACHE_NAME = 'wolofal-shell-v1';
const SHELL_URLS = [
    '/',
    '/index.html',
    '/style.css?v=14',
    '/script.js?v=14',
    '/content.js?v=14',
    '/manifest.json',
    '/assets/logo_wolofal.png?v=1',
    '/assets/icons/icon-192.png',
    '/assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(SHELL_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return; // laisse passer Drive/YouTube/polices

    // Navigation (chargement direct ou F5 sur une URL propre type /auteur/poeme) :
    // reseau d'abord pour avoir la derniere version, repli sur la coquille en cache
    // si hors-ligne (le routeur cote client se charge alors d'afficher la bonne vue).
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(() => caches.match('/index.html'))
        );
        return;
    }

    // Ne jamais mettre en cache les donnees (texte des poemes, JSON) : toujours
    // le reseau, conformement au choix "coquille seule" (pas de lecture hors-ligne).
    if (url.pathname.startsWith('/data/')) {
        return;
    }

    // Coquille (JS/CSS/icones) : cache d'abord, reseau en repli/mise a jour.
    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;
            return fetch(request).then((response) => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return response;
            });
        })
    );
});
