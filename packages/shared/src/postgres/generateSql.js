import { DJANGO_FIELD_TYPES } from "./postgresTypes.js";
import {
  isNonEmptyString,
  normalizeRelationship,
  quoteIdent,
  quoteIdentPath,
  quoteLiteral,
  truncateIdent
} from "./utils.js";

function isAnnotationNode(node) {
  return node?.type === "annotationNode";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getTableName(node) {
  const name = node?.data?.tableName ?? node?.data?.name;
  return isNonEmptyString(name) ? name.trim() : null;
}

function getNodeColumns(node) {
  return asArray(node?.data?.columns);
}

function getNodeIndices(node) {
  return asArray(node?.data?.indices);
}

function findColumn(columns, handleOrName) {
  if (!isNonEmptyString(handleOrName)) return null;
  const handle = handleOrName.trim();
  return columns.find((c) => c?.id === handle) ?? columns.find((c) => c?.name === handle) ?? null;
}

function collectEnumNames(enums) {
  const set = new Set();
  for (const e of enums) {
    if (!isNonEmptyString(e?.name)) continue;
    const name = e.name.trim();
    set.add(name);
    set.add(name.toLowerCase());
  }
  return set;
}

function formatColumnType(column, { enumNamesSet }) {
  const baseTypeRaw = column?.type;
  if (!isNonEmptyString(baseTypeRaw)) return { sql: "text", warnings: ["Column sem type; usando text"] };

  const baseType = baseTypeRaw.trim();

  const warnings = [];
  const lower = baseType.toLowerCase();
  const isKnownDjango = DJANGO_FIELD_TYPES.map(t => t.toLowerCase()).includes(lower);
  const isEnum = enumNamesSet.has(baseType) || enumNamesSet.has(lower) || column?.isEnum === true;
  const isCustom = !isKnownDjango && !isEnum;

  if (isCustom) warnings.push(`Type desconhecido: ${baseType}`);

  const length = column?.length;
  const precision = column?.precision;

  if (isEnum) {
    return { sql: quoteIdentPath(baseType), warnings };
  }

  const charLikeFields = ["charfield", "slugfield", "emailfield", "urlfield", "filepathfield"];
  if (charLikeFields.includes(lower) && Number.isFinite(length)) {
    return { sql: `${baseType}(max_length=${Number(length)})`, warnings };
  }

  if (lower === "decimalfield" && isNonEmptyString(precision)) {
    const parts = precision.trim().split(",").map(p => p.trim());
    const maxDigits = parts[0] ?? "10";
    const decimalPlaces = parts[1] ?? "2";
    return { sql: `${baseType}(max_digits=${maxDigits}, decimal_places=${decimalPlaces})`, warnings };
  }

  if (isKnownDjango) return { sql: lower, warnings };

  // Custom/user-defined type
  return { sql: quoteIdentPath(baseType), warnings };
}

function formatColumnDefinition(column, ctx) {
  const pieces = [];
  pieces.push(quoteIdent(column.name));

  const { sql: typeSql, warnings } = formatColumnType(column, ctx);
  pieces.push(typeSql);

  if (column?.notNull === true || column?.notNull === "true") pieces.push("NOT NULL");
  if (isNonEmptyString(column?.default)) pieces.push(`DEFAULT ${column.default.trim()}`);
  if (column?.isUnique === true && column?.isPrimary !== true) pieces.push("UNIQUE");

  return { sql: pieces.join(" "), warnings };
}

function inferFkName({ targetTableName, targetColumnName, sourceTableName, sourceColumnName }) {
  const base = `fk_${targetTableName}_${targetColumnName}__${sourceTableName}_${sourceColumnName}`;
  return truncateIdent(base);
}

function inferJoinTableName(sourceTableName, targetTableName) {
  const [a, b] = [sourceTableName, targetTableName].map((s) => s.toLowerCase());
  const sorted = a <= b ? [sourceTableName, targetTableName] : [targetTableName, sourceTableName];
  return truncateIdent(`${sorted[0]}_${sorted[1]}`);
}

function getDatabaseConfig(diagram) {
  return diagram?.databaseConfig ?? diagram?.data?.databaseConfig ?? {};
}

function getEnums(diagram) {
  const cfg = getDatabaseConfig(diagram);
  return asArray(cfg?.enums);
}

function topologicalTables(nodes) {
  const tables = [];
  for (const node of nodes) {
    if (!node || isAnnotationNode(node)) continue;
    const name = getTableName(node);
    if (!name) continue;

    tables.push({
      id: node.id,
      name,
      node
    });
  }
  return tables;
}

function collectTables(tables) {
  const byId = new Map();
  const byNameLower = new Map();
  const errors = [];

  for (const t of tables) {
    if (!isNonEmptyString(t?.id)) {
      errors.push("Table node sem id");
      continue;
    }
    const name = t.name;
    const key = name.toLowerCase();
    if (byNameLower.has(key)) {
      errors.push(`Nome de tabela duplicado: ${name}`);
      continue;
    }
    byId.set(t.id, t);
    byNameLower.set(key, t);
  }

  return { byId, byNameLower, errors };
}

function createEnumStatements(enums) {
  const statements = [];
  const errors = [];

  for (const e of enums) {
    const name = isNonEmptyString(e?.name) ? e.name.trim() : null;
    const values = asArray(e?.values).filter(isNonEmptyString).map((v) => v.trim());
    if (!name) {
      errors.push("Enum sem name");
      continue;
    }
    if (values.length === 0) {
      errors.push(`Enum ${name} sem values`);
      continue;
    }

    const valuesSql = values.map(quoteLiteral).join(", ");
    statements.push(
      `DO $$ BEGIN\n  CREATE TYPE ${quoteIdent(name)} AS ENUM (${valuesSql});\nEXCEPTION\n  WHEN duplicate_object THEN null;\nEND $$;`
    );
  }

  return { statements, errors };
}

function createTableStatements({ tables, enumNamesSet }) {
  const statements = [];
  const errors = [];
  const warnings = [];
  const tableInfoById = new Map();

  for (const t of tables) {
    const columns = getNodeColumns(t.node);
    const indices = getNodeIndices(t.node);

    const colErrors = [];
    const colWarnings = [];
    const columnNameLowerSet = new Set();
    const formattedColumns = [];
    const pkColumns = [];

    for (const col of columns) {
      if (!isNonEmptyString(col?.name)) {
        colErrors.push(`Tabela ${t.name}: coluna sem name`);
        continue;
      }
      const colName = col.name.trim();
      const colKey = colName.toLowerCase();
      if (columnNameLowerSet.has(colKey)) {
        colErrors.push(`Tabela ${t.name}: coluna duplicada ${colName}`);
        continue;
      }
      columnNameLowerSet.add(colKey);

      if (col?.isPrimary === true || col?.isPK === true) pkColumns.push(colName);

      const { sql, warnings: w } = formatColumnDefinition({ ...col, name: colName }, { enumNamesSet });
      formattedColumns.push(sql);
      colWarnings.push(...w.map((msg) => `Tabela ${t.name}.${colName}: ${msg}`));
    }

    if (formattedColumns.length === 0) {
      colErrors.push(`Tabela ${t.name}: sem colunas`);
    }

    errors.push(...colErrors);
    warnings.push(...colWarnings);

    const tableLines = formattedColumns.map((s) => `  ${s}`);
    if (pkColumns.length > 0) {
      const pkName = truncateIdent(`${t.name}_pkey`);
      tableLines.push(`  CONSTRAINT ${quoteIdent(pkName)} PRIMARY KEY (${pkColumns.map(quoteIdent).join(", ")})`);
    }

    const createTableSql = `CREATE TABLE ${quoteIdent(t.name)} (\n${tableLines.join(",\n")}\n);`;
    statements.push(createTableSql);

    tableInfoById.set(t.id, {
      id: t.id,
      name: t.name,
      columns,
      indices,
      pkColumns
    });
  }

  return { statements, tableInfoById, errors, warnings };
}

function createIndexStatements({ tableInfoById }) {
  const statements = [];
  const errors = [];

  for (const t of tableInfoById.values()) {
    for (const idx of asArray(t.indices)) {
      const name = isNonEmptyString(idx?.name) ? idx.name.trim() : null;
      const cols = asArray(idx?.columns).filter(isNonEmptyString).map((c) => c.trim());
      if (!name) {
        errors.push(`Tabela ${t.name}: índice sem name`);
        continue;
      }
      if (cols.length === 0) {
        errors.push(`Tabela ${t.name}: índice ${name} sem columns`);
        continue;
      }
      const unique = idx?.unique === true ? "UNIQUE " : "";
      statements.push(
        `CREATE ${unique}INDEX ${quoteIdent(truncateIdent(name))} ON ${quoteIdent(t.name)} (${cols.map(quoteIdent).join(", ")});`
      );
    }
  }

  return { statements, errors };
}

function createFkStatements({ edges, tableInfoById }) {
  const statements = [];
  const errors = [];

  const joinTables = [];

  for (const edge of edges) {
    const source = tableInfoById.get(edge?.source);
    const target = tableInfoById.get(edge?.target);

    if (!source || !target) continue;

    const relationship = normalizeRelationship(edge?.data?.relationship) ?? "1:n";
    const onUpdate = isNonEmptyString(edge?.data?.onUpdate) ? edge.data.onUpdate.trim().toUpperCase() : null;
    const onDelete = isNonEmptyString(edge?.data?.onDelete) ? edge.data.onDelete.trim().toUpperCase() : null;

    if (relationship === "n:n") {
      const joinTableName = isNonEmptyString(edge?.data?.joinTableName)
        ? edge.data.joinTableName.trim()
        : inferJoinTableName(source.name, target.name);

      joinTables.push({ edge, joinTableName, source, target, onUpdate, onDelete });
      continue;
    }

    const sourceCol = findColumn(source.columns, edge?.sourceHandle) ?? null;
    const targetCol = findColumn(target.columns, edge?.targetHandle) ?? null;

    if (!sourceCol || !isNonEmptyString(sourceCol?.name)) {
      errors.push(`Edge ${edge?.id ?? "(sem id)"}: sourceHandle inválido em ${source.name}`);
      continue;
    }
    if (!targetCol || !isNonEmptyString(targetCol?.name)) {
      errors.push(`Edge ${edge?.id ?? "(sem id)"}: targetHandle inválido em ${target.name}`);
      continue;
    }

    const fkName = isNonEmptyString(edge?.data?.constraintName)
      ? edge.data.constraintName.trim()
      : inferFkName({
          targetTableName: target.name,
          targetColumnName: targetCol.name,
          sourceTableName: source.name,
          sourceColumnName: sourceCol.name
        });

    const actions = [
      onUpdate ? `ON UPDATE ${onUpdate}` : null,
      onDelete ? `ON DELETE ${onDelete}` : null
    ]
      .filter(Boolean)
      .join(" ");

    statements.push(
      `ALTER TABLE ${quoteIdent(target.name)} ADD CONSTRAINT ${quoteIdent(truncateIdent(fkName))} FOREIGN KEY (${quoteIdent(
        targetCol.name
      )}) REFERENCES ${quoteIdent(source.name)} (${quoteIdent(sourceCol.name)})${actions ? ` ${actions}` : ""};`
    );
  }

  return { statements, joinTables, errors };
}

function createJoinTableStatements({ joinTables, enumNamesSet }) {
  const statements = [];
  const errors = [];

  for (const jt of joinTables) {
    const joinCols = [];
    const pkCols = [];

    if (jt.source.pkColumns.length === 0 || jt.target.pkColumns.length === 0) {
      errors.push(`Join table ${jt.joinTableName}: source/target sem PK definido`);
      continue;
    }

    function addSide(side, prefix) {
      for (const pkName of side.pkColumns) {
        const col = side.columns.find((c) => c?.name === pkName) ?? null;
        const colType = col ? formatColumnType(col, { enumNamesSet }).sql : "uuid";
        const joinColName = `${prefix}_${pkName}`;
        joinCols.push(`  ${quoteIdent(joinColName)} ${colType} NOT NULL`);
        pkCols.push(joinColName);
      }
    }

    addSide(jt.source, jt.source.name);
    addSide(jt.target, jt.target.name);

    const pkName = truncateIdent(`${jt.joinTableName}_pkey`);
    joinCols.push(`  CONSTRAINT ${quoteIdent(pkName)} PRIMARY KEY (${pkCols.map(quoteIdent).join(", ")})`);

    statements.push(`CREATE TABLE ${quoteIdent(jt.joinTableName)} (\n${joinCols.join(",\n")}\n);`);

    // FK constraints
    for (const pkName of jt.source.pkColumns) {
      const joinColName = `${jt.source.name}_${pkName}`;
      const fkName = inferFkName({
        targetTableName: jt.joinTableName,
        targetColumnName: joinColName,
        sourceTableName: jt.source.name,
        sourceColumnName: pkName
      });
      const actions = [
        jt.onUpdate ? `ON UPDATE ${jt.onUpdate}` : null,
        jt.onDelete ? `ON DELETE ${jt.onDelete}` : null
      ]
        .filter(Boolean)
        .join(" ");
      statements.push(
        `ALTER TABLE ${quoteIdent(jt.joinTableName)} ADD CONSTRAINT ${quoteIdent(
          truncateIdent(fkName)
        )} FOREIGN KEY (${quoteIdent(joinColName)}) REFERENCES ${quoteIdent(jt.source.name)} (${quoteIdent(pkName)})${
          actions ? ` ${actions}` : ""
        };`
      );
    }

    for (const pkName of jt.target.pkColumns) {
      const joinColName = `${jt.target.name}_${pkName}`;
      const fkName = inferFkName({
        targetTableName: jt.joinTableName,
        targetColumnName: joinColName,
        sourceTableName: jt.target.name,
        sourceColumnName: pkName
      });
      const actions = [
        jt.onUpdate ? `ON UPDATE ${jt.onUpdate}` : null,
        jt.onDelete ? `ON DELETE ${jt.onDelete}` : null
      ]
        .filter(Boolean)
        .join(" ");
      statements.push(
        `ALTER TABLE ${quoteIdent(jt.joinTableName)} ADD CONSTRAINT ${quoteIdent(
          truncateIdent(fkName)
        )} FOREIGN KEY (${quoteIdent(joinColName)}) REFERENCES ${quoteIdent(jt.target.name)} (${quoteIdent(pkName)})${
          actions ? ` ${actions}` : ""
        };`
      );
    }
  }

  return { statements, errors };
}

export function generatePostgresSql(diagram) {
  const nodes = asArray(diagram?.nodes);
  const edges = asArray(diagram?.edges);

  const enums = getEnums(diagram);
  const enumNamesSet = collectEnumNames(enums);

  const tables = topologicalTables(nodes);
  const { errors: tableErrors, byId } = collectTables(tables);

  const { statements: enumStatements, errors: enumErrors } = createEnumStatements(enums);
  const { statements: tableStatements, tableInfoById, errors: ddlErrors, warnings: ddlWarnings } = createTableStatements({
    tables: tables.filter((t) => byId.has(t.id)),
    enumNamesSet
  });
  const { statements: indexStatements, errors: indexErrors } = createIndexStatements({ tableInfoById });
  const { statements: fkStatements, joinTables, errors: fkErrors } = createFkStatements({ edges, tableInfoById });
  const { statements: joinTableStatements, errors: joinErrors } = createJoinTableStatements({ joinTables, enumNamesSet });

  const errors = [...tableErrors, ...enumErrors, ...ddlErrors, ...indexErrors, ...fkErrors, ...joinErrors];
  const warnings = [...ddlWarnings];

  const sql = [
    "-- Generated by diagram-db",
    enumStatements.length ? enumStatements.join("\n\n") : null,
    tableStatements.length ? tableStatements.join("\n\n") : null,
    joinTableStatements.length ? joinTableStatements.join("\n\n") : null,
    indexStatements.length ? indexStatements.join("\n") : null,
    fkStatements.length ? fkStatements.join("\n") : null
  ]
    .filter(Boolean)
    .join("\n\n")
    .trimEnd()
    .concat("\n");

  return { sql, errors, warnings };
}
