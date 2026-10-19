// MailClean desktop shell: runs the bundled Next.js server in a utility process and shows it in a window.
const { app, BrowserWindow, dialog, session, shell, utilityProcess } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

// Fixed port so the Google OAuth redirect URI stays the same: http://localhost:47321/api/connect/google/callback
const PORT = Number(process.env.MAILCLEAN_PORT) || 47321;
const APP_URL = `http://localhost:${PORT}`;
// `npm run desktop:dev` points this at the Next dev server instead of the bundled one.
const DEV_URL = process.env.MAILCLEAN_DEV_URL;
// Per-launch secret: the server only answers API requests that carry it (see src/middleware.ts).
const TOKEN = crypto.randomBytes(32).toString("hex");

let server = null;
let win = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(start);
}

/** Keys from the build (resources/config.json), overridable per user in <userData>/config.json. */
function readConfig() {
  const files = [path.join(process.resourcesPath, "config.json"), path.join(app.getPath("userData"), "config.json")];
  const config = {};
  for (const f of files) {
    try {
      Object.assign(config, JSON.parse(fs.readFileSync(f, "utf8")));
    } catch {
      /* missing or invalid file: skip */
    }
  }
  return config;
}

function startServer() {
  const serverDir = path.join(process.resourcesPath, "server");
  const logDir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const log = fs.createWriteStream(path.join(logDir, "server.log"), { flags: "a" });

  server = utilityProcess.fork(path.join(serverDir, "server.js"), [], {
    cwd: serverDir,
    stdio: "pipe",
    serviceName: "MailClean server",
    env: {
      ...process.env,
      ...readConfig(),
      NODE_ENV: "production",
      PORT: String(PORT),
      // Loopback only: the app has no login, so it must never be reachable from the network.
      HOSTNAME: "127.0.0.1",
      APP_URL,
      MAILCLEAN_TOKEN: TOKEN,
      DATA_DIR: path.join(app.getPath("userData"), "data"),
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
  server.stdout?.pipe(log);
  server.stderr?.pipe(log);
  server.on("exit", (code) => {
    server = null;
    if (!app.isQuitting) {
      dialog.showErrorBox("MailClean stopped", `The MailClean server exited (code ${code}). See ${path.join(logDir, "server.log")}.`);
      app.quit();
    }
  });
}

function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(`${url}/api/lock`, { headers: { "x-mailclean-token": TOKEN } }, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else retry();
      });
      req.on("error", retry);
      req.setTimeout(2000, () => req.destroy());
    };
    const retry = () => (Date.now() > deadline ? reject(new Error("Server did not start in time")) : setTimeout(attempt, 250));
    attempt();
  });
}

const isExternalSafe = (url) => /^(https?|mailto):/i.test(url);

function openExternal(url) {
  if (isExternalSafe(url)) shell.openExternal(url);
}

function createWindow(baseUrl) {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 380,
    minHeight: 500,
    title: "MailClean",
    backgroundColor: "#0e1013",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });

  const origin = new URL(baseUrl).origin;

  // Links that open a new window (unsubscribe pages, Yahoo help) go to the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    const u = new URL(url);
    if (u.origin === origin && u.pathname.startsWith("/api/connect/") && !u.pathname.endsWith("/imap")) {
      // Google blocks sign-in inside embedded windows, so OAuth runs in the system browser.
      event.preventDefault();
      u.searchParams.set("from", "desktop");
      openExternal(u.toString());
    } else if (u.origin !== origin) {
      event.preventDefault();
      openExternal(url);
    }
  });

  win.on("closed", () => (win = null));
  win.loadURL(baseUrl);
}

async function start() {
  const baseUrl = DEV_URL || APP_URL;
  if (!DEV_URL) {
    // Attach the token to every request this app makes to its own server.
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: [`http://localhost:${PORT}/*`, `http://127.0.0.1:${PORT}/*`] },
      (details, callback) => callback({ requestHeaders: { ...details.requestHeaders, "x-mailclean-token": TOKEN } }),
    );
    startServer();
    try {
      await waitForServer(APP_URL);
    } catch (e) {
      dialog.showErrorBox(
        "MailClean could not start",
        `${e.message}. Is another copy of MailClean or another program using port ${PORT}?`,
      );
      app.quit();
      return;
    }
  }
  createWindow(baseUrl);
  app.on("activate", () => {
    if (!win) createWindow(baseUrl);
  });
}

app.on("before-quit", () => {
  app.isQuitting = true;
  server?.kill();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
