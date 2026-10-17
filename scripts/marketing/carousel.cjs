// Renders the LinkedIn carousel (1080×1350 PNG slides + one PDF) into marketing/.
// Run: npx electron scripts/marketing/carousel.cjs
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(ROOT, "marketing", "carousel");
const W = 1080, H = 1350;

const img = (name) => `data:image/png;base64,${fs.readFileSync(path.join(ROOT, "public", "screenshots", name)).toString("base64")}`;
const ICON = `data:image/png;base64,${fs.readFileSync(path.join(ROOT, "build", "icon.png")).toString("base64")}`;
const SITE = "mailclean.app";
const REPO = "github.com/ravimehra9911/mailclean";

const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
@page { size: ${W}px ${H}px; margin: 0; }
body { background: #0b0d11; font-family: -apple-system, "SF Pro Text", "Segoe UI", Inter, Roboto, sans-serif; color: #eef0f4;
  font-weight: 400; -webkit-font-smoothing: antialiased; }
.slide { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; padding: 80px 76px; display: flex; flex-direction: column;
  background: radial-gradient(900px 600px at 15% 0%, rgba(124,124,240,.28), transparent 60%),
              radial-gradient(800px 600px at 100% 100%, rgba(192,132,252,.20), transparent 60%), #0b0d11;
  page-break-after: always; }
.top { display: flex; align-items: center; gap: 14px; font-size: 26px; font-weight: 600; }
.top img { width: 52px; height: 52px; }
.top .n { margin-left: auto; font-size: 22px; color: #8c93a3; font-weight: 500; }
h1 { font-size: 92px; line-height: 1.02; letter-spacing: -2.5px; font-weight: 750; margin-top: 56px; }
h2 { font-size: 72px; line-height: 1.05; letter-spacing: -2px; font-weight: 750; margin-top: 48px; }
.grad { background: linear-gradient(90deg, #8b8bf5, #c084fc 50%, #60a5fa); -webkit-background-clip: text; color: transparent; }
.sub { font-size: 34px; line-height: 1.35; color: #aab1c0; margin-top: 28px; font-weight: 400; }
.note { margin-top: auto; margin-bottom: 40px; border-radius: 24px; padding: 30px 34px; font-size: 30px; line-height: 1.4;
  background: linear-gradient(90deg, rgba(109,109,240,.22), rgba(155,108,245,.18)); border: 1.5px solid rgba(124,124,240,.45); }
.note b { color: #fff; }
.crop { height: 520px; overflow: hidden; border-radius: 22px; margin-top: 56px; -webkit-mask-image: linear-gradient(#000 75%, transparent); }
.chips { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 34px; }
.chip { font-size: 26px; padding: 12px 22px; border-radius: 999px; border: 1.5px solid #2c313b; background: #151820; color: #dfe3ea; }
.chip.on { border-color: #7c7cf0; background: rgba(124,124,240,.15); color: #fff; }
.shot { border-radius: 22px; overflow: hidden; border: 1.5px solid #2c313b; box-shadow: 0 40px 120px rgba(124,124,240,.35), 0 10px 40px rgba(0,0,0,.6); }
.shot img { display: block; width: 100%; }
.foot { margin-top: auto; padding-top: 24px; display: flex; align-items: center; gap: 16px; font-size: 24px; color: #8c93a3; }
.foot b { color: #eef0f4; font-weight: 600; margin: 0 -8px 0 -6px; }
.foot .swipe { margin-left: auto; color: #b9b9fb; font-weight: 600; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-top: 44px; }
.card { border-radius: 24px; border: 1.5px solid #2a2f39; background: rgba(21,24,32,.85); padding: 30px; }
.card .e { font-size: 46px; }
.card h3 { font-size: 32px; margin-top: 16px; font-weight: 650; letter-spacing: -.5px; }
.card p { font-size: 23px; line-height: 1.4; color: #9aa1b0; margin-top: 10px; font-weight: 400; }
.stat { font-size: 64px; font-weight: 750; letter-spacing: -1.5px; }
.list { margin-top: 44px; display: flex; flex-direction: column; gap: 18px; }
.li { display: flex; gap: 20px; align-items: center; font-size: 32px; border-radius: 20px; border: 1.5px solid #2a2f39; background: rgba(21,24,32,.85); padding: 24px 28px; }
.li .k { font-size: 38px; width: 46px; text-align: center; }
.cta { margin-top: 36px; display: flex; flex-direction: column; gap: 18px; }
.btn { font-size: 34px; font-weight: 650; padding: 26px 34px; border-radius: 22px; display: flex; align-items: center; gap: 18px; }
.btn.p { background: linear-gradient(90deg, #6d6df0, #9b6cf5); color: #fff; box-shadow: 0 20px 60px rgba(124,124,240,.45); }
.btn.s { border: 1.5px solid #2c313b; background: #151820; }
.btn small { font-size: 24px; font-weight: 500; opacity: .75; margin-left: auto; }
.callouts { display: flex; flex-direction: column; gap: 14px; margin-top: 30px; }
.co { font-size: 28px; display: flex; gap: 14px; align-items: center; color: #dfe3ea; }
.co i { width: 14px; height: 14px; border-radius: 99px; background: #7c7cf0; box-shadow: 0 0 0 6px rgba(124,124,240,.2); flex: none; }
`;

const top = (n) => `<div class="top"><img src="${ICON}"> MailClean <span class="n">${n}/6</span></div>`;
const foot = (swipe = true) => `<div class="foot">Built by <b>Ravi Mehra</b> · @ravimehra9911 ${swipe ? '<span class="swipe">Swipe →</span>' : ""}</div>`;

const SLIDES = [
  // 1 — cover
  `<section class="slide">${top(1)}
    <h1>Clean up every inbox <span class="grad">in one place</span></h1>
    <p class="sub">See who fills your Gmail, Yahoo &amp; iCloud. Unsubscribe and clear thousands of emails in one click.</p>
    <div class="chips"><span class="chip on">Free</span><span class="chip on">Open source</span><span class="chip on">100% private</span><span class="chip">macOS · Windows · Linux</span></div>
    <div class="crop"><div class="shot"><img src="${img("overview-dark.png")}"></div></div>
    ${foot()}</section>`,

  // 2 — problem
  `<section class="slide">${top(2)}
    <h2>Your inbox has <span class="grad">thousands</span> of emails you'll never read</h2>
    <div class="grid">
      <div class="card"><div class="e">📰</div><h3>Newsletters</h3><p>Signed up once, still arriving every day.</p></div>
      <div class="card"><div class="e">🏷️</div><h3>Promotions</h3><p>Offers and "last chances" from years ago.</p></div>
      <div class="card"><div class="e">🔔</div><h3>Notifications</h3><p>Apps telling you about other apps.</p></div>
      <div class="card"><div class="e">💾</div><h3>Storage full</h3><p>Gigabytes used by mail nobody opens.</p></div>
    </div>
    <div class="note">Deleting them one by one takes hours.<br><b>MailClean clears them in one click →</b></div>
    ${foot()}</section>`,

  // 3 — see who fills your inbox
  `<section class="slide">${top(3)}
    <h2>See exactly <span class="grad">who</span> fills your inbox</h2>
    <div class="callouts">
      <div class="co"><i></i>Every sender ranked by emails, storage &amp; unread %</div>
      <div class="co"><i></i>Click any column to sort ▲▼ · filter by year or dates</div>
      <div class="co"><i></i>Labels show which inbox each email is in</div>
    </div>
    <div class="shot" style="margin-top:44px"><img src="${img("senders-light.png")}"></div>
    ${foot()}</section>`,

  // 4 — features
  `<section class="slide">${top(4)}
    <h2>Clean up in <span class="grad">one click</span></h2>
    <div class="grid">
      <div class="card"><div class="e">🧹</div><h3>Bulk trash &amp; archive</h3><p>Thousands of emails per sender at once. Undo for 30 days.</p></div>
      <div class="card"><div class="e">🚫</div><h3>One-click unsubscribe</h3><p>Stop newsletters at the source.</p></div>
      <div class="card"><div class="e">📅</div><h3>Filter by date</h3><p>A whole year, last 30 days, or any range.</p></div>
      <div class="card"><div class="e">📨</div><h3>All accounts together</h3><p>Gmail, Yahoo, iCloud, AOL, Zoho, IMAP.</p></div>
      <div class="card"><div class="e">🌗</div><h3>Light &amp; dark mode</h3><p>Follows your system or your choice.</p></div>
      <div class="card"><div class="e">🔄</div><h3>Update alerts</h3><p>Tells you when a new version is out.</p></div>
    </div>
    ${foot()}</section>`,

  // 5 — privacy
  `<section class="slide">${top(5)}
    <h2>Your email <span class="grad">never leaves</span> your computer</h2>
    <div class="list">
      <div class="li"><span class="k">🖥️</span>Runs 100% on your device</div>
      <div class="li"><span class="k">☁️</span>No MailClean server. No account. No tracking.</div>
      <div class="li"><span class="k">👀</span>Reads only sender, date &amp; size — never content</div>
      <div class="li"><span class="k">🔐</span>Passwords encrypted with AES-256</div>
      <div class="li"><span class="k">🧑‍💻</span>Open source (MIT) — anyone can check the code</div>
    </div>
    <div class="note">Most inbox cleaners read your mail on <i>their</i> servers.<br><b>MailClean doesn't — it can't.</b></div>
    ${foot()}</section>`,

  // 6 — CTA
  `<section class="slide">${top(6)}
    <h2>Try it <span class="grad">free</span> today</h2>
    <div class="chips" style="margin-top:28px"><span class="chip">Gmail</span><span class="chip">Yahoo</span><span class="chip">iCloud</span><span class="chip">AOL</span><span class="chip">Zoho</span><span class="chip">Any IMAP</span></div>
    <div class="chips" style="margin-top:16px"><span class="chip on">🍎 macOS</span><span class="chip on">⊞ Windows</span><span class="chip on">🐧 Linux</span><span class="chip on">🌐 Web demo</span></div>
    <div class="cta">
      <div class="btn p">▶ Live demo &amp; download <small>${SITE}</small></div>
      <div class="btn s">⭐ Star on GitHub <small>${REPO}</small></div>
    </div>
    <div class="shot" style="margin-top:44px; height:330px"><img src="${img("add-account-light.png")}"></div>
    ${foot(false)}</section>`,
];

const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ width: W, height: H, show: false, useContentSize: true, webPreferences: { offscreen: true } });
  const tmp = path.join(OUT, ".tmp.html");

  for (let i = 0; i < SLIDES.length; i++) {
    fs.writeFileSync(tmp, page(SLIDES[i]));
    await win.loadFile(tmp);
    await new Promise((r) => setTimeout(r, 500));
    const shot = await win.webContents.capturePage({ x: 0, y: 0, width: W, height: H });
    const file = path.join(OUT, `slide-${i + 1}.png`);
    fs.writeFileSync(file, shot.resize({ width: W, height: H }).toPNG());
    console.log("saved", path.relative(ROOT, file));
  }

  // All slides as one PDF: LinkedIn shows it as a swipeable document post.
  fs.writeFileSync(tmp, page(SLIDES.join("")));
  const pdfWin = new BrowserWindow({ width: W, height: H, show: false });
  await pdfWin.loadFile(tmp);
  await new Promise((r) => setTimeout(r, 500));
  const pdf = await pdfWin.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { marginType: "none" } });
  fs.writeFileSync(path.join(OUT, "MailClean-carousel.pdf"), pdf);
  console.log("saved", path.relative(ROOT, path.join(OUT, "MailClean-carousel.pdf")));
  fs.rmSync(tmp);
  app.exit(0);
});
