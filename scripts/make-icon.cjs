// Renders build/icon.png (1024×1024) from SVG using Electron. Run: npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c7cf0"/><stop offset="1" stop-color="#4a4ac4"/></linearGradient></defs>
  <rect x="64" y="64" width="896" height="896" rx="200" fill="url(#g)"/>
  <rect x="232" y="322" width="560" height="380" rx="48" fill="none" stroke="#fff" stroke-width="44"/>
  <path d="M252 352 L512 540 L772 352" fill="none" stroke="#fff" stroke-width="44" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="M800 150 l22 52 52 22 -52 22 -22 52 -22 -52 -52 -22 52 -22z" fill="#fff"/>
</svg>`;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, transparent: true,
    webPreferences: { offscreen: true } });
  await win.loadURL(`data:text/html,${encodeURIComponent(`<style>html,body{margin:0;background:transparent}</style>${svg}`)}`);
  await new Promise((r) => setTimeout(r, 300));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  const out = path.join(__dirname, "..", "build", "icon.png");
  fs.writeFileSync(out, img.resize({ width: 1024, height: 1024 }).toPNG());
  console.log("wrote", out);
  app.quit();
});
