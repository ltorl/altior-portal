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

let savedSites = [];

function loadSavedSites() {
    const stored = localStorage.getItem('altior_saved_sites');
    if (stored) {
        try {
            savedSites = JSON.parse(stored);
            renderSavedSites();
        } catch (e) {
            console.error('Failed to load saved sites:', e);
        }
    }
}

function renderSavedSites() {
    const savedGrid = document.getElementById('saved-grid');
    const savedSection = document.getElementById('saved-section');
    if (!savedGrid || !savedSection) return;

    if (savedSites.length === 0) {
        savedSection.hidden = true;
    } else {
        savedSection.hidden = false;
        savedGrid.innerHTML = savedSites.map((site, index) => `
            <div class="saved-link saved-site-item" data-url="${escapeHtml(site.url)}" data-index="${index}">
                ${escapeHtml(site.title || site.url)}
                <span class="delete-saved" data-index="${index}">✖</span>
            </div>
        `).join('');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function fetchPageTitle(url) {
    try {
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        const data = await response.json();

        if (data && data.contents) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(data.contents, 'text/html');
            const title = doc.querySelector('title');
            if (title && title.textContent) {
                try {
                    const pageTitle = title.textContent;
                    pageTitle = pageTitle.hostname.replace(' at DuckDuckGo', '');
                    return pageTitle.trim();
                } catch (error) {
                    return title.textContent.trim();
                }
            }
        }
        try {
            const urlObj = new URL(url);
            urlObj = urlObj.hostname.replace('https://', '');
            return urlObj.hostname.replace('www.', '');
        } catch (e) {
            return 'Saved Site';
        }
    } catch (error) {
        console.error('Error fetching title:', error);
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace('www.', '');
        } catch (e) {
            return 'Saved Site';
        }
    }
}

async function saveCurrentSite() {
    const urlInput = document.getElementById('url-input');
    const errorDiv = document.getElementById('error-message');
    const saveBtn = document.getElementById('save-site-btn');

    let url = urlInput.value.trim();

    if (!url) {
        errorDiv.textContent = 'Please enter a URL to save';
        errorDiv.style.display = 'block';
        setTimeout(() => { errorDiv.style.display = 'none'; }, 3000);
        return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://duckduckgo.com/?q=' + url;
    }

    try {
        new URL(url);
    } catch (e) {
        errorDiv.textContent = 'Please enter a valid URL';
        errorDiv.style.display = 'block';
        setTimeout(() => { errorDiv.style.display = 'none'; }, 3000);
        return;
    }

    if (savedSites.some(site => site.url === url)) {
        errorDiv.textContent = 'This site is already saved!';
        errorDiv.style.display = 'block';
        setTimeout(() => { errorDiv.style.display = 'none'; }, 3000);
        return;
    }

    const originalBtnText = saveBtn.textContent;
    saveBtn.textContent = 'Loading...';
    saveBtn.disabled = true;
    errorDiv.style.display = 'none';

    try {
        const title = await fetchPageTitle(url);
        savedSites.push({ url, title });
        localStorage.setItem('altior_saved_sites', JSON.stringify(savedSites));
        renderSavedSites();
    } catch (error) {
        errorDiv.textContent = 'Failed to save site. Please try again.';
        errorDiv.style.display = 'block';
        setTimeout(() => { errorDiv.style.display = 'none'; }, 3000);
    } finally {
        saveBtn.textContent = originalBtnText;
        saveBtn.disabled = false;
    }
}

function setupDelegatedEvents() {
    const container = document.getElementById('search-container');
    if (!container) return;

    container.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.delete-saved');
        if (deleteBtn) {
            e.stopPropagation();
            const index = deleteBtn.getAttribute('data-index');
            if (index !== null) {
                savedSites.splice(parseInt(index), 1);
                localStorage.setItem('altior_saved_sites', JSON.stringify(savedSites));
                renderSavedSites();
            }
            return;
        }

        const link = e.target.closest('.quick-link, .saved-link');
        if (link) {
            const url = link.getAttribute('data-url');
            if (url) navigate(url);
        }
    });
}

const style = document.createElement('style');
style.textContent = `
    #save-site-btn:hover {
        background: #5a6268 !important;
        box-shadow: 0 0 15px rgba(108, 117, 125, 0.5);
        transform: scale(1.02);
    }
    #save-site-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
    .saved-link {
        cursor: pointer;
    }
`;
document.head.appendChild(style);

document.addEventListener('DOMContentLoaded', () => {
    loadSavedSites();
    setupDelegatedEvents();

    const saveBtn = document.getElementById('save-site-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveCurrentSite);
    }

    const urlInput = document.getElementById('url-input');
    if (urlInput) {
        urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const goBtn = document.getElementById('go-btn');
                if (goBtn) goBtn.click();
            }
        });
    }
});

initScramjet();
