// Record a headless-Chrome session as PNG frames: node record.mjs <outDir> <url> <seconds> [w h] [actions.json]
// actions.json: [{ "at": 2.5, "js": "document.querySelector(...).click()" }]
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [outDir, url, secs = "10", w = "1440", h = "900", actionsFile] = process.argv.slice(2);
const actions = actionsFile ? JSON.parse(readFileSync(actionsFile, "utf8")) : [];
mkdirSync(outDir, { recursive: true });
const port = 9800 + Math.floor(Math.random() * 100);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", `--remote-debugging-port=${port}`, "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
  "--hide-scrollbars", `--window-size=${w},${h}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "rec-"))}`, "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); let frame = 0;
ws.onmessage = async (m) => {
  const d = JSON.parse(m.data);
  if (d.method === "Page.screencastFrame") {
    writeFileSync(join(outDir, `f${String(frame++).padStart(5, "0")}.jpg`), Buffer.from(d.params.data, "base64"));
    ws.send(JSON.stringify({ id: ++id, method: "Page.screencastFrameAck", params: { sessionId: d.params.sessionId } }));
  }
  if (pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); }
};
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: 1, mobile: false });
await send("Page.enable");
await send("Page.navigate", { url });
await sleep(actions.find((a) => a.preload)?.preload ?? 6000);
await send("Page.startScreencast", { format: "jpeg", quality: 85, everyNthFrame: 1 });
const t0 = Date.now();
for (const a of actions.filter((x) => x.js)) {
  const wait = a.at * 1000 - (Date.now() - t0);
  if (wait > 0) await sleep(wait);
  await send("Runtime.evaluate", { expression: a.js });
}
const rest = +secs * 1000 - (Date.now() - t0);
if (rest > 0) await sleep(rest);
await send("Page.stopScreencast");
const elapsed = (Date.now() - t0) / 1000;
writeFileSync(join(outDir, "meta.json"), JSON.stringify({ frames: frame, seconds: elapsed }));
ws.close(); chrome.kill();
console.log(`frames ${frame} in ${elapsed.toFixed(1)}s`);
process.exit(0);
