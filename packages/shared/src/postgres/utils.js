export function quoteIdent(identifier) {
  const safe = String(identifier ?? "");
  return `"${safe.replaceAll('"', '""')}"`;
}

export function quoteIdentPath(pathLike) {
  const raw = String(pathLike ?? "").trim();
  if (!raw) return quoteIdent(raw);
  return raw
    .split(".")
    .filter((p) => p.length > 0)
    .map(quoteIdent)
    .join(".");
}

export function quoteLiteral(value) {
  const safe = String(value ?? "");
  return `'${safe.replaceAll("'", "''")}'`;
}

export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeRelationship(value) {
  const raw = String(value ?? "").trim();
  if (raw === "1:n" || raw === "1:N") return "1:n";
  if (raw === "n:n" || raw === "N:N") return "n:n";
  if (raw === "1:1") return "1:1";
  return null;
}

export function shortHash(input) {
  const str = String(input ?? "");
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= BigInt(str.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0").slice(0, 10);
}

export function truncateIdent(identifier, { max = 63 } = {}) {
  const str = String(identifier ?? "");
  if (str.length <= max) return str;
  const hash = shortHash(str);
  return `${str.slice(0, Math.max(0, max - hash.length - 1))}_${hash}`;
}
