import test from "node:test";
import assert from "node:assert/strict";

import { generatePostgresSql } from "../src/postgres/generateSql.js";

test("gera enums, tabelas, índices e ignora annotationNode", () => {
  const diagram = {
    nodes: [
      {
        id: "tbl-users",
        type: "tableNode",
        position: { x: 0, y: 0 },
        data: {
          tableName: "users",
          columns: [
            {
              id: "col-id",
              name: "id",
              type: "BigAutoField",
              isPrimary: true,
              notNull: true
            },
            { id: "col-email", name: "email", type: "CharField", length: 255, isUnique: true, notNull: true },
            { id: "col-status", name: "status", type: "user_status", isEnum: true }
          ],
          indices: [{ name: "idx_users_email", columns: ["email"], unique: true }]
        }
      },
      {
        id: "note-1",
        type: "annotationNode",
        position: { x: 10, y: 10 },
        data: { content: "nao entra no sql" }
      }
    ],
    edges: [],
    databaseConfig: {
      enums: [{ name: "user_status", values: ["active", "inactive", "banned"] }]
    }
  };

  const { sql, errors } = generatePostgresSql(diagram);
  assert.deepEqual(errors, []);

  assert.match(sql, /CREATE TYPE "user_status" AS ENUM \('active', 'inactive', 'banned'\);/);
  assert.match(sql, /CREATE TABLE "users" \(/);
  assert.match(sql, /"id" bigautofield NOT NULL/);
  assert.match(sql, /"email" CharField\(max_length=255\) NOT NULL UNIQUE/);
  assert.match(sql, /"status" "user_status"/);
  assert.match(sql, /CREATE UNIQUE INDEX "idx_users_email" ON "users" \("email"\);/);
  assert.doesNotMatch(sql, /note-1/);
});

test("gera FK via edge (1:n) com ações", () => {
  const diagram = {
    nodes: [
      {
        id: "tbl-users",
        type: "tableNode",
        position: { x: 0, y: 0 },
        data: {
          tableName: "users",
          columns: [{ id: "users-id", name: "id", type: "BigAutoField", isPrimary: true, notNull: true }]
        }
      },
      {
        id: "tbl-posts",
        type: "tableNode",
        position: { x: 0, y: 0 },
        data: {
          tableName: "posts",
          columns: [
            { id: "posts-id", name: "id", type: "BigAutoField", isPrimary: true, notNull: true },
            { id: "posts-user-id", name: "user_id", type: "ForeignKey", notNull: true }
          ]
        }
      }
    ],
    edges: [
      {
        id: "rel-users-posts",
        source: "tbl-users",
        target: "tbl-posts",
        sourceHandle: "users-id",
        targetHandle: "posts-user-id",
        data: { relationship: "1:n", onUpdate: "CASCADE", onDelete: "SET NULL" }
      }
    ],
    databaseConfig: { enums: [] }
  };

  const { sql, errors } = generatePostgresSql(diagram);
  assert.deepEqual(errors, []);
  assert.match(
    sql,
    /ALTER TABLE "posts" ADD CONSTRAINT "fk_posts_user_id__users_id" FOREIGN KEY \("user_id"\) REFERENCES "users" \("id"\) ON UPDATE CASCADE ON DELETE SET NULL;/
  );
});

test("gera join table para relacionamento n:n", () => {
  const diagram = {
    nodes: [
      {
        id: "tbl-users",
        type: "tableNode",
        position: { x: 0, y: 0 },
        data: { tableName: "users", columns: [{ id: "users-id", name: "id", type: "BigAutoField", isPrimary: true }] }
      },
      {
        id: "tbl-roles",
        type: "tableNode",
        position: { x: 0, y: 0 },
        data: { tableName: "roles", columns: [{ id: "roles-id", name: "id", type: "BigAutoField", isPrimary: true }] }
      }
    ],
    edges: [{ id: "rel", source: "tbl-users", target: "tbl-roles", data: { relationship: "n:n" } }],
    databaseConfig: { enums: [] }
  };

  const { sql, errors } = generatePostgresSql(diagram);
  assert.deepEqual(errors, []);

  assert.match(sql, /CREATE TABLE "roles_users" \(/);
  assert.match(sql, /"users_id" bigautofield NOT NULL/);
  assert.match(sql, /"roles_id" bigautofield NOT NULL/);
  assert.match(sql, /PRIMARY KEY \("users_id", "roles_id"\)/);
  assert.match(sql, /ALTER TABLE "roles_users" ADD CONSTRAINT "fk_roles_users_users_id__users_id"/);
  assert.match(sql, /ALTER TABLE "roles_users" ADD CONSTRAINT "fk_roles_users_roles_id__roles_id"/);
});
