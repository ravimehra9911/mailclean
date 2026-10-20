// Builds every MailClean logo and icon file from build/logo-source.webp (transparent, 1536×1024):
// mark = envelope + swoosh + sparkles (420–1219 × 217–647), wordmark below it (259–1276 × 690–861).
// Run: npm run brand (after replacing build/logo-source.webp; adjust MARK/FULL if the layout changes).
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..");
const src = path.join(ROOT, "build", "logo-source.webp");
// Where each generated file goes.
const TARGETS = {
  "icon-1024.png": ["build/icon.png", "public/brand/mailclean-icon.png"],
  "mailclean-logo.png": ["public/brand/mailclean-logo.png"],
  "mailclean-mark.png": ["public/brand/mailclean-mark.png"],
  "icon-mark-512.png": ["src/app/icon.png"],
  "apple-icon-180.png": ["src/app/apple-icon.png"],
  "favicon.ico": ["src/app/favicon.ico"],
  "store-app-tile-icon-300x300.png": ["marketing/store-icons/app-tile-icon-300x300.png"],
  "store-box-art-1080x1080.png": ["marketing/store-icons/box-art-1080x1080.png"],
  "store-box-art-2160x2160.png": ["marketing/store-icons/box-art-2160x2160.png"],
  "store-poster-art-720x1080.png": ["marketing/store-icons/poster-art-720x1080.png"],
  "store-poster-art-1440x2160.png": ["marketing/store-icons/poster-art-1440x2160.png"],
};
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await w.loadURL("about:blank");
  const b64 = fs.readFileSync(src).toString("base64");
  const files = await w.webContents.executeJavaScript(`(async () => {
    const img = new Image(); img.src = "data:image/webp;base64,${b64}"; await img.decode();
    const MARK = { x: 420, y: 217, w: 800, h: 431 }, FULL = { x: 259, y: 217, w: 1018, h: 645 };
    const out = {};
    const png = async (c) => { const b = await c.convertToBlob({ type: "image/png" }); const a = new Uint8Array(await b.arrayBuffer()); let s = ""; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s); };
    const canvas = (w, h) => { const c = new OffscreenCanvas(w, h); const g = c.getContext("2d"); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high"; return [c, g]; };
    // Trimmed, transparent crops with a little padding.
    const crop = async (r, pad) => { const [c, g] = canvas(r.w + pad * 2, r.h + pad * 2); g.drawImage(img, r.x, r.y, r.w, r.h, pad, pad, r.w, r.h); return png(c); };
    out["mailclean-logo.png"] = await crop(FULL, 24);
    out["mailclean-mark.png"] = await crop(MARK, 16);
    // Mark centred in a box of size×size at the given share of the width.
    const drawMark = (g, cx, cy, width) => { const h = width * MARK.h / MARK.w; g.drawImage(img, MARK.x, MARK.y, MARK.w, MARK.h, cx - width / 2, cy - h / 2, width, h); };
    // App icon: white rounded tile (macOS-style margins), faint edge so it shows on white desktops.
    const tile = async (size, opaque) => {
      const [c, g] = canvas(size, size);
      const s = size / 1024;
      if (opaque) { g.fillStyle = "#ffffff"; g.fillRect(0, 0, size, size); }
      else {
        g.beginPath(); g.roundRect(64 * s, 64 * s, 896 * s, 896 * s, 200 * s);
        g.fillStyle = "#ffffff"; g.fill();
        g.lineWidth = Math.max(1, 4 * s); g.strokeStyle = "rgba(40,60,140,0.10)"; g.stroke();
      }
      drawMark(g, size / 2 + 6 * s, size / 2 + 6 * s, (opaque ? 820 : 700) * s);
      return png(c);
    };
    out["icon-1024.png"] = await tile(1024, false);
    out["icon-512.png"] = await tile(512, false);
    out["apple-icon-180.png"] = await tile(180, true);
    // Small sizes (browser tabs): the mark alone, filling the square, so it stays legible.
    const bare = async (size) => { const [c, g] = canvas(size, size); drawMark(g, size / 2, size / 2, size * 0.98); return png(c); };
    for (const n of [16, 32, 48]) out["ico-" + n + ".png"] = await bare(n);
    out["ico-256.png"] = await tile(256, false);
    out["icon-mark-512.png"] = await bare(512);
    // Microsoft Store: tile icon, square box art and 2:3 poster art (icon only, white background).
    out["store-app-tile-icon-300x300.png"] = await tile(300, false);
    const art = async (w, h, share) => { const [c, g] = canvas(w, h); g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h); drawMark(g, w / 2, h / 2, Math.min(w, h) * share); return png(c); };
    out["store-box-art-1080x1080.png"] = await art(1080, 1080, 0.7);
    out["store-box-art-2160x2160.png"] = await art(2160, 2160, 0.62);
    out["store-poster-art-720x1080.png"] = await art(720, 1080, 0.8);
    out["store-poster-art-1440x2160.png"] = await art(1440, 2160, 0.74);
    return out;
  })()`);
  const bufs = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, Buffer.from(v, "base64")]));
  // favicon.ico with PNG-compressed entries (16, 32, 48, 256).
  const sizes = [16, 32, 48, 256].map((n) => [n, bufs[`ico-${n}.png`]]);
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach(([n, buf], i) => {
    const e = 6 + i * 16;
    head.writeUInt8(n >= 256 ? 0 : n, e); head.writeUInt8(n >= 256 ? 0 : n, e + 1);
    head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(buf.length, e + 8); head.writeUInt32LE(offset, e + 12); offset += buf.length;
  });
  bufs["favicon.ico"] = Buffer.concat([head, ...sizes.map(([, b]) => b)]);
  for (const [name, dests] of Object.entries(TARGETS)) {
    for (const d of dests) {
      fs.mkdirSync(path.dirname(path.join(ROOT, d)), { recursive: true });
      fs.writeFileSync(path.join(ROOT, d), bufs[name]);
      console.log("wrote", d);
    }
  }
  app.quit();
});
