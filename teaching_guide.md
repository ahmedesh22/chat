# Lumina – Complete Teaching Guide

> A full session walkthrough for beginner students.  
> We built a desktop app where a **React UI** sends a request over **WebSocket** to a **C++ backend** that adds two numbers — and streams live status updates back in real time.

---

## Part 0 — The Big Picture

Before looking at any code, understand **why** this app is structured the way it is.

### What problem are we solving?

A normal web app lives entirely in JavaScript. But many real applications need to run **native system code** — code that is fast, close to the hardware, and written in C++.

This project teaches the pattern for bridging that gap:

```
┌─────────────────────────────────────────────────────────┐
│  What the USER sees                                     │
│                                                         │
│     React UI  (JavaScript)                              │
│     Runs inside Electron (like a web browser)           │
└───────────────────┬─────────────────────────────────────┘
                    │   IPC (Inter-Process Communication)
                    │   (a secure message channel)
┌───────────────────▼─────────────────────────────────────┐
│  Electron Main Process  (Node.js)                       │
│                                                         │
│  - Spawns the C++ server as a child process             │
│  - Opens a WebSocket connection to that server          │
│  - Forwards messages between React ↔ C++               │
└───────────────────┬─────────────────────────────────────┘
                    │   WebSocket  ws://localhost:8765/ws
┌───────────────────▼─────────────────────────────────────┐
│  C++ Server  (Native binary)                            │
│                                                         │
│  - Receives tool requests as JSON                       │
│  - Runs the requested tool (e.g., AddNumbers)           │
│  - Streams status updates + final result back           │
└─────────────────────────────────────────────────────────┘
```

### The 10 files students need to understand

```
chatapp-electron/
│
├── cpp-server/
│   ├── AgentTool.h        ← Concept: Abstract base class (C++ OOP)
│   ├── AddNumbersTool.h   ← Concept: Inheritance + virtual methods
│   ├── main.cpp           ← Concept: Registry, WebSocket server, JSON
│   └── build.sh           ← Concept: Compilation
│
├── electron/
│   ├── main.js            ← Concept: Child processes, WebSocket client, IPC
│   └── preload.js         ← Concept: Security boundary (contextBridge)
│
└── src/
    ├── App.jsx            ← Concept: React hooks (useState, useEffect)
    ├── main.jsx           ← Concept: React entry point (3 lines)
    ├── index.css          ← Concept: CSS layout
    └── index.html         ← Concept: HTML shell
```

---

## Part 1 — The C++ Backend

> **Goal:** Build a server that can receive JSON requests, run tools, and stream results back.

### 1.1 — `AgentTool.h` — The Abstract Base Class

**File:** [`cpp-server/AgentTool.h`](file:///Users/MAC/Documents/chatapp-electron/cpp-server/AgentTool.h)

This is the most important C++ concept in the project: **abstraction**.

An abstract base class defines **what** a tool must do, without saying **how**.  
Think of it like a job description: "Any employee must be able to `execute()` a task."

```cpp
class AgentTool {
public:
    virtual std::string name() const = 0;         // "What is your name?"
    virtual std::string description() const = 0;  // "What do you do?"

    virtual void execute(
        const nlohmann::json& args,
        std::function<void(std::string)> send_status,   // callback: stream progress
        std::function<void(nlohmann::json)> send_result  // callback: send final answer
    ) = 0;

    virtual ~AgentTool() = default;  // Always virtual in base classes!
};
```

**Key vocabulary:**
| Term | Meaning |
|---|---|
| `virtual` | This method CAN be overridden by a child class |
| `= 0` | This method MUST be overridden (pure virtual) |
| `std::function<...>` | A variable that holds a function — we pass callbacks in |

**Why two callbacks instead of one return value?**  
Because a tool may take seconds to run. Instead of blocking and waiting, the tool calls `send_status("Doing step 1...")` multiple times while working, then calls `send_result(data)` once when done. The UI can update in real time.

---

### 1.2 — `AddNumbersTool.h` — A Concrete Tool

**File:** [`cpp-server/AddNumbersTool.h`](file:///Users/MAC/Documents/chatapp-electron/cpp-server/AddNumbersTool.h)

This class **inherits** from `AgentTool` and implements the three pure virtual methods.

```cpp
class AddNumbersTool : public AgentTool {

    // ── Must override these three (the = 0 ones from AgentTool) ──────────
    std::string name() const override {
        return "AddNumbers";          // This is the key in the tool registry
    }

    std::string description() const override {
        return "Adds two numbers together and returns the sum";
    }

    void execute(
        const nlohmann::json& args,
        std::function<void(std::string)> send_status,
        std::function<void(nlohmann::json)> send_result
    ) override {

        // 1. Read inputs from the JSON args object
        double a = args.value("a", 0.0);
        double b = args.value("b", 0.0);

        // 2. Stream status updates (the UI shows these as they arrive)
        send_status("Reading first number: " + std::to_string((int)a));
        // ... sleep 400ms so students can see the animation ...
        send_status("Reading second number: " + std::to_string((int)b));
        send_status("Computing sum...");

        // 3. Send the final result (one JSON object)
        nlohmann::json output;
        output["tool"]   = name();   // "AddNumbers"
        output["a"]      = a;
        output["b"]      = b;
        output["result"] = a + b;
        send_result(output);
    }
};
```

**Key vocabulary:**
| Term | Meaning |
|---|---|
| `: public AgentTool` | This class inherits from AgentTool |
| `override` | Explicitly marks that we're implementing a virtual method |
| `args.value("a", 0.0)` | Read key "a" from JSON, default to 0.0 if missing |

---

### 1.3 — `main.cpp` — The Server Entry Point

**File:** [`cpp-server/main.cpp`](file:///Users/MAC/Documents/chatapp-electron/cpp-server/main.cpp)

This file does four things:

#### A) Build the tool registry

```cpp
using ToolRegistry = std::map<std::string, std::unique_ptr<AgentTool>>;

ToolRegistry build_registry() {
    ToolRegistry registry;

    // Register our tool. unique_ptr = smart pointer (auto memory management)
    registry["AddNumbers"] = std::make_unique<AddNumbersTool>();

    return registry;
}
```

> 💡 **Smart pointers** (`unique_ptr`) automatically free memory when the registry goes out of scope. You never call `delete` manually — the C++ runtime handles it.

> 💡 **`std::map`** is like a dictionary/object: `registry["AddNumbers"]` returns the AddNumbersTool.

#### B) Serve the tool list via HTTP

```cpp
svr.Get("/tools", [&](const httplib::Request&, httplib::Response& res) {
    json tools_list = json::array();
    for (const auto& [key, tool] : registry) {
        json t;
        t["name"]        = tool->name();
        t["description"] = tool->description();
        tools_list.push_back(t);
    }
    res.set_content(tools_list.dump(), "application/json");
});
```

Electron calls `GET /tools` once on startup to populate the sidebar.

#### C) Handle WebSocket connections

```cpp
svr.WebSocket("/ws", [&](const httplib::Request&, httplib::ws::WebSocket& ws) {
    std::string raw_msg;

    while (ws.read(raw_msg)) {                  // block until message arrives
        json req       = json::parse(raw_msg);  // parse JSON string → object
        std::string id   = req["id"];            // unique request ID
        std::string tool_name = req["tool"];     // which tool to run
        json args      = req["args"];            // arguments for the tool

        // Look up tool in registry
        AgentTool* tool = registry[tool_name].get();

        // Build callbacks that send WS frames back
        auto send_status = [&](std::string msg) {
            ws.send(make_frame(id, "status", msg));
        };
        auto send_result = [&](json result) {
            ws.send(make_frame(id, "result", result));
        };

        // Run the tool! (status frames arrive during execution)
        tool->execute(args, send_status, send_result);
    }
});
```

#### D) Start listening

```cpp
svr.listen("localhost", 8765);   // blocks here, waiting for connections
```

---

### 1.4 — `build.sh` — Compilation

**File:** [`cpp-server/build.sh`](file:///Users/MAC/Documents/chatapp-electron/cpp-server/build.sh)

```bash
# Download two header-only libraries if not already present
curl -sSL "https://...httplib.h" -o httplib.h
curl -sSL "https://...json.hpp"  -o nlohmann/json.hpp

# Compile everything into one binary
clang++ -std=c++17 -O2 -pthread -o lumina-server main.cpp
```

**Header-only libraries** means the entire library is in one `.h` file — no separate compilation step, no linking. You just `#include` it.

---

## Part 2 — The Electron Bridge

> **Goal:** Connect the React UI to the C++ server safely, without giving React direct access to Node.js or the filesystem.

### Why do we need Electron at all?

A plain web browser cannot:
- Spawn system processes
- Open local WebSocket connections to arbitrary ports
- Access the filesystem

Electron wraps Chromium (the browser engine) inside a Node.js environment, which CAN do all of these things. But it keeps them separate for security.

### The Three-Layer Security Model

```
┌────────────────────────────────────────────────────────────┐
│ RENDERER (React)                                           │
│ - Can access DOM                                           │
│ - Cannot access Node.js APIs                               │
│ - Can only call what preload.js explicitly exposed         │
└────────────────────────┬───────────────────────────────────┘
                         │  contextBridge (safe tunnel)
┌────────────────────────▼───────────────────────────────────┐
│ PRELOAD SCRIPT (electron/preload.js)                       │
│ - Runs before React loads                                  │
│ - Has access to ipcRenderer                                │
│ - Exposes ONLY specific named functions to window.api      │
└────────────────────────┬───────────────────────────────────┘
                         │  IPC (Inter-Process Communication)
┌────────────────────────▼───────────────────────────────────┐
│ MAIN PROCESS (electron/main.js)                            │
│ - Full Node.js access                                      │
│ - Spawns C++ server                                        │
│ - Owns WebSocket client connection                         │
└────────────────────────────────────────────────────────────┘
```

---

### 2.1 — `electron/main.js` — The Bridge

**File:** [`electron/main.js`](file:///Users/MAC/Documents/chatapp-electron/electron/main.js)

#### Step 1: Spawn the C++ server

```js
const { spawn } = require('child_process')

cppProcess = spawn('./cpp-server/lumina-server', [], { stdio: 'inherit' })
//                  ↑ path to compiled binary      ↑ show its console output
```

`child_process.spawn()` starts the C++ binary as a separate OS process, like double-clicking an executable.

#### Step 2: Open a WebSocket client connection

```js
const WebSocket = require('ws')   // npm package for WebSocket

wsClient = new WebSocket('ws://localhost:8765/ws')

wsClient.on('open', () => console.log('Connected to C++!'))

// Every message from C++ gets forwarded to React
wsClient.on('message', (data) => {
    mainWindow.webContents.send('tool:message', data.toString())
    //         ↑                 ↑ IPC channel name
    //         the browser window
})
```

#### Step 3: Handle IPC calls from React

```js
const { ipcMain } = require('electron')

// React calls window.api.sendToolRequest(payload)
// → that calls ipcRenderer.invoke('tool:send', payload)
// → which arrives here:
ipcMain.handle('tool:send', (_event, payload) => {
    wsClient.send(JSON.stringify(payload))   // forward to C++
    return { ok: true }
})

// React calls window.api.getTools()
// → arrives here as an HTTP request to C++ server:
ipcMain.handle('tools:list', () => {
    // make HTTP GET request to localhost:8765/tools
    // return the JSON array
})
```

#### Step 4: Create the window

```js
const { BrowserWindow } = require('electron')

mainWindow = new BrowserWindow({
    webPreferences: {
        preload: path.join(__dirname, 'preload.js'),   // load our bridge script
        contextIsolation: true,    // React cannot access Node.js APIs
        nodeIntegration: false,    // extra security: no require() in React
    }
})
mainWindow.loadURL('http://localhost:5173')   // load Vite dev server
```

---

### 2.2 — `electron/preload.js` — The Security Gate

**File:** [`electron/preload.js`](file:///Users/MAC/Documents/chatapp-electron/electron/preload.js)

```js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {

    // React calls this to send a tool request to C++
    sendToolRequest: (payload) => ipcRenderer.invoke('tool:send', payload),

    // React calls this to listen for C++ messages
    // Returns a cleanup function (call it in useEffect cleanup)
    onMessage: (callback) => {
        const listener = (_event, msg) => callback(msg)
        ipcRenderer.on('tool:message', listener)
        return () => ipcRenderer.removeListener('tool:message', listener)
    },

    // React calls this to get the tool list
    getTools: () => ipcRenderer.invoke('tools:list'),
})
```

After this script runs, React code can do `window.api.sendToolRequest(...)` — but it cannot do anything else with Electron. The rest is blocked.

---

## Part 3 — The React Frontend

> **Goal:** A simple, readable UI that shows what's happening in real time.

### 3.1 — `src/main.jsx` — Entry Point (3 lines)

**File:** [`src/main.jsx`](file:///Users/MAC/Documents/chatapp-electron/src/main.jsx)

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
```

This mounts the `<App>` component into the `<div id="root">` in `index.html`.

---

### 3.2 — `src/App.jsx` — The Entire UI

**File:** [`src/App.jsx`](file:///Users/MAC/Documents/chatapp-electron/src/App.jsx)

This is the heart of the frontend. Let's go through it concept by concept.

#### A) `useState` — Reactive Variables

```jsx
const [messages, setMessages] = useState([])   // chat history (starts empty)
const [input,    setInput]    = useState('')   // current text in the box
const [status,   setStatus]   = useState('')   // live status from C++
const [loading,  setLoading]  = useState(false)// is a tool running right now?
const [tools,    setTools]    = useState([])   // tool list from C++ server
```

> 💡 **Rule:** Never modify state directly. Always call the setter.  
> ❌ `messages.push(newMsg)` — React won't re-render  
> ✅ `setMessages(prev => [...prev, newMsg])` — React sees the change and re-renders

#### B) `useEffect` — Side Effects on Mount

```jsx
useEffect(() => {

    // 1. Get tool list (runs once when app loads)
    window.api.getTools()
        .then(toolList => setTools(toolList))

    // 2. Register the incoming message handler
    const removeListener = window.api.onMessage((rawMessage) => {
        const frame = JSON.parse(rawMessage)

        if (frame.type === 'status') {
            setStatus(frame.data)          // show "Reading first number: 5"
        }

        if (frame.type === 'result') {
            const { a, b, result } = frame.data
            setMessages(prev => [...prev, {
                role: 'assistant',
                text: `${a} + ${b} = ${result}`,
            }])
            setStatus('')       // clear status line
            setLoading(false)   // allow next request
        }
    })

    return () => removeListener()   // cleanup when component unmounts

}, [])   // ← empty array means "run only once, on first render"
```

> 💡 **What is a "side effect"?**  
> In React, side effects are things that reach **outside** the component:  
> network requests, subscriptions, timers, DOM manipulation.  
> `useEffect` is the correct place to put them.

#### C) `handleSend` — Sending a Request

```jsx
function handleSend() {
    if (loading) return    // don't send while waiting
    if (!input.trim()) return

    // Extract numbers from the prompt using regex
    // "add 5 and 3"  →  ["5", "3"]
    const numbers = input.match(/-?\d+(\.\d+)?/g)
    if (!numbers || numbers.length < 2) {
        alert('Please include two numbers')
        return
    }

    const a = parseFloat(numbers[0])
    const b = parseFloat(numbers[1])

    // Show user's message immediately
    setMessages(prev => [...prev, { role: 'user', text: input }])
    setInput('')
    setLoading(true)

    // Build and send the tool request
    window.api.sendToolRequest({
        id:   Date.now().toString(),   // unique ID to match response frames
        tool: 'AddNumbers',            // must match key in C++ registry
        args: { a, b },               // becomes the args JSON in AddNumbersTool
    })
}
```

#### D) The JSX (What Gets Rendered)

```jsx
return (
    <div className="app">

        {/* Left panel: tool list */}
        <aside className="sidebar">
            <h1 className="app-title">Lumina</h1>
            {tools.map(tool => (
                <div key={tool.name} className="tool-card">
                    <strong>{tool.name}</strong>
                    <p>{tool.description}</p>
                </div>
            ))}
        </aside>

        {/* Right panel: chat */}
        <main className="chat">
            <div className="messages">
                {messages.map((msg, index) => (
                    <div key={index} className={`bubble ${msg.role}`}>
                        <span className="bubble-label">
                            {msg.role === 'user' ? 'You' : 'C++ Result'}
                        </span>
                        <span>{msg.text}</span>
                    </div>
                ))}

                {/* Live status line from C++ */}
                {status && <div className="status-line">⏳ {status}</div>}
            </div>

            <div className="input-area">
                <input value={input} onChange={e => setInput(e.target.value)} />
                <button onClick={handleSend} disabled={loading}>Send</button>
            </div>
        </main>
    </div>
)
```

---

## Part 4 — The Full Data Flow

Let's trace exactly what happens when you type **"add 5 and 3"** and press Send.

```
Step 1:  User presses Send
         handleSend() runs
         input.match(/-?\d+/) → ["5", "3"]
         a=5, b=3

Step 2:  React calls window.api.sendToolRequest(...)
         This was defined in preload.js
         It calls: ipcRenderer.invoke('tool:send', { id, tool, args })

Step 3:  IPC message arrives in electron/main.js
         ipcMain.handle('tool:send') receives it
         wsClient.send(JSON.stringify({ id, tool:'AddNumbers', args:{a:5,b:3} }))

Step 4:  C++ server receives the WebSocket message
         ws.read(raw_msg) returns
         json::parse(raw_msg) → extracts id, tool, args

Step 5:  C++ looks up tool: registry["AddNumbers"].get()
         Calls tool->execute(args, send_status, send_result)

Step 6:  AddNumbersTool::execute() runs:
         send_status("Reading first number: 5")
           → ws.send('{"id":"...","type":"status","data":"Reading first number: 5"}')
         [sleep 400ms]
         send_status("Reading second number: 3")
           → ws.send('{"id":"...","type":"status","data":"Reading second number: 3"}')
         [sleep 400ms]
         send_status("Computing sum...")
         send_result({"tool":"AddNumbers","a":5,"b":3,"result":8})
           → ws.send('{"id":"...","type":"result","data":{...}}')

Step 7:  Each ws.send() triggers electron/main.js wsClient.on('message')
         mainWindow.webContents.send('tool:message', data)

Step 8:  preload.js listener fires:
         ipcRenderer.on('tool:message', listener)
         calls our callback with the raw JSON string

Step 9:  App.jsx onMessage handler runs:
         frame.type === 'status' → setStatus("Reading first number: 5") → re-render
         frame.type === 'status' → setStatus("Computing sum...") → re-render
         frame.type === 'result' → setMessages([...prev, {text:"5 + 3 = 8"}])
                                   setStatus('')
                                   setLoading(false)

Step 10: React re-renders the UI
         Chat bubble appears: "C++ Result: 5 + 3 = 8"
```

---

## Part 5 — Key Concepts Summary

### C++ Concepts

| Concept | Where | One-line explanation |
|---|---|---|
| Abstract class | `AgentTool.h` | Defines interface, forces subclasses to implement methods |
| Pure virtual (`= 0`) | `AgentTool.h` | Method has no body — subclass MUST provide one |
| Inheritance | `AddNumbersTool.h` | Child class gets all parent's methods and adds its own |
| `override` keyword | `AddNumbersTool.h` | Compiler checks that you're actually overriding a virtual method |
| `unique_ptr` | `main.cpp` | Smart pointer — automatically frees memory, no manual `delete` |
| `std::map` | `main.cpp` | Key-value store (like JS objects/Python dicts) |
| `std::function` | `AgentTool.h` | A variable that holds a callable function |
| Lambda `[&]` | `main.cpp` | Anonymous function that captures outer variables by reference |
| WebSocket server | `main.cpp` | Persistent two-way connection (not request-response like HTTP) |
| JSON parsing | everywhere | `nlohmann::json` lets you use JSON like a native type |

### JavaScript / Electron Concepts

| Concept | Where | One-line explanation |
|---|---|---|
| `child_process.spawn()` | `main.js` | Start another program as a subprocess |
| WebSocket client | `main.js` | Connects to C++ server's WS endpoint |
| `ipcMain.handle` | `main.js` | Receive messages FROM the renderer |
| `webContents.send` | `main.js` | Send messages TO the renderer |
| `contextBridge` | `preload.js` | Safely expose specific APIs to React |
| `contextIsolation` | `main.js` | Security: keeps Node.js and browser worlds separate |

### React Concepts

| Concept | Where | One-line explanation |
|---|---|---|
| `useState` | `App.jsx` | A value that, when changed, triggers a re-render |
| `useEffect` | `App.jsx` | Run code after render (subscriptions, data loading) |
| Cleanup function | `App.jsx` | Returned from `useEffect` — React calls it on unmount |
| `useRef` | `App.jsx` | A value that does NOT trigger re-render (used for DOM refs) |
| JSX | `App.jsx` | HTML-like syntax that compiles to `React.createElement()` calls |
| Conditional render | `App.jsx` | `{status && <div>{status}</div>}` — only renders if status is truthy |
| List render | `App.jsx` | `{messages.map((m, i) => <div key={i}>...)}` — always need `key` |

---

## Part 6 — How to Run It

```bash
# In the project root:
npm run dev
```

This command does three things simultaneously:
1. Starts **Vite** dev server on `localhost:5173` (serves React)
2. Waits until Vite is ready, then starts **Electron**
3. Electron's `main.js` spawns the **C++ server** at startup

To stop: press `Ctrl+C` in the terminal. Electron's `before-quit` event kills the C++ server automatically.

---

## Part 7 — How to Add a New Tool

Adding a new tool requires changes in exactly **3 places**:

### Step 1: Create the tool header file

```cpp
// cpp-server/MultiplyTool.h
#pragma once
#include "AgentTool.h"

class MultiplyTool : public AgentTool {
public:
    std::string name() const override { return "Multiply"; }
    std::string description() const override { return "Multiplies two numbers"; }

    void execute(const nlohmann::json& args,
                 std::function<void(std::string)> send_status,
                 std::function<void(nlohmann::json)> send_result) override {
        double a = args.value("a", 0.0);
        double b = args.value("b", 0.0);
        send_status("Multiplying...");
        nlohmann::json out;
        out["tool"] = name(); out["a"] = a; out["b"] = b; out["result"] = a * b;
        send_result(out);
    }
};
```

### Step 2: Register it in `main.cpp`

```cpp
#include "MultiplyTool.h"   // add this include

ToolRegistry build_registry() {
    ToolRegistry registry;
    registry["AddNumbers"] = std::make_unique<AddNumbersTool>();
    registry["Multiply"]   = std::make_unique<MultiplyTool>();  // add this line
    return registry;
}
```

### Step 3: Recompile

```bash
cpp-server/build.sh
```

That's it. The sidebar automatically shows the new tool (it fetches the tool list from C++ on every startup). The orchestrator in `App.jsx` needs to be updated to recognise the new tool's keywords.

---

## Part 8 — Frequently Asked Questions

**Q: Why not just do the addition in JavaScript?**  
A: We could — but this pattern scales. The same bridge works for anything C++ can do: image processing, machine learning inference, hardware access, database operations. Addition is just the simplest possible demonstration.

**Q: Why WebSocket instead of plain HTTP?**  
A: HTTP is request-response: you send one request, you get one response. WebSocket is a persistent channel: the server can push multiple messages back (our status frames) before sending the final result. This is essential for streaming progress updates.

**Q: What is `contextIsolation: true` protecting against?**  
A: If `contextIsolation` were off, a malicious script in a webpage you load inside Electron could access `require('fs')` and read your entire filesystem. With isolation on, the renderer can only call what `preload.js` explicitly exposed.

**Q: What does `unique_ptr` vs raw pointer mean?**  
A: With a raw pointer you do `AgentTool* t = new AddNumbersTool();` and later must call `delete t;`. If you forget, you leak memory. `unique_ptr` calls `delete` automatically when it goes out of scope — it's impossible to forget.

**Q: Why does `useEffect` return a function?**  
A: React calls that returned function when the component unmounts (is removed from the screen). It's the cleanup step — in our case, removing the WebSocket listener so it doesn't fire on a dead component.
