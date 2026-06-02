"use strict";
/**
 * @type {HTMLFormElement}
 */
const form = document.getElementById("sj-form");
/**
 * @type {HTMLInputElement}
 */
const address = document.getElementById("sj-address");
/**
 * @type {HTMLInputElement}
 */
const searchEngine = document.getElementById("sj-search-engine");
/**
 * @type {HTMLParagraphElement}
 */
const error = document.getElementById("sj-error");
/**
 * @type {HTMLPreElement}
 */
const errorCode = document.getElementById("sj-error-code");

const { ScramjetController } = $scramjetLoadController();

const scramjet = new ScramjetController({
	files: {
		wasm: "/scram/scramjet.wasm.wasm",
		all: "/scram/scramjet.all.js",
		sync: "/scram/scramjet.sync.js",
	},
});

scramjet.init();

const connection = new BareMux.BareMuxConnection("/baremux/worker.js");

form.addEventListener("submit", async (event) => {
	event.preventDefault();

	try {
		await registerSW();
	} catch (err) {
		error.textContent = "Failed to register service worker.";
		errorCode.textContent = err.toString();
		throw err;
	}

	const url = search(address.value, searchEngine.value);

	let wispUrl =
		(location.protocol === "https:" ? "wss" : "ws") +
		"://" +
		location.host +
		"/wisp/";
	if ((await connection.getTransport()) !== "/libcurl/index.mjs") {
		await connection.setTransport("/libcurl/index.mjs", [
			{ websocket: wispUrl },
		]);
	}
	const frame = scramjet.createFrame();
	frame.frame.id = "sj-frame";
	document.body.appendChild(frame.frame);
	frame.go(url);
});

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
        await registerSW();
    } catch (err) {
        errorDiv.textContent = 'Service Worker registration failed: ' + err.message;
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

    const popupWin = window.open("about:blank", "_blank");
    if (!popupWin) {
        errorDiv.textContent = "Popup blocked! Please allow popups for this site.";
        errorDiv.style.display = 'block';
        return;
    }

    const popupContent = `
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
            <iframe id="proxyFrame" src="about:blank"></iframe>
            <script>
                // Re-initialize Scramjet inside the popup
                (async function() {
                    import('/scram/scramjet.all.js').then(async () => {
                        const { ScramjetController } = $scramjetLoadController();
                        const scramjet = new ScramjetController({
                            files: {
                                wasm: '/scram/scramjet.wasm.wasm',
                                all: '/scram/scramjet.all.js',
                                sync: '/scram/scramjet.sync.js',
                            }
                        });
                        await scramjet.init();
                        
                        // Register service worker
                        if ('serviceWorker' in navigator) {
                            await navigator.serviceWorker.register('/sw.js');
                        }
                        
                        // Create and navigate the frame
                        const frameObj = scramjet.createFrame();
                        const frame = frameObj.frame;
                        frame.style.width = '100%';
                        frame.style.height = '100%';
                        frame.style.border = 'none';
                        document.body.appendChild(frame);
                        frameObj.go('${url}');
                    }).catch(err => console.error('Scramjet init error in popup:', err));
                })();
            <\/script>
        </body>
        </html>
    `;

    popupWin.document.open();
    popupWin.document.write(popupContent);
    popupWin.document.close();

    input.value = '';
}
