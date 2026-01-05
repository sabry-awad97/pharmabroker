<div align="center">

# 🐳 Docker Configuration

**PharmaBroker uses Docker for infrastructure and backend services**

</div>

---

## 🏗️ Architecture

```
╔═══════════════════════════════════════════════════════════════╗
║                 Docker Network: pharmabroker                  ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║   ┌──────────────┐       ┌──────────────┐                    ║
║   │  🗄️ Postgres │◄──────│   ⚡ API     │                    ║
║   │    :5432     │       │    :3000     │                    ║
║   └──────────────┘       └──────────────┘                    ║
║          ▲                      ▲                            ║
║          │                      │                            ║
║          │               ┌──────┴──────┐                     ║
║          └───────────────│ 📱 WhatsApp │                     ║
║                          │    :8080    │                     ║
║                          └─────────────┘                     ║
╚═══════════════════════════════════════════════════════════════╝
                                ▲
                                │
                    ┌───────────┴───────────┐
                    │  🖥️ Tauri Desktop App │  ← Run locally
                    │        :5173          │
                    └───────────────────────┘
```

---

## 📊 Port Allocation

| Service          |  Port  | Docker | Description                 |
| :--------------- | :----: | :----: | :-------------------------- |
| 🗄️ PostgreSQL    | `5432` |   ✅   | Database with pgvector      |
| ⚡ API (Bun)     | `3000` |   ✅   | Hono API server             |
| 📱 WhatsApp (Go) | `8080` |   ✅   | Internal Docker network     |
| 🖥️ Tauri/Web     | `5173` |   🏠   | Run locally with hot reload |

---

## 🚀 Quick Start

```bash
# Start all backend services
task dev:docker:full

# Launch Tauri desktop app
task tauri:dev
```

---

## 📦 Docker Profiles

### Default Profile

> Infrastructure only (Postgres + WhatsApp dev)

```bash
task dev:docker
```

**Starts:**

- 🗄️ **postgres** — PostgreSQL 18 with pgvector
- 📱 **whatsapp-dev** — Go/Gin with Air hot reload

---

### Full Profile ⭐ Recommended

> All backend services

```bash
task dev:docker:full
```

**Starts:**

- 🗄️ **postgres** — PostgreSQL 18 with pgvector
- 📱 **whatsapp-dev** — Go/Gin with Air hot reload
- ⚡ **api** — Bun/Hono API server

---

### Production Profile

> All services in production mode

```bash
task dev:docker:prod
```

**Starts:**

- 🗄️ **postgres** — PostgreSQL 18 with pgvector
- 📱 **whatsapp** — Go binary (production build)
- ⚡ **api** — Bun/Hono API server

---

## 🎯 Task Commands

| Command                | Description                     |
| :--------------------- | :------------------------------ |
| `task dev:docker`      | Start Postgres + WhatsApp (dev) |
| `task dev:docker:full` | Start all backend services      |
| `task dev:docker:prod` | Start all services (production) |
| `task infra:logs`      | View Docker logs                |
| `task infra:down`      | Stop all containers             |
| `task infra:clean`     | Stop + remove all data          |

---

## ⚙️ Environment Variables

> Copy `.env.example` to `.env`

```bash
cp .env.example .env
```

| Variable             | Default                 | Description             |
| :------------------- | :---------------------- | :---------------------- |
| `POSTGRES_DB`        | `pharmabroker`          | Database name           |
| `POSTGRES_USER`      | `postgres`              | Database user           |
| `POSTGRES_PASSWORD`  | `password`              | Database password       |
| `DATABASE_URL`       | —                       | Full connection string  |
| `BETTER_AUTH_SECRET` | —                       | Auth secret (32+ chars) |
| `BETTER_AUTH_URL`    | `http://localhost:3000` | Auth server URL         |
| `CORS_ORIGIN`        | `http://localhost:5173` | Frontend URL for CORS   |
| `VITE_SERVER_URL`    | `http://localhost:5173` | Frontend API URL        |

---

## 🤖 AI Models

> Pull models for Docker Model Runner

```bash
task ai:pull
```

| Model            | Description                   |
| :--------------- | :---------------------------- |
| 🧠 **qwen**      | Primary LLM (Qwen 3 VL)       |
| 💎 **gemma**     | Google LLM (Gemma 3)          |
| ⚡ **ministral** | Alternative LLM (Ministral 3) |
| 📊 **embedding** | Embedding model (Gemma)       |

---

## 📁 Dockerfiles

| Service     | Location                      | Description                |
| :---------- | :---------------------------- | :------------------------- |
| ⚡ API      | `apps/server/Dockerfile`      | Bun/Hono multi-stage build |
| 📱 WhatsApp | `service/whatsapp/Dockerfile` | Go multi-stage build       |

---

## 🔧 Troubleshooting

### Container name conflict

```bash
docker stop pharmabroker-whatsapp pharmabroker-api
docker rm pharmabroker-whatsapp pharmabroker-api
task dev:docker:full
```

### View container logs

```bash
docker logs pharmabroker-api --tail 50
docker logs pharmabroker-whatsapp --tail 50
docker logs pharmabroker-postgres --tail 50
```

### Rebuild from scratch

```bash
task infra:clean
task dev:docker:full
```

---

<div align="center">

MIT © PharmaBroker

</div>
