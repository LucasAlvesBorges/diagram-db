import fs from "node:fs/promises";

import { generatePostgresSql } from "./generateSql.js";

const filename = process.argv[2];
if (!filename) {
  // eslint-disable-next-line no-console
  console.error("Uso: node packages/shared/src/postgres/cli-generate-sql.js caminho/do/diagrama.json");
  process.exitCode = 1;
} else {
  const raw = await fs.readFile(filename, "utf8");
  const diagram = JSON.parse(raw);
  const { sql, errors, warnings } = generatePostgresSql(diagram);

  if (warnings.length) {
    // eslint-disable-next-line no-console
    console.error(warnings.map((w) => `WARN: ${w}`).join("\n"));
  }
  if (errors.length) {
    // eslint-disable-next-line no-console
    console.error(errors.map((e) => `ERR: ${e}`).join("\n"));
    process.exitCode = 2;
  }

  // eslint-disable-next-line no-console
  console.log(sql);
}

