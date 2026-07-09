# Lumina – Native Agent & Tool Orchestrator

A native desktop application built with React, Vite, Electron, and a high-performance C++ WebSocket server.

## Prerequisites

Ensure the following are installed on your system before proceeding:

### macOS

1. **Compiler & Tools**: Install Xcode Command Line Tools:
   ```bash
   xcode-select --install
   ```
2. **Node.js, npm & curl**: Install using Homebrew:
   ```bash
   brew install node curl
   ```

### Linux

Install a C++17 compiler (like Clang), standard build tools, Node.js, npm, and curl using your distribution's package manager:

- **Debian / Ubuntu** (`apt`):
  ```bash
  sudo apt update
  sudo apt install clang build-essential nodejs npm curl
  ```
- **Fedora / RHEL / Rocky** (`dnf`):
  ```bash
  sudo dnf groupinstall "Development Tools"
  sudo dnf install clang nodejs npm curl
  ```
- **Arch Linux** (`pacman`):
  ```bash
  sudo pacman -Syu clang base-devel nodejs npm curl
  ```

### Non-Sudo / User-Space Installation (No Root)

If you do not have root (`sudo`) privileges on the machine, you can install everything in your home directory:

1. **Check if a C++ compiler is already installed**:
   ```bash
   g++ --version || clang++ --version
   ```
2. **Node.js**: Install via [nvm](https://github.com/nvm-sh/nvm) (installs under `~/.nvm`):
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
   
   # Load nvm in the current terminal session (if 'nvm not found'):
   export NVM_DIR="$HOME/.nvm"
   [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
   
   # Or reload your profile:
   source ~/.bashrc  # (or source ~/.zshrc / ~/.bash_profile depending on your shell)
   
   # Install Node:
   nvm install --lts
   ```
3. **Compiler & curl (if missing)**: Install [Homebrew for Linux](https://docs.brew.sh/Homebrew-on-Linux) (installs in `~/.linuxbrew` without root):
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   # Follow the installer instructions to add Homebrew to your PATH, then install GCC and curl:
   brew install gcc curl
   ```




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
