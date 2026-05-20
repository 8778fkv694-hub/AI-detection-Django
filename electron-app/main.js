// main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

let embeddedServer = null;

function configureUserDataPath() {
  const userDataPath = app.getPath('userData');
  process.env.ELECTRON_USER_DATA_PATH = userDataPath;
  console.log('[Electron] User data path initialized:', userDataPath);
}

// Start embedded Express server asynchronously to prevent blocking window launch
function startExpressServer() {
  setTimeout(() => {
    try {
      if (embeddedServer) return;
      const serverPath = path.join(__dirname, 'src/server/main.js');
      if (fs.existsSync(serverPath)) {
        console.log('[Electron] Starting embedded Express server from:', serverPath);
        embeddedServer = require(serverPath);
      } else {
        console.warn('[Electron] Express server entry point not found at:', serverPath);
      }
    } catch (e) {
      console.error('[Electron] Failed to start embedded Express server:', e);
    }
  }, 100); // 100ms delay to let the UI window initialize first
}

let mainWindow;
const rendererConsoleCounts = {
  log: 0,
  warn: 0,
  error: 0,
  debug: 0,
};

const auditRoutes = [
  '/',
  '/models',
  '/standards',
  '/anomalies',
  '/streams',
  '/live-inspection',
  '/batch',
  '/safety-equipment',
  '/cleanroom-results',
  '/kit-matching',
  '/kit-matching-results',
  '/ocr',
  '/wechat-qr-guided',
  '/ocr-guided',
  '/live-inspection-results',
  '/batch-results',
  '/ocr-results',
  '/results-debug',
  '/help',
];

function startRouteAudit(window) {
  if (!process.argv.includes('--audit-routes')) return;

  window.webContents.on('did-finish-load', () => {
    setTimeout(async () => {
      Object.keys(rendererConsoleCounts).forEach((key) => {
        rendererConsoleCounts[key] = 0;
      });
      console.log('[ElectronAudit] Starting route audit...');
      for (const route of auditRoutes) {
        console.log(`[ElectronAudit] Visiting ${route}`);
        try {
          await window.webContents.executeJavaScript(`window.location.hash = ${JSON.stringify(route)};`, true);
          await new Promise((resolve) => setTimeout(resolve, 1800));
          const state = await window.webContents.executeJavaScript(`
            ({
              route: window.location.hash,
              title: document.querySelector('h1,h2,h3')?.textContent || '',
              bodyText: document.body.innerText.slice(0, 160),
              loading: Boolean(document.getElementById('app-loading'))
            })
          `, true);
          console.log('[ElectronAudit] State:', JSON.stringify(state));
        } catch (e) {
          console.error(`[ElectronAudit] Route failed ${route}:`, e);
        }
      }
      console.log('[ElectronAudit] Completed route audit.');
      console.log('[ElectronAudit] Renderer console summary:', JSON.stringify(rendererConsoleCounts));
      app.quit();
    }, 2500);
  });
}

function createWindow() {
  configureUserDataPath();

  // Start Express server in the background without blocking window launch
  startExpressServer();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1024,
    minHeight: 768,
    title: "WYL智能检测系统",
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  // Register window-level shortcuts for industrial deployment & debugging
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // F11: Toggle Fullscreen
    if (input.key === 'F11' && input.type === 'keyDown') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    }
    // F12: Toggle Developer Tools
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
    // F5 or Ctrl+R / Cmd+R: Reload
    if ((input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r') || (input.meta && input.key.toLowerCase() === 'r')) && input.type === 'keyDown') {
      mainWindow.reload();
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levels = {
      0: 'debug',
      1: 'log',
      2: 'warn',
      3: 'error',
    };
    const label = typeof level === 'string' ? level : (levels[level] || 'log');
    if (Object.prototype.hasOwnProperty.call(rendererConsoleCounts, label)) {
      rendererConsoleCounts[label] += 1;
    }
    console.log(`[Renderer:${label}] ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const loadingVisible = await mainWindow.webContents.executeJavaScript(
          "Boolean(document.getElementById('app-loading'))",
          true
        );
        console.log('[Electron] Loading overlay present after startup:', loadingVisible);
      } catch (e) {
        console.warn('[Electron] Failed to inspect loading overlay:', e);
      }
    }, 3000);
  });
  startRouteAudit(mainWindow);

  // Load index.html
  const htmlPath = path.join(__dirname, 'www/index.html');
  if (fs.existsSync(htmlPath)) {
    mainWindow.loadFile(htmlPath);
    if (process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools();
    }
  } else {
    // Helpful screen if assets are not yet compiled
    mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
      <html>
        <head>
          <title>WYL智能检测系统</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #0b0f19; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            h2 { color: #8b5cf6; }
            code { background: #1e293b; padding: 4px 8px; border-radius: 4px; color: #f43f5e; }
          </style>
        </head>
        <body>
          <h2>WYL AI 检测系统 — 桌面容器已就绪</h2>
          <p>前端静态文件尚未编译/同步。请在项目根目录或 <code>electron-app</code> 中运行以下命令：</p>
          <code>npm run build:full</code>
        </body>
      </html>
    `));
  }

  // Hide standard file/edit menu bar for clean industrial UI appearance
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (embeddedServer && typeof embeddedServer.close === 'function') {
    embeddedServer.close();
    embeddedServer = null;
  }
});
