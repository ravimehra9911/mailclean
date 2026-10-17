// Records a scripted walkthrough of the web demo (sample data) to an MP4.
// Started by scripts/marketing/record.mjs, which runs the demo server: electron record-demo.cjs <baseUrl> <out.mp4>
const { app, session, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs");

const [base, outFile] = process.argv.slice(-2);
const W = 1920, H = 1080, FPS = 30;
const ZOOM = 4 / 3; // page lays out at 1440×810 and renders sharp at 1080p
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.disableHardwareAcceleration();
setTimeout(() => { console.error("recording timed out"); app.exit(1); }, 240_000).unref();
process.on("unhandledRejection", (e) => { console.error(e); app.exit(1); });

// Helpers injected into the page: a visible cursor, click ripples and captions.
const HELPERS = `(() => {
  if (window.__d) return;
  const st = document.createElement("style");
  st.textContent = \`
    #__cur { position: fixed; z-index: 99999; left: 720px; top: 420px; width: 26px; height: 26px; pointer-events: none;
      transition: left .7s cubic-bezier(.3,.8,.3,1), top .7s cubic-bezier(.3,.8,.3,1); filter: drop-shadow(0 2px 4px rgba(0,0,0,.5)); }
    .__rip { position: fixed; z-index: 99998; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 99px; pointer-events: none;
      border: 3px solid #7c7cf0; animation: __rip .55s ease-out forwards; }
    @keyframes __rip { to { transform: scale(3.2); opacity: 0; } }
    #__cap { position: fixed; z-index: 99997; left: 50%; bottom: 34px; transform: translateX(-50%) translateY(20px); opacity: 0;
      transition: all .45s ease; background: rgba(14,16,19,.88); color: #fff; font: 600 22px/1.3 -apple-system, sans-serif;
      padding: 14px 26px; border-radius: 16px; border: 1px solid rgba(124,124,240,.6); box-shadow: 0 12px 40px rgba(0,0,0,.4); white-space: nowrap; }
    #__cap.on { opacity: 1; transform: translateX(-50%); }
    #__end { position: fixed; inset: 0; z-index: 100000; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
      background: radial-gradient(700px 500px at 30% 20%, rgba(124,124,240,.35), transparent 60%), radial-gradient(700px 500px at 80% 90%, rgba(192,132,252,.25), transparent 60%), #0b0d11;
      color: #eef0f4; font-family: -apple-system, sans-serif; opacity: 0; transition: opacity .6s; }
    #__end.on { opacity: 1; }
  \`;
  document.head.appendChild(st);
  const cur = document.createElement("div");
  cur.id = "__cur";
  cur.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2 L4 19 L8.5 14.8 L11.5 21.5 L14.3 20.3 L11.4 13.7 L17.5 13.5 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  document.body.appendChild(cur);
  const cap = document.createElement("div");
  cap.id = "__cap";
  document.body.appendChild(cap);
  const find = (sel, text) => {
    const els = [...document.querySelectorAll(sel)];
    const el = text === undefined ? els[0] : els.find((e) => { const t = (e.textContent || e.getAttribute("aria-label") || "").trim(); return t === text || t.startsWith(text) || t.endsWith(text); });
    if (!el) throw new Error("not found: " + sel + " " + (text || ""));
    return el;
  };
  window.__d = {
    find,
    async move(el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      await new Promise((r) => setTimeout(r, 250));
      const r = el.getBoundingClientRect();
      cur.style.left = (r.left + Math.min(r.width / 2, 40)) + "px";
      cur.style.top = (r.top + r.height / 2) + "px";
      await new Promise((r) => setTimeout(r, 750));
    },
    async click(el) {
      await this.move(el);
      const r = el.getBoundingClientRect();
      const rip = document.createElement("div");
      rip.className = "__rip";
      rip.style.left = (r.left + Math.min(r.width / 2, 40)) + "px";
      rip.style.top = (r.top + r.height / 2) + "px";
      document.body.appendChild(rip);
      setTimeout(() => rip.remove(), 600);
      el.click();
      await new Promise((r) => setTimeout(r, 350));
    },
    caption(text) {
      cap.classList.remove("on");
      setTimeout(() => { cap.textContent = text; if (text) cap.classList.add("on"); }, text ? 200 : 0);
    },
    select(el, value) {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, value);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    end(html) {
      const e = document.createElement("div");
      e.id = "__end";
      e.innerHTML = html;
      document.body.appendChild(e);
      requestAnimationFrame(() => e.classList.add("on"));
      cur.style.display = "none";
      cap.classList.remove("on");
    },
  };
  window.confirm = () => true;
  // The marketing video doesn't need the "Live demo" banner.
  [...document.querySelectorAll("main > div")].find((d) => d.textContent.startsWith("Live demo"))?.remove();
  [...document.querySelectorAll("nav a")].find((a) => a.textContent.includes("Back to website"))?.remove();
})()`;

const END_CARD = `
  <img src="__ICON__" style="width:120px;height:120px">
  <div style="font-size:64px;font-weight:750;letter-spacing:-1.5px">MailClean</div>
  <div style="font-size:30px;color:#aab1c0">Clean up every inbox in one place</div>
  <div style="display:flex;gap:12px;margin-top:10px;font-size:22px">
    <span style="padding:10px 20px;border-radius:99px;border:1px solid #7c7cf0;background:rgba(124,124,240,.15)">Free</span>
    <span style="padding:10px 20px;border-radius:99px;border:1px solid #7c7cf0;background:rgba(124,124,240,.15)">Open source</span>
    <span style="padding:10px 20px;border-radius:99px;border:1px solid #7c7cf0;background:rgba(124,124,240,.15)">macOS · Windows · Linux</span>
  </div>
  <div style="margin-top:26px;font-size:34px;font-weight:650;padding:20px 34px;border-radius:18px;background:linear-gradient(90deg,#6d6df0,#9b6cf5)">mailclean-gilt.vercel.app</div>
  <div style="font-size:24px;color:#8c93a3;margin-top:6px">github.com/ravimehra9911/mailclean · Built by Ravi Mehra</div>`;

app.whenReady().then(async () => {
  // Start from a clean browser: demo clean-ups are stored in a cookie, which would carry over between runs.
  await session.defaultSession.clearStorageData();
  // Recorder: draws frames onto a canvas and encodes them with MediaRecorder (H.264 MP4).
  const rec = new BrowserWindow({ show: false, webPreferences: { offscreen: true, nodeIntegration: true, contextIsolation: false } });
  await rec.loadURL(`data:text/html,<canvas id=c width=${W} height=${H}></canvas>`);
  await rec.webContents.executeJavaScript(`(() => {
    const { ipcRenderer } = require("electron");
    const c = document.getElementById("c"), g = c.getContext("2d");
    g.fillStyle = "#0b0d11"; g.fillRect(0, 0, ${W}, ${H});
    const stream = c.captureStream(${FPS});
    const mime = MediaRecorder.isTypeSupported("video/mp4;codecs=avc1.640028") ? "video/mp4;codecs=avc1.640028" : "video/webm;codecs=vp9";
    const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10_000_000 });
    const chunks = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = async () => ipcRenderer.send("video", mime, new Uint8Array(await new Blob(chunks).arrayBuffer()));
    ipcRenderer.on("frame", async (_e, buf) => { const bmp = await createImageBitmap(new Blob([buf])); g.drawImage(bmp, 0, 0, ${W}, ${H}); bmp.close(); });
    ipcRenderer.on("stop", () => mr.stop());
    mr.start(1000);
  })()`);

  const win = new BrowserWindow({ width: W, height: H, show: false, useContentSize: true,
    webPreferences: { offscreen: true, zoomFactor: ZOOM } });
  win.webContents.setFrameRate(FPS);
  let last = null;
  win.webContents.on("paint", (_e, _dirty, image) => { last = image; });

  // Load the demo in dark mode first, then start recording.
  await win.loadURL(`${base}/demo`);
  await win.webContents.executeJavaScript(`localStorage.setItem("mailclean-theme","dark"); localStorage.setItem("mailclean-tour-done","1")`);
  await win.loadURL(`${base}/demo`);
  const js = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`);
  await js(`for (let i = 0; i < 150 && !document.querySelector('select[aria-label="Date range"] option[value^="year:"]'); i++) await new Promise(r => setTimeout(r, 100));`);
  await sleep(600);
  const icon = `data:image/png;base64,${fs.readFileSync(require("node:path").join(__dirname, "..", "..", "build", "icon.png")).toString("base64")}`;
  await js(HELPERS);
  await sleep(300);

  const timer = setInterval(() => { if (last) rec.webContents.send("frame", last.toJPEG(92)); }, 1000 / FPS);
  const year = new Date().getFullYear() - 1;

  // ---- The walkthrough ----
  await js(`__d.caption("All your inboxes in one dashboard")`);
  await sleep(1200);
  await js(`await __d.move(__d.find("button", "Senders"))`);
  await sleep(1400);

  await js(`__d.caption("Filter by year or any date range"); const s = __d.find('select[aria-label="Date range"]'); await __d.click(s); __d.select(s, "year:${year}")`);
  await sleep(2600);
  await js(`__d.select(__d.find('select[aria-label="Date range"]'), "all")`);
  await sleep(500);

  await js(`__d.caption("See exactly who fills your inbox"); await __d.click(__d.find("nav button", "Senders"))`);
  await sleep(2000);
  await js(`__d.caption("Sort by any column ▲▼"); await __d.click(__d.find("button", "Size"))`);
  await sleep(1800);
  await js(`await __d.click(__d.find("button", "Emails"))`);
  await sleep(1200);

  await js(`__d.caption("Select the senders you don't need…");
    const boxes = [...document.querySelectorAll('tbody input[type=checkbox]')];
    for (const i of [0, 1, 4]) await __d.click(boxes[i]);`);
  await sleep(900);
  await js(`__d.caption("…and clear thousands of emails in one click"); await __d.click(__d.find("button", "Move to Trash"))`);
  await sleep(2600);

  await js(`__d.caption("One-click unsubscribe from newsletters"); await __d.click(__d.find("nav button", "Newsletters")); await new Promise(r => setTimeout(r, 900)); await __d.click(__d.find("button", "Unsubscribe"))`);
  await sleep(2400);

  await js(`__d.caption("Light & dark mode"); await __d.click(__d.find("button[aria-label=Light]"))`);
  await sleep(2000);

  await js(`__d.caption("Gmail, Yahoo, iCloud, AOL, Zoho & any IMAP"); await __d.click(__d.find("nav button", "Accounts")); await new Promise(r => setTimeout(r, 700)); await __d.click(__d.find("button", "Gmail"))`);
  await sleep(2800);

  await js(`__d.caption("Runs on your computer — your email never leaves it 🔒")`);
  await sleep(2400);

  await js(`__d.end(${JSON.stringify(END_CARD)}.replace("__ICON__", ${JSON.stringify(icon)}))`);
  await sleep(3800);

  clearInterval(timer);
  const done = new Promise((resolve) => ipcMain.once("video", (_e, mime, data) => resolve({ mime, data })));
  rec.webContents.send("stop");
  const { mime, data } = await done;
  const file = mime.startsWith("video/mp4") ? outFile : outFile.replace(/\.mp4$/, ".webm");
  fs.writeFileSync(file, Buffer.from(data));
  console.log("saved", file, mime, `${(data.length / 1e6).toFixed(1)} MB`);
  app.exit(0);
});
