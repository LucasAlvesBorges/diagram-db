import { randomUUID } from "node:crypto";

import { generatePostgresSql } from "../../../packages/shared/src/postgres/generateSql.js";

function parseRoute(url) {
  const { pathname } = new URL(url, "http://localhost");
  return pathname.split("/").filter(Boolean);
}

export async function handleApiRequest({ store, method, url, body }) {
  const parts = parseRoute(url ?? "/");
  const verb = method ?? "GET";

  // Compat (project.txt): POST /save + GET /load/:id
  if (verb === "POST" && parts.length === 1 && parts[0] === "save") {
    const payload = body ?? {};
    const id = payload.id ?? randomUUID();
    const project = await store.save({ id, name: payload.name, diagram: payload.diagram ?? payload });
    return { status: 201, json: { project } };
  }

  if (verb === "GET" && parts.length === 2 && parts[0] === "load") {
    const project = await store.get(parts[1]);
    if (!project) return { status: 404, text: "Project not found" };
    return { status: 200, json: { project } };
  }

  if (verb === "GET" && parts.length === 1 && parts[0] === "health") {
    return { status: 200, json: { ok: true } };
  }

  if (parts[0] !== "projects") return { status: 404, text: "Not Found" };

  // GET /projects
  if (verb === "GET" && parts.length === 1) {
    const projects = await store.list();
    return { status: 200, json: { projects } };
  }

  // POST /projects
  if (verb === "POST" && parts.length === 1) {
    const payload = body ?? {};
    const id = payload.id ?? randomUUID();
    const project = await store.save({ id, name: payload.name, diagram: payload.diagram });
    return { status: 201, json: { project } };
  }

  const id = parts[1];
  if (!id) return { status: 400, text: "Missing project id" };

  // GET /projects/:id
  if (verb === "GET" && parts.length === 2) {
    const project = await store.get(id);
    if (!project) return { status: 404, text: "Project not found" };
    return { status: 200, json: { project } };
  }

  // PUT /projects/:id
  if (verb === "PUT" && parts.length === 2) {
    const payload = body ?? {};
    const existing = await store.get(id);
    if (!existing) return { status: 404, text: "Project not found" };
    const project = await store.save({
      id,
      name: payload.name ?? existing.name,
      diagram: payload.diagram ?? existing.diagram
    });
    return { status: 200, json: { project } };
  }

  // DELETE /projects/:id
  if (verb === "DELETE" && parts.length === 2) {
    const removed = await store.remove(id);
    if (!removed) return { status: 404, text: "Project not found" };
    return { status: 200, json: { ok: true } };
  }

  // POST /projects/:id/export/sql
  if (verb === "POST" && parts.length === 4 && parts[2] === "export" && parts[3] === "sql") {
    const project = await store.get(id);
    if (!project) return { status: 404, text: "Project not found" };
    const result = generatePostgresSql(project.diagram);
    return { status: 200, json: result };
  }

  return { status: 404, text: "Not Found" };
}

