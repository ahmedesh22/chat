# Lumina – Native Agent & Tool Orchestrator

A native desktop application built with React, Vite, Electron, and a high-performance C++ WebSocket server.

## Prerequisites

Ensure the following are installed on your system before proceeding:
1. **Node.js** (LTS version recommended)
2. **macOS Xcode Command Line Tools** (required to build the C++ server). Install by running:
   ```bash
   xcode-select --install
   ```
3. **curl** (usually pre-installed on macOS, used to fetch C++ server libraries)

---

## Setup & Running the Application

### 1. Clone the repository
```bash
git clone <repository-url>
cd chatapp-electron
```

### 2. Configure Environment Variables
Copy the template `.env.example` file to `.env`:
```bash
cp .env.example .env
```
Open `.env` and fill in your Gemini API Key:
```env
GEMINI_API_KEY=AIzaSy...
```

### 3. Install Dependencies
Run `npm install`. This will automatically download the necessary C++ libraries and compile the C++ server executable (`cpp-server/lumina-server`):
```bash
npm install
```

### 4. Start the Application
Launch the Vite development server and Electron shell concurrently:
```bash
npm run dev
```
