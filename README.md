<div align="center">

<img src=".github/assets/logo.png" width="180" alt="PharmaBroker Logo" />

# 🏥 PharmaBroker

**AI-Powered Pharmaceutical Trading Platform**

_Bridging medication supply and demand through intelligent automation_

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Go](https://img.shields.io/badge/Go-1.24-00ADD8?logo=go&logoColor=white)](https://go.dev/)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-24C8D8?logo=tauri&logoColor=white)](https://tauri.app/)
[![Bun](https://img.shields.io/badge/Bun-1.2-f9f1e1?logo=bun&logoColor=black)](https://bun.sh/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

[Quick Start](#-quick-start) •
[Features](#-features) •
[Architecture](#-architecture) •
[Commands](#-commands) •
[Docs](#-documentation)

</div>

---

<div align="center">
<img src=".github/assets/hero_banner.png" width="100%" alt="PharmaBroker Banner" />
</div>

---

## ✨ Features

<table>
<tr>
<td width="60%">

| Category        | Technologies                         |
| :-------------- | :----------------------------------- |
| 🖥️ **Desktop**  | Tauri 2.0, React 19, TanStack Router |
| ⚡ **Backend**  | Hono, oRPC (type-safe APIs)          |
| 🗄️ **Database** | PostgreSQL 18 + pgvector, Prisma     |
| 📱 **WhatsApp** | Go/Gin microservice                  |
| 🤖 **AI**       | Docker Model Runner                  |
| 🔧 **DevOps**   | Turborepo, Docker Compose, Taskfile  |

</td>
<td width="40%" align="center">
<img src=".github/assets/speed_efficiency.png" width="100%" alt="Speed & Efficiency" />
</td>
</tr>
</table>

---

## 🧠 Intelligent Matching

<div align="center">
<img src=".github/assets/matching_engine.png" width="800" alt="Supply and Demand Matching" />

_Real-time AI matching of medication supply with patient demand_

</div>

---

## 🏗️ Architecture

```mermaid
graph TD
    subgraph "🖥️ Desktop"
        UI[React 19]
        Core[Tauri 2.0]
    end

    subgraph "🐳 Docker"
        API[⚡ API :3000]
        WA[📱 WhatsApp :8080]
        DB[(🗄️ Postgres :5432)]
        LLM[🤖 AI Models]
    end

    Core --> API
    API --> DB
    API --> WA
    WA --> DB
    WA --> LLM
    API --> LLM
```

---

## 🚀 Quick Start

### Prerequisites

| Tool                          | Version |
| :---------------------------- | :------ |
| [Bun](https://bun.sh)         | v1.2+   |
| [Docker](https://docker.com)  | v2.38+  |
| [Rust](https://rust-lang.org) | Latest  |
| [Task](https://taskfile.dev)  | Latest  |

### Setup

```bash
# 1. Install dependencies
bun install
cp .env.example .env

# 2. Start backend services
task dev:docker:full

# 3. Initialize database
task db:push

# 4. Launch desktop app
task tauri:dev
```

> 💡 See [QUICKSTART.md](QUICKSTART.md) for detailed instructions

---

## 🎯 Commands

| Category        | Command                | Description                |
| :-------------- | :--------------------- | :------------------------- |
| 🐳 **Docker**   | `task dev:docker:full` | Start all backend services |
| 🖥️ **Desktop**  | `task tauri:dev`       | Launch Tauri app           |
| 🗄️ **Database** | `task db:push`         | Push schema to database    |
| 🗄️ **Database** | `task db:studio`       | Open Prisma Studio         |
| 📋 **Infra**    | `task infra:logs`      | View Docker logs           |
| 📋 **Infra**    | `task infra:down`      | Stop Docker services       |
| 🤖 **AI**       | `task ai:pull`         | Pull AI models             |

> Run `task --list` to see all available commands

---

## 📁 Project Structure

```
pharmabroker/
├── 📂 apps/
│   ├── web/              # React + Tauri desktop
│   └── server/           # Hono API (Bun)
├── 📂 packages/
│   ├── api/              # oRPC router
│   ├── auth/             # Better Auth
│   ├── db/               # Prisma schema
│   └── env/              # Environment validation
└── 📂 service/
    └── whatsapp/         # Go/Gin microservice
```

---

## 📚 Documentation

| Document                          | Description              |
| :-------------------------------- | :----------------------- |
| 📖 [QUICKSTART.md](QUICKSTART.md) | Step-by-step setup guide |
| 🐳 [DOCKER.md](DOCKER.md)         | Docker configuration     |

---

## 🔧 Tech Stack

<div align="center">

|                                                                                                              |                                                                                                    |                                                                                                  |                                                                                                    |                                                                                                              |                                                                                                      |                                                                                              |
| :----------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------: |
| <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" width="40"> | <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg" width="40"> | <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/rust/rust-original.svg" width="40"> | <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/tauri/tauri-original.svg" width="40"> | <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/postgresql/postgresql-original.svg" width="40"> | <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/docker/docker-original.svg" width="40"> | <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/go/go-original.svg" width="40"> |
|                                                  TypeScript                                                  |                                              React 19                                              |                                               Rust                                               |                                               Tauri                                                |                                                  PostgreSQL                                                  |                                                Docker                                                |                                              Go                                              |

</div>

---

<div align="center">

**MIT © PharmaBroker**

</div>
