// ─────────────────────────────────────────────────────────────────────────────
// Preload Script – electron/preload.js
//
// This script runs in a privileged context that has access to both:
//   - The Electron ipcRenderer API
//   - The DOM of the renderer (React app)
//
// contextBridge.exposeInMainWorld() safely tunnels specific functions
// from this privileged scope into the renderer's window object.
//
// The renderer accesses these as:
//   window.api.sendToolRequest(payload)
//   window.api.onMessage(callback)
//   window.api.getTools()
//
// SECURITY NOTE: We never expose the raw ipcRenderer object —
// only specific, named wrapper functions. This prevents malicious
// renderer code from sending arbitrary IPC messages.
// ─────────────────────────────────────────────────────────────────────────────

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {

  // Send a tool request to the C++ server via the Electron main WS client.
  // payload = { id, tool, args }
  // Results come back asynchronously through onMessage().
  sendToolRequest: (payload) => ipcRenderer.invoke('tool:send', payload),

  // Register a callback for incoming WebSocket messages from C++.
  // The callback receives a raw JSON string — parse it in the handler.
  // Returns an unsubscribe function (call it in useEffect cleanup).
  onMessage: (callback) => {
    const listener = (_event, msg) => callback(msg)
    ipcRenderer.on('tool:message', listener)
    // Return cleanup function so React can remove the listener on unmount
    return () => ipcRenderer.removeListener('tool:message', listener)
  },

  // Fetch the list of tools the C++ server has registered.
  // Returns a Promise that resolves to an array of { name, description } objects.
  getTools: () => ipcRenderer.invoke('tools:list'),

})
