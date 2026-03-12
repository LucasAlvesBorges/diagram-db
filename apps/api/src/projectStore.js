import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_DIAGRAM = { nodes: [], edges: [], databaseConfig: { enums: [] } };

function modulePath(...parts) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(__dirname, ...parts);
}

const DEFAULT_FILENAME = modulePath("../data/projects.json");

function nowIso() {
  return new Date().toISOString();
}

async function readJsonFile(filename) {
  try {
    const raw = await fs.readFile(filename, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") return { projects: {} };
    throw error;
  }
}

async function writeJsonFileAtomic(filename, data) {
  const dir = path.dirname(filename);
  await fs.mkdir(dir, { recursive: true });

  const tmp = `${filename}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(tmp, filename);
}

export function createFileProjectStore({ filename = DEFAULT_FILENAME } = {}) {
  async function list() {
    const db = await readJsonFile(filename);
    return Object.values(db.projects).map(({ diagram, ...meta }) => meta);
  }

  async function get(id) {
    const db = await readJsonFile(filename);
    return db.projects[id] ?? null;
  }

  async function save({ id, name, diagram }) {
    const db = await readJsonFile(filename);
    const existing = db.projects[id] ?? null;

    const project = {
      id,
      name: name ?? existing?.name ?? "Untitled",
      diagram: diagram ?? existing?.diagram ?? DEFAULT_DIAGRAM,
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso()
    };

    db.projects[id] = project;
    await writeJsonFileAtomic(filename, db);
    return project;
  }

  async function remove(id) {
    const db = await readJsonFile(filename);
    const existing = db.projects[id] ?? null;
    if (!existing) return false;

    delete db.projects[id];
    await writeJsonFileAtomic(filename, db);
    return true;
  }

  return { list, get, save, remove };
}

async function importPg() {
  try {
    return await import("pg");
  } catch {
    throw new Error('Pacote "pg" não instalado. Rode `bun add pg` (ou `npm i pg`).');
  }
}

export async function createPostgresProjectStore({ databaseUrl }) {
  if (!databaseUrl) throw new Error("DATABASE_URL obrigatório para Postgres store");

  const { Pool } = await importPg();
  const pool = new Pool({ connectionString: databaseUrl });

  async function ensureSchema() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id uuid PRIMARY KEY,
        name text NOT NULL,
        diagram jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  }

  await ensureSchema();

  async function list() {
    const { rows } = await pool.query(
      `SELECT id, name, created_at AS "createdAt", updated_at AS "updatedAt" FROM projects ORDER BY updated_at DESC`
    );
    return rows;
  }

  async function get(id) {
    const { rows } = await pool.query(
      `SELECT id, name, diagram, created_at AS "createdAt", updated_at AS "updatedAt" FROM projects WHERE id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  async function save({ id, name, diagram }) {
    const payload = {
      id,
      name: name ?? "Untitled",
      diagram: diagram ?? DEFAULT_DIAGRAM
    };

    const { rows } = await pool.query(
      `
      INSERT INTO projects (id, name, diagram)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            diagram = EXCLUDED.diagram,
            updated_at = now()
      RETURNING id, name, diagram, created_at AS "createdAt", updated_at AS "updatedAt"
      `,
      [payload.id, payload.name, payload.diagram]
    );
    return rows[0];
  }

  async function remove(id) {
    const { rowCount } = await pool.query(`DELETE FROM projects WHERE id = $1`, [id]);
    return rowCount > 0;
  }

  return { list, get, save, remove };
}

export async function createProjectStore({
  filename = DEFAULT_FILENAME,
  databaseUrl = process.env.DATABASE_URL,
  storage = process.env.STORAGE ?? "auto"
} = {}) {
  const mode = String(storage ?? "auto").toLowerCase();

  if (mode === "file") return createFileProjectStore({ filename });

  if (mode === "postgres") return createPostgresProjectStore({ databaseUrl });

  if (mode !== "auto") {
    throw new Error(`STORAGE inválido: ${storage} (use auto|file|postgres)`);
  }

  if (!databaseUrl) return createFileProjectStore({ filename });

  try {
    return await createPostgresProjectStore({ databaseUrl });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[projectStore] Postgres indisponível (${error?.message ?? error}); usando file store em ${filename}`);
    return createFileProjectStore({ filename });
  }
}
