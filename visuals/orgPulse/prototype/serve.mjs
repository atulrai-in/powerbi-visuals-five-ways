// Tiny static server for the Org Pulse prototype. Root = the "PBI Claude visual" folder, so the page can read data/*.csv.
// Extensionless imports (tsc output: import "./model") are served from the matching .js file.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PORT = +(process.env.PORT || 5178);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".csv": "text/csv", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (url === "/") { res.writeHead(302, { Location: "/visuals/orgPulse/prototype/" }); return res.end(); }
    let file = path.join(ROOT, url);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    else if (!path.extname(file) && fs.existsSync(file + ".js")) file += ".js";
    fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); return res.end("not found"); }
        res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
        res.end(buf);
    });
}).listen(PORT, () => console.log(`Org Pulse prototype: http://localhost:${PORT}/`));
