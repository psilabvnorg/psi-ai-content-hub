# Electron with Server Example - Backend Design

## Overview

This project demonstrates a pattern for running a background server process in an Electron app using **node-ipc** for inter-process communication. The key benefit is that the client (renderer) communicates directly with the server via IPC sockets, bypassing HTTP entirely.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        ELECTRON APP                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐         ┌──────────────────────────────────┐  │
│  │  Main Process │         │      Server Process              │  │
│  │  (index.js)   │         │      (server.js)                 │  │
│  │               │  fork() │                                  │  │
│  │  - Creates    │────────>│  - Runs as child process         │  │
│  │    windows    │         │  - Initializes IPC server        │  │
│  │  - Finds open │         │  - Handles business logic        │  │
│  │    socket     │         │                                  │  │
│  │  - Sends      │         │  ┌─────────────────────────────┐ │  │
│  │    socket name│         │  │  server-ipc.js              │ │  │
│  │    to renderer│         │  │  - node-ipc server          │ │  │
│  └───────┬───────┘         │  │  - Listens on socket        │ │  │
│          │                 │  │  - Routes to handlers       │ │  │
│          │ set-socket      │  └─────────────────────────────┘ │  │
│          │ (ipcRenderer)   │                                  │  │
│          ▼                 │  ┌─────────────────────────────┐ │  │
│  ┌──────────────────────┐  │  │  server-handlers.js         │ │  │
│  │  Renderer Process    │  │  │  - Business logic           │ │  │
│  │  (client-index.html) │  │  │  - Async functions          │ │  │
│  │                      │  │  └─────────────────────────────┘ │  │
│  │  ┌────────────────┐  │  └──────────────────────────────────┘  │
│  │  │ client-preload │  │                 ▲                      │
│  │  │ - Exposes IPC  │  │                 │                      │
│  │  │ - uuid         │  │                 │ node-ipc             │
│  │  │ - ipcConnect   │  │                 │ socket               │
│  │  └────────────────┘  │                 │                      │
│  │         │            │                 │                      │
│  │         ▼            │                 │                      │
│  │  ┌────────────────┐  │                 │                      │
│  │  │ client-ipc.js  │──┼─────────────────┘                      │
│  │  │ - Connects to  │  │                                        │
│  │  │   socket       │  │                                        │
│  │  │ - send()       │  │                                        │
│  │  │ - listen()     │  │                                        │
│  │  └────────────────┘  │                                        │
│  └──────────────────────┘                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## File Descriptions

### 1. `index.js` - Main Process (Entry Point)

**Purpose:** Electron main process that orchestrates the app startup.

**Key Responsibilities:**
- Find an available IPC socket name using `findOpenSocket()`
- Create the main BrowserWindow
- Start the server process (forked in production, window in dev)
- Send the socket name to the renderer via `ipcRenderer.send('set-socket')`

**Dev vs Production:**
- **Dev:** Creates a visible window (`createBackgroundWindow`) for debugging
- **Production:** Forks a headless child process (`createBackgroundProcess`)

```javascript
// Production: Fork server as child process
serverProcess = fork(__dirname + '/server.js', [
  '--subprocess',
  app.getVersion(),
  socketName
])
```

### 2. `find-open-socket.js` - Socket Discovery

**Purpose:** Finds an available socket name to avoid conflicts with multiple app instances.

**How it works:**
1. Tries to connect to `myapp1`, `myapp2`, etc.
2. If connection succeeds → socket is taken
3. If connection fails → socket is available
4. Returns first available socket name

```javascript
async function findOpenSocket() {
  let currentSocket = 1;
  while (await isSocketTaken('myapp' + currentSocket)) {
    currentSocket++;
  }
  return 'myapp' + currentSocket;
}
```

### 3. `server.js` - Server Entry Point

**Purpose:** Initializes the IPC server with handlers.

**Dual-mode operation:**
- **Subprocess mode:** `process.argv[2] === '--subprocess'`
- **Dev mode:** Runs in Electron renderer with `nodeIntegration: true`

```javascript
if (process.argv[2] === '--subprocess') {
  // Production: Get socket name from args
  let socketName = process.argv[4]
  ipc.init(socketName, serverHandlers)
} else {
  // Dev: Wait for socket name via ipcRenderer
  ipcRenderer.on('set-socket', (event, { name }) => {
    ipc.init(name, serverHandlers)
  })
}
```

### 4. `server-ipc.js` - IPC Server Implementation

**Purpose:** Creates and manages the node-ipc server.

**Key Functions:**

#### `init(socketName, handlers)`
- Creates IPC server with given socket name
- Listens for 'message' events
- Routes messages to appropriate handlers
- Sends replies back to client

#### `send(name, args)`
- Broadcasts push messages to all connected clients
- Used for server-initiated updates

**Message Protocol:**
```javascript
// Request from client
{ id: "uuid", name: "handler-name", args: { ... } }

// Reply to client
{ type: "reply", id: "uuid", result: { ... } }

// Error to client
{ type: "error", id: "uuid" }

// Push from server
{ type: "push", name: "event-name", args: { ... } }
```

### 5. `server-handlers.js` - Business Logic

**Purpose:** Contains all the handler functions that process client requests.

**Structure:**
```javascript
let handlers = {}

handlers['method-name'] = async (args) => {
  // Process request
  return result
}

module.exports = handlers
```

**Example handlers:**
- `make-factorial` - Computes factorial of a number
- `ring-ring` - Simple echo handler

### 6. `client-preload.js` - Preload Script

**Purpose:** Bridge between main process and renderer, exposes safe APIs to window.

**Exposed APIs:**
- `window.getServerSocket()` - Returns promise that resolves to socket name
- `window.ipcConnect(id, func)` - Connects to IPC socket
- `window.uuid` - UUID generation for message IDs
- `window.IS_DEV` - Development mode flag

**Socket name flow:**
```javascript
// Promise that resolves when main process sends socket name
let socketPromise = new Promise(resolve => {
  resolveSocketPromise = resolve
})

// Listen for socket name from main process
ipcRenderer.on('set-socket', (event, { name }) => {
  resolveSocketPromise(name)
})
```

### 7. `client-ipc.js` - Client IPC Library

**Purpose:** Client-side IPC communication library.

**Key Functions:**

#### `send(name, args)` → Promise
Sends a request to the server and returns a promise.
```javascript
function send(name, args) {
  return new Promise((resolve, reject) => {
    let id = window.uuid.v4()
    replyHandlers.set(id, { resolve, reject })
    socketClient.emit('message', JSON.stringify({ id, name, args }))
  })
}
```

#### `listen(name, callback)` → unsubscribe function
Subscribes to server push events.
```javascript
function listen(name, cb) {
  listeners.get(name).push(cb)
  return () => { /* unsubscribe */ }
}
```

**Message Queue:**
Messages are queued if socket isn't connected yet, then sent when connection opens.

## Communication Flow

### Request/Response Flow

```
1. Client calls send('make-factorial', { num: 5 })
2. client-ipc.js creates message: { id: "abc123", name: "make-factorial", args: { num: 5 } }
3. Message sent via node-ipc socket
4. server-ipc.js receives message, parses it
5. Calls handlers['make-factorial']({ num: 5 })
6. Handler returns result (120)
7. server-ipc.js sends reply: { type: "reply", id: "abc123", result: 120 }
8. client-ipc.js receives reply, resolves promise with result
```

### Server Push Flow

```
1. Server calls ipc.send('notification', { message: 'Hello' })
2. server-ipc.js broadcasts: { type: "push", name: "notification", args: { message: 'Hello' } }
3. client-ipc.js receives push message
4. Calls all registered listeners for 'notification'
```

## Key Design Decisions

### 1. Direct IPC vs HTTP
- **Chosen:** Direct IPC via node-ipc sockets
- **Why:** No network stack overhead, no port conflicts, works offline

### 2. Socket Name Discovery
- **Chosen:** Dynamic socket naming (myapp1, myapp2, etc.)
- **Why:** Allows multiple app instances to run simultaneously

### 3. Preload Script Pattern
- **Chosen:** Expose minimal APIs via preload
- **Why:** Security - renderer doesn't have full Node.js access

### 4. Promise-based API
- **Chosen:** `send()` returns Promise
- **Why:** Clean async/await syntax in client code

### 5. Message Queue
- **Chosen:** Queue messages until socket connects
- **Why:** Prevents race conditions during startup

## Dependencies

```json
{
  "dependencies": {
    "electron-is-dev": "^1.1.0",  // Detect dev/prod mode
    "node-ipc": "^9.1.1",          // IPC communication
    "uuid": "^3.3.2"               // Generate message IDs
  }
}
```

## Usage Example

```javascript
// In client code (renderer)
async function example() {
  // Send request and wait for response
  const result = await send('make-factorial', { num: 5 })
  console.log(result) // 120
  
  // Listen for server pushes
  const unsubscribe = listen('notification', (args) => {
    console.log('Got notification:', args)
  })
  
  // Later: stop listening
  unsubscribe()
}
```

## Advantages of This Pattern

1. **No HTTP overhead** - Direct socket communication
2. **No port conflicts** - Uses named sockets, not TCP ports
3. **Works offline** - No network required
4. **Multiple instances** - Each instance gets unique socket
5. **Bidirectional** - Server can push to client
6. **Type-safe messages** - JSON protocol with IDs
7. **Queue support** - Messages queued until connected
