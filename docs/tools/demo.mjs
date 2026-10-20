// Record a scripted UI session to video with Playwright. Agent answers can come from stored recordings (?replay=1),
// so demos cost no model or Qloo quota and look identical every time.
// usage: node docs/tools/demo.mjs <scenario.json> <outDir>
//   scenario: { url, width?, height?, steps: [ {wait}, {click:"text=…"}, {type:"…"}, {press:"Enter"}, {waitFor:"text=…", timeout?}, {shot:"name"}, {scroll:y}, {hover:"selector"} ] }
import { chromium } from "/Users/sarthak/node_modules/playwright/index.mjs";
import { mkdirSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";

const [scenarioFile, outDir] = process.argv.slice(2);
const sc = JSON.parse(readFileSync(scenarioFile, "utf8"));
const W = sc.width ?? 1440, H = sc.height ?? 900;
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: outDir, size: { width: W, height: H } }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.addInitScript(() => {
  // hide the Next.js dev badge in recordings
  const kill = () => document.querySelectorAll("nextjs-portal").forEach((e) => e.remove());
  new MutationObserver(kill).observe(document, { childList: true, subtree: true });
});
await page.goto(sc.url, { waitUntil: "domcontentloaded" });
for (const s of sc.steps) {
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.click) await page.locator(s.click).first().click();
  if (s.hover) await page.locator(s.hover).first().hover();
  if (s.mouse) await page.mouse.move(s.mouse[0], s.mouse[1], { steps: s.mouseSteps ?? 20 });
  if (s.type) await page.keyboard.type(s.type, { delay: s.delay ?? 45 });
  if (s.press) await page.keyboard.press(s.press);
  if (s.scroll != null) await page.mouse.wheel(0, s.scroll);
  if (s.waitFor) await page.locator(s.waitFor).first().waitFor({ timeout: s.timeout ?? 120000 });
  if (s.shot) await page.screenshot({ path: join(outDir, `${s.shot}.png`) });
}
const video = page.video();
await ctx.close();
await browser.close();
const path = await video.path();
renameSync(path, join(outDir, `${sc.name ?? "demo"}.webm`));
console.log("saved", join(outDir, `${sc.name ?? "demo"}.webm`));
