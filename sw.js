/**
 * OOSTAGRI LEIERSKAP - Service Worker
 * Weergawe: 1.1.0
 */

const CACHE_NAME = 'oostagri-leierskap-v4';

const CORE_ASSETS = [
    './',
    './index.html',
    './manifest.json'
];

// Tailwind CDN kan nie gekas word nie weens CORS - slegs React en Babel
const CDN_ASSETS = [
    'https://unpkg.com/react@18/umd/react.production.min.js',
    'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
    'https://unpkg.com/@babel/standalone/babel.min.js'
];

// Install: Cache core assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            // Cache core assets
            await cache.addAll(CORE_ASSETS);

            // Try to cache CDN assets
            for (const url of CDN_ASSETS) {
                try {
                    const response = await fetch(url, { mode: 'cors' });
                    if (response.ok) {
                        await cache.put(url, response);
                    }
                } catch (err) {
                    console.warn('Kon nie kas nie:', url);
                }
            }
        })
    );
    // Moenie skipWaiting hier roep nie - wag vir gebruiker se aksie via SKIP_WAITING boodskap
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

// Fetch: Strategy based on request type
self.addEventListener('fetch', (event) => {
    const { request } = event;
    
    // Skip non-GET requests
    if (request.method !== 'GET') return;
    
    const url = new URL(request.url);
    
    // API calls: Network first, return offline response if fails
    if (url.href.includes('script.google.com') || url.href.includes('googleapis.com/macros')) {
        event.respondWith(
            fetch(request)
                .then(response => response)
                .catch(() => {
                    return new Response(
                        JSON.stringify({ 
                            success: false, 
                            offline: true, 
                            error: 'Geen internetverbinding' 
                        }),
                        { 
                            status: 200,
                            headers: { 'Content-Type': 'application/json' } 
                        }
                    );
                })
        );
        return;
    }
    
    // Fonts: Cache first with network fallback
    if (url.href.includes('fonts.googleapis.com') || url.href.includes('fonts.gstatic.com')) {
        event.respondWith(
            caches.match(request).then(cached => {
                if (cached) return cached;
                
                return fetch(request).then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                    }
                    return response;
                }).catch(() => cached);
            })
        );
        return;
    }
    
    // CDN assets: Cache first
    if (url.href.includes('cdn.') || url.href.includes('unpkg.com')) {
        event.respondWith(
            caches.match(request).then(cached => {
                return cached || fetch(request).then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                    }
                    return response;
                });
            })
        );
        return;
    }
    
    // Local assets: Cache first, network fallback
    event.respondWith(
        caches.match(request).then(cached => {
            if (cached) return cached;
            
            return fetch(request).then(response => {
                // Only cache successful responses
                if (response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                }
                return response;
            }).catch(() => {
                // Return cached version or offline fallback
                return cached || caches.match('./index.html');
            });
        })
    );
});

// Handle background sync for offline evaluations
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-evaluations') {
        event.waitUntil(syncOfflineEvaluations());
    }
});

async function syncOfflineEvaluations() {
    // This will be called when the browser regains connectivity
    // The actual sync logic is in the main app
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
        client.postMessage({ type: 'SYNC_REQUESTED' });
    });
}

// Handle messages from the main app
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
