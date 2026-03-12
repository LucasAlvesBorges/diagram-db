# Diagram DB

Visual database designer for **Django developers**. Design your PostgreSQL schema visually or through AI-powered MCP tools, then export production-ready DDL that maps directly to Django field types.

Built as a DrawSQL alternative with first-class Django support — column types like `BigAutoField`, `CharField`, `JSONField`, `ManyToManyField` etc. are mapped directly to their PostgreSQL equivalents.

## Features

- **Visual editor** — drag-and-drop table designer with React Flow canvas
- **Django field types** — native support for all Django/DRF model field types
- **MCP Server** — 9 tools for AI-assisted schema design (Claude Code, Cursor, etc.)
- **SQL export** — generates PostgreSQL DDL with ENUMs, FKs, indices, and M2M join tables
- **Relationship editor** — 1:1, 1:N, N:M with configurable ON DELETE/ON UPDATE
- **PostgreSQL ENUMs** — first-class enum support as column types
- **Dual storage** — file-based or PostgreSQL persistence
- **Docker ready** — single `docker compose up` for the full stack

---

## Prerequisites

- [Node.js](https://nodejs.org/) 22+ (or [Bun](https://bun.sh/))
- [Docker](https://docs.docker.com/get-docker/) + Docker Compose (optional, but recommended)

---

## Installation

### 1. Clone the repo

```bash
git clone https://github.com/LucasAlvesBorges/diagram-db.git
cd diagram-db
```

Or fork first on GitHub and clone your fork:

```bash
git clone https://github.com/<your-username>/diagram-db.git
cd diagram-db
```

### 2. Install dependencies

```bash
npm install
```

---

## Running the Project

### Option A — Docker (recommended)

Sobe API + frontend + PostgreSQL com um comando:

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Web UI | `http://localhost:5173` |
| API | `http://localhost:3000` |
| PostgreSQL | `localhost:5433` (user: `admin`, password: `password`) |

Para parar:

```bash
docker compose down
```

### Option B — Local (without Docker)

Abra dois terminais:

```bash
# Terminal 1 — API (file storage por padrão)
npm run dev:node

# Terminal 2 — Frontend
npm run dev:web
```

Para usar PostgreSQL local em vez de file storage:

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/diagram_db" npm run dev:node
```

The API runs on port `3000`, the frontend on `5173` (with proxy to the API).

---

## MCP Server — AI-Assisted Schema Design

The MCP server lets AI assistants (Claude Code, Cursor, Windsurf, etc.) create and manage database diagrams programmatically. Describe your Django models in natural language and the AI builds the visual diagram + SQL for you.

### Available Tools

| Tool | Description |
|------|-------------|
| `create_diagram` | Create or upsert a full diagram (tables, relationships, enums) |
| `add_table` | Add a table with columns and indices to an existing diagram |
| `remove_table` | Remove a table and all related edges |
| `add_relationship` | Create FK or M2M relationship between tables |
| `remove_relationship` | Delete a specific relationship |
| `manage_enums` | Add, remove, or list PostgreSQL enums |
| `list_projects` | List all saved diagrams |
| `get_project` | Get full project details (JSON) |
| `export_sql` | Generate PostgreSQL DDL from a diagram |

### Installing the MCP in Your Project

Add a `.mcp.json` file to the root of any project:

#### With PostgreSQL (requires the database running)

```json
{
  "mcpServers": {
    "diagram-db": {
      "command": "node",
      "args": ["/absolute/path/to/diagram-db/packages/mcp-server/src/index.js"],
      "env": {
        "STORAGE": "postgres",
        "DATABASE_URL": "postgresql://admin:password@127.0.0.1:5433/diagram_db"
      }
    }
  }
}
```

#### With file storage (no database needed)

```json
{
  "mcpServers": {
    "diagram-db": {
      "command": "node",
      "args": ["/absolute/path/to/diagram-db/packages/mcp-server/src/index.js"],
      "env": {
        "STORAGE": "file"
      }
    }
  }
}
```

> Replace `/absolute/path/to/diagram-db` with the actual path where you cloned this repo.

#### Per-editor configuration

**Claude Code** — place `.mcp.json` at the project root (or `~/.claude/.mcp.json` for global).

**Cursor** — add to `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "diagram-db": {
      "command": "node",
      "args": ["/absolute/path/to/diagram-db/packages/mcp-server/src/index.js"],
      "env": { "STORAGE": "file" }
    }
  }
}
```

**Windsurf** — add to `~/.codeium/windsurf/mcp_config.json` with the same format.

### Usage Examples

Once configured, ask your AI assistant things like:

```
"Create a diagram for a blog app with User, Post, Comment, and Tag models"

"Add a Category table with name, slug, and parent FK to the blog diagram"

"Export the SQL for the blog project"

"Add an enum post_status with values draft, published, archived"
```

The AI will call the MCP tools automatically and the diagrams will appear in the web UI.

---

## Supported Django Field Types

The SQL generator maps these Django field types to PostgreSQL:

| Django Field | PostgreSQL Type |
|---|---|
| `BigAutoField` | `bigserial` |
| `AutoField` | `serial` |
| `BigIntegerField` | `bigint` |
| `IntegerField` | `integer` |
| `SmallIntegerField` | `smallint` |
| `CharField` | `varchar(max_length)` |
| `TextField` | `text` |
| `EmailField` | `varchar(254)` |
| `URLField` | `varchar(200)` |
| `SlugField` | `varchar(50)` |
| `BooleanField` | `boolean` |
| `DateField` | `date` |
| `DateTimeField` | `timestamptz` |
| `TimeField` | `time` |
| `DecimalField` | `decimal(max_digits, decimal_places)` |
| `FloatField` | `double precision` |
| `JSONField` | `jsonb` |
| `UUIDField` | `uuid` |
| `FileField` / `ImageField` | `varchar(100)` |
| `ForeignKey` | FK constraint + column |
| `ManyToManyField` | Join table |
| Custom ENUMs | `CREATE TYPE ... AS ENUM` |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `STORAGE` | `auto` | Storage mode: `auto`, `file`, or `postgres` |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `PORT` | `3000` | API server port |
| `HOST` | `127.0.0.1` | API server host |

In `auto` mode, Postgres is attempted first; if unavailable, falls back to file storage at `apps/api/data/projects.json`.

---

## Project Structure

```
diagram-db/
├── apps/
│   ├── api/                # Node.js REST API
│   └── web/                # React + Vite frontend
├── packages/
│   ├── mcp-server/         # MCP server (9 tools)
│   └── shared/             # SQL generation engine
├── docker-compose.yml
└── .mcp.json               # MCP config (local dev)
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/projects` | List all projects |
| `POST` | `/projects` | Create project |
| `GET` | `/projects/:id` | Get project |
| `PUT` | `/projects/:id` | Update project |
| `DELETE` | `/projects/:id` | Delete project |
| `POST` | `/projects/:id/export/sql` | Export SQL |

---

## CLI — Export SQL from JSON

```bash
node packages/shared/src/postgres/cli-generate-sql.js path/to/diagram.json
```
