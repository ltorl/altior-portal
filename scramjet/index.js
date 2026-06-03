import { BareMuxConnection } from '@mercuryworkshop/bare-mux';
import '/scram/scramjet.all.js';

const input = document.getElementById('url-input');
const button = document.getElementById('go-btn');
const errorDiv = document.getElementById('error-message');

let scramjet = null;
let isScramjetReady = false;

async function initScramjet() {
    try {
        const { ScramjetController } = $scramjetLoadController();
        scramjet = new ScramjetController({
            files: {
                wasm: '/scram/scramjet.wasm.wasm',
                all: '/scram/scramjet.all.js',
                sync: '/scram/scramjet.sync.js',
            }
        });
        await scramjet.init();
        isScramjetReady = true;
        console.log('Scramjet initialized');
    } catch (err) {
        console.error('Scramjet init failed:', err);
        errorDiv.textContent = 'Failed to initialize proxy engine.';
        errorDiv.style.display = 'block';
    }
}

async function waitForServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const registration = await navigator.serviceWorker.register('/sw.js');
    if (registration.active) return;
    if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    await new Promise(resolve => {
        const check = () => {
            if (registration.active) resolve();
            else setTimeout(check, 100);
        };
        check();
    });
    console.log('Service Worker active');
}

function normalizeUrl(query) {
    query = query.trim();
    if (!query) return null;
    const isUrl = query.includes('.') && !query.includes(' ');
    if (!isUrl) {
        return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    }
    if (!query.startsWith('http://') && !query.startsWith('https://')) {
        return 'https://' + query;
    }
    return query;
}

async function navigate(query) {
    const url = normalizeUrl(query);
    if (!url) return;

    errorDiv.style.display = 'none';

    if (!isScramjetReady) {
        errorDiv.textContent = 'Proxy engine is still loading, please wait.';
        errorDiv.style.display = 'block';
        return;
    }

    try {
        await waitForServiceWorker();
    } catch (err) {
        errorDiv.textContent = 'Service Worker activation failed: ' + err.message;
        errorDiv.style.display = 'block';
        return;
    }

    const connection = new BareMuxConnection('/baremux/worker.js');
    const wispUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/wisp/`;
    const currentTransport = await connection.getTransport();
    if (currentTransport !== '/libcurl/index.mjs') {
        await connection.setTransport('/libcurl/index.mjs', [{ websocket: wispUrl }]);
        console.log('Transport set to libcurl with wisp:', wispUrl);
    }

    const popupWin = window.open('about:blank', '_blank');
    if (!popupWin) {
        errorDiv.textContent = 'Popup blocked! Please allow popups for this site.';
        errorDiv.style.display = 'block';
        return;
    }

    const popupHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Proxied Site</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { overflow: hidden; height: 100vh; width: 100vw; }
                iframe { width: 100%; height: 100%; border: none; }
            </style>
        </head>
        <body>
            <script type="importmap">
                {
                    "imports": {
                        "@mercuryworkshop/bare-mux": "/baremux/index.mjs"
                    }
                }
            <\/script>
            <script type="module">
                import { BareMuxConnection } from '@mercuryworkshop/bare-mux';
                window.addEventListener('load', async () => {
                    try {
                        await import('/scram/scramjet.all.js');
                        const { ScramjetController } = $scramjetLoadController();
                        const scramjet = new ScramjetController({
                            files: {
                                wasm: '/scram/scramjet.wasm.wasm',
                                all: '/scram/scramjet.all.js',
                                sync: '/scram/scramjet.sync.js',
                            }
                        });
                        await scramjet.init();
                        await new Promise(r => setTimeout(r, 50));
                        const connection = new BareMuxConnection('/baremux/worker.js');
                        const wispUrl = '${wispUrl}';
                        const currentTransport = await connection.getTransport();
                        if (currentTransport !== '/libcurl/index.mjs') {
                            await connection.setTransport('/libcurl/index.mjs', [{ websocket: wispUrl }]);
                        }
                        const frameObj = scramjet.createFrame();
                        const frame = frameObj.frame;
                        frame.style.width = '100%';
                        frame.style.height = '100%';
                        frame.style.border = 'none';
                        document.body.appendChild(frame);
                        frameObj.go('${url.replace(/'/g, "\\'")}');
                    } catch (err) {
                        console.error('Popup Scramjet init error:', err);
                    }
                });
            <\/script>
        </body>
        </html>
    `;

    popupWin.document.open();
    popupWin.document.write(popupHtml);
    popupWin.document.close();

    input.value = '';
}

button.addEventListener('click', () => navigate(input.value));
input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') navigate(input.value);
});

window.navigate = navigate;

function initQuickLinks() {
    const quickLinks = document.querySelectorAll('.quick-link');
    quickLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const url = link.getAttribute('data-url');
            if (url) navigate(url);
        });
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQuickLinks);
} else {
    initQuickLinks();
}

initScramjet();

