#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import crypto from "node:crypto";

import { createProjectStore } from "../../../apps/api/src/projectStore.js";
import { generatePostgresSql } from "../../../packages/shared/src/postgres/generateSql.js";

/* ── Constants ─────────────────────────────────── */

const TABLE_COLORS = ["#22d3ee", "#a78bfa", "#fb7185", "#fbbf24", "#34d399", "#60a5fa", "#fb923c", "#f472b6"];

const GRID_GAP_X = 100;
const GRID_GAP_Y = 60;
const NODE_WIDTH = 280;

/* ── ID helpers ────────────────────────────────── */

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function tableNodeId(name) {
  return `tbl-${slug(name)}`;
}

function columnId(tableName, colName) {
  return `col-${slug(tableName)}-${slug(colName)}`;
}

function edgeId(srcTable, tgtTable, srcCol, tgtCol) {
  const base = `rel-${slug(srcTable)}-${slug(tgtTable)}`;
  if (srcCol && tgtCol) return `${base}-${slug(srcCol)}-${slug(tgtCol)}`;
  return base;
}

/* ── Auto-layout ───────────────────────────────── */

function estimateNodeHeight(colCount) {
  return 81 + Math.max(1, colCount) * 24;
}

function autoLayout(tables) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(tables.length)));
  const colHeights = new Array(cols).fill(0);
  return tables.map((t, i) => {
    const gc = i % cols;
    const x = gc * (NODE_WIDTH + GRID_GAP_X) + 100;
    const y = colHeights[gc] + 100;
    colHeights[gc] = y + estimateNodeHeight(t.columns?.length ?? 1) + GRID_GAP_Y;
    return { x, y };
  });
}

function findNextPosition(existingNodes, newColCount) {
  if (!existingNodes.length) return { x: 100, y: 100 };
  let maxX = 0, maxY = 0;
  for (const n of existingNodes) {
    const right = (n.position?.x ?? 0) + NODE_WIDTH;
    const bottom = (n.position?.y ?? 0) + estimateNodeHeight(n.data?.columns?.length ?? 1);
    if (right > maxX) maxX = right;
    if (bottom > maxY) maxY = bottom;
  }
  return { x: maxX + GRID_GAP_X, y: 100 };
}

/* ── Diagram builder ───────────────────────────── */

function buildDiagram({ tables, relationships, enums }) {
  const positions = autoLayout(tables);

  const nodes = tables.map((table, i) => ({
    id: tableNodeId(table.name),
    type: "tableNode",
    position: positions[i],
    data: {
      tableName: table.name,
      headerColor: table.headerColor ?? TABLE_COLORS[i % TABLE_COLORS.length],
      columns: (table.columns ?? []).map((col) => ({
        id: columnId(table.name, col.name),
        name: col.name,
        type: col.type ?? "text",
        isPrimary: col.isPrimary ?? false,
        notNull: col.notNull ?? false,
        isUnique: col.isUnique ?? false,
        default: col.default ?? "",
        ...(col.length != null ? { length: col.length } : {}),
        ...(col.precision != null ? { precision: col.precision } : {}),
        ...(col.isEnum ? { isEnum: true } : {}),
      })),
      indices: (table.indices ?? []).map((idx) => ({
        name: idx.name,
        columns: idx.columns,
        unique: idx.unique ?? false,
      })),
    },
  }));

  const edges = (relationships ?? []).map((rel) => ({
    id: edgeId(rel.from, rel.to, rel.fromColumn, rel.toColumn),
    source: tableNodeId(rel.from),
    target: tableNodeId(rel.to),
    sourceHandle: columnId(rel.from, rel.fromColumn),
    targetHandle: columnId(rel.to, rel.toColumn),
    data: {
      relationship: rel.type ?? "1:n",
      onUpdate: rel.onUpdate ?? "CASCADE",
      onDelete: rel.onDelete ?? "CASCADE",
    },
  }));

  return {
    nodes,
    edges,
    databaseConfig: { enums: (enums ?? []).map((e) => ({ name: e.name, values: e.values })) },
  };
}

/* ── Zod schemas ───────────────────────────────── */

const ColumnSchema = z.object({
  name: z.string(),
  type: z.string().default("text"),
  isPrimary: z.boolean().default(false),
  notNull: z.boolean().default(false),
  isUnique: z.boolean().default(false),
  default: z.string().optional(),
  length: z.number().optional(),
  precision: z.string().optional(),
  isEnum: z.boolean().optional(),
});

const IndexSchema = z.object({
  name: z.string(),
  columns: z.array(z.string()),
  unique: z.boolean().default(false),
});

const TableSchema = z.object({
  name: z.string(),
  headerColor: z.string().optional(),
  columns: z.array(ColumnSchema).default([]),
  indices: z.array(IndexSchema).default([]),
});

const RelationshipSchema = z.object({
  from: z.string().describe("Source table name"),
  fromColumn: z.string().describe("Source column name"),
  to: z.string().describe("Target table name"),
  toColumn: z.string().describe("Target column name"),
  type: z.enum(["1:1", "1:n", "n:n"]).default("1:n"),
  onUpdate: z.enum(["CASCADE", "SET NULL", "SET DEFAULT", "RESTRICT", "NO ACTION"]).default("CASCADE"),
  onDelete: z.enum(["CASCADE", "SET NULL", "SET DEFAULT", "RESTRICT", "NO ACTION"]).default("CASCADE"),
});

const EnumSchema = z.object({
  name: z.string(),
  values: z.array(z.string()),
});

/* ── Boot ──────────────────────────────────────── */

const store = await createProjectStore();

const server = new McpServer({
  name: "diagram-db",
  version: "0.0.1",
});

/* ── Project resolver (by name or ID) ──────────── */

const ProjectRef = z.object({
  projectName: z.string().optional().describe("Project name (preferred — enables upsert)"),
  projectId: z.string().optional().describe("Project UUID (alternative to projectName)"),
});

async function findByName(name) {
  const all = await store.list();
  const match = all.find((p) => p.name === name);
  if (!match) return null;
  return store.get(match.id);
}

async function resolveProject({ projectName, projectId }) {
  if (projectId) {
    const p = await store.get(projectId);
    if (p) return p;
  }
  if (projectName) return findByName(projectName);
  return null;
}

function notFound({ projectName, projectId }) {
  const ref = projectName ? `name="${projectName}"` : `id=${projectId}`;
  return { content: [{ type: "text", text: `Project ${ref} not found.` }] };
}

/* ── Tool: create_diagram ──────────────────────── */

server.tool(
  "create_diagram",
  "Create or replace a database diagram. If a project with the same name exists it is updated (upsert).",
  {
    projectName: z.string().default("Untitled"),
    tables: z.array(TableSchema),
    relationships: z.array(RelationshipSchema).default([]),
    enums: z.array(EnumSchema).default([]),
  },
  async ({ projectName, tables, relationships, enums }) => {
    const existing = await findByName(projectName);
    const id = existing?.id ?? crypto.randomUUID();
    const diagram = buildDiagram({ tables, relationships, enums });
    const project = await store.save({ id, name: projectName, diagram });

    const result = generatePostgresSql(diagram);
    const verb = existing ? "updated" : "created";

    return {
      content: [
        {
          type: "text",
          text: [
            `Diagram "${projectName}" ${verb}.`,
            `Project ID: ${project.id}`,
            `Tables: ${tables.length} | Relationships: ${relationships.length} | Enums: ${enums.length}`,
            result.errors.length ? `Errors: ${result.errors.join("; ")}` : "",
            result.warnings.length ? `Warnings: ${result.warnings.join("; ")}` : "",
            "",
            "--- Generated SQL ---",
            result.sql,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    };
  }
);

/* ── Tool: add_table ───────────────────────────── */

server.tool(
  "add_table",
  "Add a table (with columns and indices) to an existing diagram project. Identify the project by name or ID.",
  {
    ...ProjectRef.shape,
    table: TableSchema,
  },
  async ({ projectName, projectId, table }) => {
    const project = await resolveProject({ projectName, projectId });
    if (!project) return notFound({ projectName, projectId });

    const diagram = project.diagram;
    const pos = findNextPosition(diagram.nodes, table.columns.length);
    const colorIndex = diagram.nodes.filter((n) => n.type === "tableNode").length;

    const node = {
      id: tableNodeId(table.name),
      type: "tableNode",
      position: pos,
      data: {
        tableName: table.name,
        headerColor: table.headerColor ?? TABLE_COLORS[colorIndex % TABLE_COLORS.length],
        columns: table.columns.map((col) => ({
          id: columnId(table.name, col.name),
          name: col.name,
          type: col.type ?? "text",
          isPrimary: col.isPrimary ?? false,
          notNull: col.notNull ?? false,
          isUnique: col.isUnique ?? false,
          default: col.default ?? "",
          ...(col.length != null ? { length: col.length } : {}),
          ...(col.isEnum ? { isEnum: true } : {}),
        })),
        indices: table.indices.map((idx) => ({ name: idx.name, columns: idx.columns, unique: idx.unique ?? false })),
      },
    };

    diagram.nodes.push(node);
    await store.save({ id: project.id, name: project.name, diagram });
    return { content: [{ type: "text", text: `Table "${table.name}" added to "${project.name}".` }] };
  }
);

/* ── Tool: remove_table ────────────────────────── */

server.tool(
  "remove_table",
  "Remove a table and all its relationships from a diagram. Identify the project by name or ID.",
  {
    ...ProjectRef.shape,
    tableName: z.string(),
  },
  async ({ projectName, projectId, tableName }) => {
    const project = await resolveProject({ projectName, projectId });
    if (!project) return notFound({ projectName, projectId });

    const nodeId = tableNodeId(tableName);
    const diagram = project.diagram;
    diagram.nodes = diagram.nodes.filter((n) => n.id !== nodeId);
    diagram.edges = diagram.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);

    await store.save({ id: project.id, name: project.name, diagram });
    return { content: [{ type: "text", text: `Table "${tableName}" and its edges removed from "${project.name}".` }] };
  }
);

/* ── Tool: add_relationship ────────────────────── */

server.tool(
  "add_relationship",
  "Add a relationship (edge) between two columns in an existing diagram. Identify the project by name or ID.",
  {
    ...ProjectRef.shape,
    relationship: RelationshipSchema,
  },
  async ({ projectName, projectId, relationship: rel }) => {
    const project = await resolveProject({ projectName, projectId });
    if (!project) return notFound({ projectName, projectId });

    const diagram = project.diagram;
    const edge = {
      id: edgeId(rel.from, rel.to, rel.fromColumn, rel.toColumn),
      source: tableNodeId(rel.from),
      target: tableNodeId(rel.to),
      sourceHandle: columnId(rel.from, rel.fromColumn),
      targetHandle: columnId(rel.to, rel.toColumn),
      data: {
        relationship: rel.type ?? "1:n",
        onUpdate: rel.onUpdate ?? "CASCADE",
        onDelete: rel.onDelete ?? "CASCADE",
      },
    };

    diagram.edges.push(edge);
    await store.save({ id: project.id, name: project.name, diagram });
    return { content: [{ type: "text", text: `Relationship ${rel.from}.${rel.fromColumn} → ${rel.to}.${rel.toColumn} (${rel.type}) added to "${project.name}".` }] };
  }
);

/* ── Tool: remove_relationship ─────────────────── */

server.tool(
  "remove_relationship",
  "Remove a relationship from a diagram. Identify the project by name or ID.",
  {
    ...ProjectRef.shape,
    from: z.string(),
    fromColumn: z.string(),
    to: z.string(),
    toColumn: z.string(),
  },
  async ({ projectName, projectId, from, fromColumn, to, toColumn }) => {
    const project = await resolveProject({ projectName, projectId });
    if (!project) return notFound({ projectName, projectId });

    const eid = edgeId(from, to, fromColumn, toColumn);
    const diagram = project.diagram;
    const before = diagram.edges.length;
    diagram.edges = diagram.edges.filter((e) => e.id !== eid);

    if (diagram.edges.length === before) {
      return { content: [{ type: "text", text: `No relationship found between ${from}.${fromColumn} and ${to}.${toColumn}.` }] };
    }

    await store.save({ id: project.id, name: project.name, diagram });
    return { content: [{ type: "text", text: `Relationship removed.` }] };
  }
);

/* ── Tool: manage_enums ────────────────────────── */

server.tool(
  "manage_enums",
  "Add, remove, or list enums in a diagram's database config. Identify the project by name or ID.",
  {
    ...ProjectRef.shape,
    action: z.enum(["add", "remove", "list"]),
    enum: EnumSchema.optional(),
  },
  async ({ projectName, projectId, action, enum: enumDef }) => {
    const project = await resolveProject({ projectName, projectId });
    if (!project) return notFound({ projectName, projectId });

    const diagram = project.diagram;
    if (!diagram.databaseConfig) diagram.databaseConfig = { enums: [] };
    if (!diagram.databaseConfig.enums) diagram.databaseConfig.enums = [];

    if (action === "list") {
      const list = diagram.databaseConfig.enums.map((e) => `${e.name}: ${e.values.join(", ")}`).join("\n") || "(none)";
      return { content: [{ type: "text", text: list }] };
    }

    if (!enumDef) return { content: [{ type: "text", text: "Enum definition required for add/remove." }] };

    if (action === "add") {
      diagram.databaseConfig.enums = diagram.databaseConfig.enums.filter((e) => e.name !== enumDef.name);
      diagram.databaseConfig.enums.push({ name: enumDef.name, values: enumDef.values });
    } else {
      diagram.databaseConfig.enums = diagram.databaseConfig.enums.filter((e) => e.name !== enumDef.name);
    }

    await store.save({ id: project.id, name: project.name, diagram });
    return { content: [{ type: "text", text: `Enum "${enumDef.name}" ${action === "add" ? "added" : "removed"}.` }] };
  }
);

/* ── Tool: list_projects ───────────────────────── */

server.tool("list_projects", "List all saved diagram projects.", {}, async () => {
  const projects = await store.list();
  if (!projects.length) return { content: [{ type: "text", text: "No projects found." }] };

  const lines = projects.map((p) => `${p.id}  ${p.name}  (updated: ${p.updatedAt ?? "?"})`);
  return { content: [{ type: "text", text: lines.join("\n") }] };
});

/* ── Tool: get_project ─────────────────────────── */

server.tool(
  "get_project",
  "Get full details of a diagram project (tables, columns, relationships, enums). Identify by name or ID.",
  { ...ProjectRef.shape },
  async ({ projectName, projectId }) => {
    const project = await resolveProject({ projectName, projectId });
    if (!project) return notFound({ projectName, projectId });

    return { content: [{ type: "text", text: JSON.stringify(project, null, 2) }] };
  }
);

/* ── Tool: export_sql ──────────────────────────── */

server.tool(
  "export_sql",
  "Generate PostgreSQL DDL from a saved diagram project. Identify by name or ID.",
  { ...ProjectRef.shape },
  async ({ projectName, projectId }) => {
    const project = await resolveProject({ projectName, projectId });
    if (!project) return notFound({ projectName, projectId });

    const result = generatePostgresSql(project.diagram);
    const parts = [];
    if (result.errors.length) parts.push(`-- ERRORS: ${result.errors.join("; ")}`);
    if (result.warnings.length) parts.push(`-- WARNINGS: ${result.warnings.join("; ")}`);
    parts.push(result.sql);

    return { content: [{ type: "text", text: parts.join("\n") }] };
  }
);

/* ── Start ─────────────────────────────────────── */

const transport = new StdioServerTransport();
await server.connect(transport);
