<div align="center">

# 🚀 Quick Start Guide

**Get PharmaBroker running in minutes**

</div>

---

## 🛠️ Prerequisites

| Tool                             | Version | Description                   |
| :------------------------------- | :------ | :---------------------------- |
| 🟢 [Bun](https://bun.sh)         | v1.2+   | Runtime & Package Manager     |
| 🐳 [Docker](https://docker.com)  | v2.38+  | Backend Services              |
| 🦀 [Rust](https://rust-lang.org) | Latest  | Tauri Desktop                 |
| 📋 [Task](https://taskfile.dev)  | Latest  | Task Runner                   |
| 🔹 [Go](https://go.dev)          | v1.24+  | WhatsApp service _(optional)_ |

---

## 📦 Step 1: Clone & Install

```bash
git clone <repository-url>
cd pharmabroker
bun install
```

---

## ⚙️ Step 2: Environment Setup

```bash
cp .env.example .env
```

> [!IMPORTANT]
> Edit `.env` and set `BETTER_AUTH_SECRET` to a random 32+ character string

---

## 🐳 Step 3: Start Backend Services

```bash
task dev:docker:full
```

This starts:
| Service | Port | Description |
|:--------|:----:|:------------|
| 🗄️ Postgres | `5432` | Database with pgvector |
| ⚡ API | `3000` | Bun/Hono server |
| 📱 WhatsApp | `8080` | Go/Gin (internal) |

---

## 🗄️ Step 4: Initialize Database

```bash
task db:push
task db:generate
```

---

## 🖥️ Step 5: Launch Desktop App

```bash
task tauri:dev
```

🎉 **Done!** The Tauri desktop app will open.

---

## 🎯 Common Commands

| Command                | Description                |
| :--------------------- | :------------------------- |
| `task --list`          | View all available tasks   |
| `task dev:docker:full` | Start all backend services |
| `task tauri:dev`       | Launch Tauri desktop app   |
| `task db:studio`       | Open Prisma Studio         |
| `task infra:logs`      | View Docker logs           |
| `task infra:down`      | Stop Docker services       |
| `task infra:clean`     | Reset everything           |

---

## 🔄 Development Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  1. task dev:docker:full    ← Start backend services        │
│  2. task tauri:dev          ← Launch desktop app            │
│  3. task infra:logs         ← Monitor logs (optional)       │
│  4. task db:studio          ← Database UI (optional)        │
└─────────────────────────────────────────────────────────────┘
```

---

## 🤖 AI Models (Optional)

```bash
task ai:pull
```

---

## 📚 More Documentation

| Document               | Description                     |
| :--------------------- | :------------------------------ |
| [DOCKER.md](DOCKER.md) | Docker configuration & profiles |
| [README.md](README.md) | Project overview                |

---

<div align="center">

MIT © PharmaBroker

</div>
