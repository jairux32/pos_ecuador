#!/usr/bin/env node
/**
 * Tiny reverse proxy to make frontend and backend same-origin.
 *
 * The frontend dev server runs on :3000. The FastAPI backend runs on :8000.
 * Cookies set on cross-origin XHR (different ports) are blocked by Firefox
 * with SameSite=Lax (default), causing the user to be silently logged out
 * after the first request.
 *
 * This proxy sits at :3001 and forwards:
 *   - /api/*  → http://127.0.0.1:8000
 *   - everything else (static assets) → http://127.0.0.1:3000
 *
 * Then open http://localhost:3001 instead of :3000. All requests are
 * same-origin, cookies work in every browser.
 *
 * Usage: node dev-proxy.js
 */
const http = require("http");
const httpProxy = require("http-proxy");

const PORT = parseInt(process.env.PROXY_PORT || "3001", 10);
const FRONTEND = process.env.FRONTEND_URL || "http://127.0.0.1:3000";
const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:8000";

const proxy = httpProxy.createProxyServer({ ws: true });

proxy.on("error", (err, req, res) => {
  console.error(`[proxy] ${req.method} ${req.url} → error: ${err.message}`);
  if (res && res.writeHead && !res.headersSent) {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end(`Proxy error: ${err.message}\nIs the backend running on ${BACKEND}?`);
  }
});

const server = http.createServer((req, res) => {
  const target = req.url.startsWith("/api/") || req.url === "/api"
    ? BACKEND
    : FRONTEND;
  proxy.web(req, res, { target, changeOrigin: true }, (err) => {
    console.error(`[proxy] ${req.method} ${req.url} → ${err.message}`);
  });
});

server.on("upgrade", (req, socket, head) => {
  const target = req.url.startsWith("/api/") ? BACKEND : FRONTEND;
  proxy.ws(req, socket, head, { target, changeOrigin: true });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[proxy] listening on http://0.0.0.0:${PORT}`);
  console.log(`[proxy] /api/* → ${BACKEND}`);
  console.log(`[proxy] *       → ${FRONTEND}`);
  console.log(`[proxy] Open http://localhost:${PORT} in your browser.`);
});
