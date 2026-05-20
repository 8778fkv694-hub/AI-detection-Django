/*! coi-serviceworker v0.1.7 | MIT License | https://github.com/gzguidoti/coi-serviceworker */
if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

    self.addEventListener("fetch", (event) => {
        if (event.request.cache === "only-if-cached" && event.request.mode !== "same-origin") {
            return;
        }

        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.status === 0) {
                        return response;
                    }

                    const newHeaders = new Headers(response.headers);
                    newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
                    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders,
                    });
                })
                .catch((e) => {
                    console.error(e);
                })
        );
    });
} else {
    (() => {
        // Only run on localhost or secure origins
        const isSecure = window.location.protocol === "https:" || 
                         window.location.hostname === "localhost" || 
                         window.location.hostname === "127.0.0.1";
        
        if (!isSecure && window.location.protocol !== "http:") {
            return;
        }

        if (window.crossOriginIsolated !== false) {
            // Already crossOriginIsolated
            if (window.crossOriginIsolated) {
                console.log("[coi-serviceworker] Page is cross-origin isolated!");
            }
            return;
        }

        if (!navigator.serviceWorker) {
            console.warn("[coi-serviceworker] Service workers are not supported.");
            return;
        }

        navigator.serviceWorker.register(window.document.currentScript.src).then((registration) => {
            console.log("[coi-serviceworker] Service worker registered with scope: ", registration.scope);

            registration.addEventListener("updatefound", () => {
                console.log("[coi-serviceworker] Update found. Reloading page...");
                window.location.reload();
            });

            if (registration.active && !navigator.serviceWorker.controller) {
                console.log("[coi-serviceworker] Service worker active and not yet controlling. Reloading page...");
                window.location.reload();
            }
        });
    })();
}
