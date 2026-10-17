// Electron helper for scripts/screenshots.mjs: loads the demo and saves PNGs.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const [base, outDir] = process.argv.slice(-2);
const W = 1440, H = 900;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const setSelect = (label, value) => `(() => {
  const el = document.querySelector('select[aria-label="${label}"]');
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event("change", { bubbles: true }));
})()`;
// Clicks the first button whose text starts or ends with `text` (provider cards start with their icon letter).
const clickText = (text) => `(() => { const b = [...document.querySelectorAll("button")].find((b) => {
  const t = b.textContent.trim(); return t.startsWith(${JSON.stringify(text)}) || t.endsWith(${JSON.stringify(text)}); });
  if (!b) throw new Error("no button: ${text}"); b.click(); })()`;
// Marketing screenshots don't need the "Live demo" banner.
const hideBanner = `[...document.querySelectorAll("main > div")].find((d) => d.textContent.startsWith("Live demo"))?.remove()`;

const SHOTS = [
  { name: "overview-dark", theme: "dark", steps: [] },
  { name: "senders-light", theme: "light", steps: [clickText("Senders")] },
  { name: "filter-dark", theme: "dark", steps: [setSelect("Date range", `year:${new Date().getFullYear() - 1}`)] },
  { name: "add-account-light", theme: "light", steps: [clickText("Accounts"), clickText("Gmail")] },
];

app.disableHardwareAcceleration();
// Never hang: give up after two minutes.
setTimeout(() => { console.error("capture timed out"); app.exit(1); }, 120_000).unref();
process.on("unhandledRejection", (e) => { console.error(e); app.exit(1); });

const waitFor = (win, js) => win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
  const t0 = Date.now();
  (function poll() { if (${js}) resolve(true); else if (Date.now() - t0 > 15000) reject(new Error("timeout: ${js.replace(/"/g, "'")}")); else setTimeout(poll, 100); })();
})`);

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: W, height: H, show: false, useContentSize: true, webPreferences: { offscreen: true } });
  for (const shot of SHOTS) {
    await win.loadURL(`${base}/demo`);
    await win.webContents.executeJavaScript(`localStorage.setItem("mailclean-theme", "${shot.theme}"); localStorage.setItem("mailclean-tour-done", "1")`);
    await win.loadURL(`${base}/demo`);
    // Wait for the dashboard and its data.
    await waitFor(win, `document.querySelector('select[aria-label="Date range"] option[value^="year:"]')`);
    await sleep(800);
    for (const step of shot.steps) {
      await win.webContents.executeJavaScript(step);
      await sleep(900);
    }
    await win.webContents.executeJavaScript(hideBanner);
    await win.webContents.executeJavaScript("window.scrollTo(0, 0)");
    await sleep(300);
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: W, height: H });
    const file = path.join(outDir, `${shot.name}.png`);
    fs.writeFileSync(file, img.resize({ width: W, height: H }).toPNG());
    console.log("saved", path.relative(process.cwd(), file));
  }
  app.exit(0);
});
