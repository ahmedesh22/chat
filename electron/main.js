// ─────────────────────────────────────────────────────────────────────────────
// Electron Main Process – electron/main.js
//
// Responsibilities:
//   1. Spawn the compiled C++ server (./cpp-server/lumina-server) as a child process
//   2. Open a WebSocket CLIENT connection to that server (using 'ws' npm package)
//   3. Create the BrowserWindow with a secure preload script
//   4. Bridge WebSocket messages ↔ IPC:
//        Renderer → ipcMain.handle('tool:send') → ws.send(payload)
//        ws.on('message') → mainWindow.webContents.send('tool:message', msg)
//   5. On app quit: close WS + kill C++ server child process
// ─────────────────────────────────────────────────────────────────────────────

const { app, BrowserWindow, ipcMain } = require('electron')
const path   = require('path')
const { spawn } = require('child_process')
const WebSocket  = require('ws')
const http   = require('http')

// ── Config ────────────────────────────────────────────────────────────────────
const CPP_SERVER_PORT = 8765
const CPP_SERVER_HOST = 'localhost'
const CPP_SERVER_BIN  = path.join(__dirname, '..', 'cpp-server', 'lumina-server')
const VITE_DEV_URL    = 'http://localhost:5173'

let mainWindow   = null
let cppProcess   = null  // child_process reference to the C++ server
let wsClient     = null  // WebSocket client connected to C++ server

// ── 1. Spawn the C++ server ───────────────────────────────────────────────────
function startCppServer() {
  console.log('[Main] Spawning C++ server:', CPP_SERVER_BIN)

  cppProcess = spawn(CPP_SERVER_BIN, [], {
    // Inherit stdio so C++ console.log shows up in the Electron console
    stdio: 'inherit',
  })

  cppProcess.on('error', (err) => {
    console.error('[Main] Failed to start C++ server:', err.message)
    console.error('       Did you run: cd cpp-server && ./build.sh ?')
  })

  cppProcess.on('exit', (code) => {
    console.log('[Main] C++ server exited with code', code)
  })
}

// ── 2. Connect WebSocket client to C++ server ─────────────────────────────────
// We retry a few times because the C++ server needs a moment to start.
function connectWebSocket(retries = 10) {
  const url = `ws://${CPP_SERVER_HOST}:${CPP_SERVER_PORT}/ws`
  console.log('[Main] Connecting WS to', url)

  wsClient = new WebSocket(url)

  wsClient.on('open', () => {
    console.log('[Main] WebSocket connected to C++ server')
  })

  // Every message from C++ gets forwarded to the renderer via IPC
  wsClient.on('message', (rawData) => {
    const msg = rawData.toString()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tool:message', msg)
    }
  })

  wsClient.on('error', (err) => {
    console.warn('[Main] WS error (will retry):', err.message)
  })

  wsClient.on('close', () => {
    console.log('[Main] WS connection closed')
    // Auto-reconnect if app is still running (C++ server may have restarted)
    if (retries > 0 && !app.isQuitting) {
      setTimeout(() => connectWebSocket(retries - 1), 1000)
    }
  })
}

// ── 3. Create the Browser Window ──────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',   // macOS: merge title bar into content
    backgroundColor: '#0d0f14',    // Matches app dark background (no white flash)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,      // Security: renderer can't access Node.js directly
      nodeIntegration: false,      // Security: no require() in renderer
      sandbox: false,              // Needed to allow preload to use ipcRenderer
    },
  })

  // Load Vite dev server in development, built files in production
  const isDev = !app.isPackaged
  if (isDev) {
    mainWindow.loadURL(VITE_DEV_URL)
    // mainWindow.webContents.openDevTools()  // Uncomment to open DevTools
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

// ── 4. IPC Handlers ───────────────────────────────────────────────────────────

// Renderer calls window.api.sendToolRequest(payload)
// → this handler serializes it and sends over the WebSocket to C++
ipcMain.handle('tool:send', (_event, payload) => {
  if (!wsClient || wsClient.readyState !== WebSocket.OPEN) {
    return { error: 'WebSocket not connected to C++ server' }
  }
  wsClient.send(JSON.stringify(payload))
  return { ok: true }
})

// Renderer calls window.api.getTools()
// → this handler makes a plain HTTP GET to C++ /tools endpoint
ipcMain.handle('tools:list', () => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CPP_SERVER_HOST,
      port:     CPP_SERVER_PORT,
      path:     '/tools',
      method:   'GET',
    }
    const req = http.request(options, (res) => {
      let body = ''
      res.on('data', chunk => (body += chunk))
      res.on('end', () => {
        try { resolve(JSON.parse(body)) }
        catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.end()
  })
})

// ── 5. App Lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  startCppServer()

  // Give C++ server 600ms to start before connecting
  setTimeout(() => {
    connectWebSocket()
    createWindow()
  }, 600)
})

app.on('before-quit', () => {
  app.isQuitting = true  // Signal WS reconnect loop to stop

  if (wsClient) wsClient.close()

  if (cppProcess) {
    console.log('[Main] Killing C++ server process...')
    cppProcess.kill()
  }
})

app.on('window-all-closed', () => {
  // On macOS, apps stay active until Cmd+Q; on other OS quit immediately
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
