import React, { useMemo } from "react";

import { DJANGO_FIELD_TYPES } from "@diagram-db/shared/postgres";
import { TABLE_COLORS, DEFAULT_TABLE_COLOR } from "./tableColors.js";

function asString(value) {
  return typeof value === "string" ? value : "";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getEnumNames(databaseConfig) {
  return asArray(databaseConfig?.enums)
    .map((e) => (typeof e?.name === "string" ? e.name.trim() : ""))
    .filter(Boolean);
}

function isCharLike(type) {
  const t = asString(type).toLowerCase();
  return t === "charfield" || t === "slugfield" || t === "emailfield" || t === "urlfield" || t === "filepathfield";
}

function isDecimalLike(type) {
  const t = asString(type).toLowerCase();
  return t === "decimalfield";
}

export function Inspector({
  selectedNode,
  databaseConfig,
  onUpdateTableName,
  onUpdateTableColor,
  onAddColumn,
  onUpdateColumn,
  onRemoveColumn,
  onUpdateAnnotationContent
}) {
  const enumNames = useMemo(() => getEnumNames(databaseConfig), [databaseConfig]);

  const typeOptions = useMemo(() => {
    const set = new Set();
    for (const t of DJANGO_FIELD_TYPES) set.add(t);
    for (const t of enumNames) set.add(t);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [enumNames]);

  if (!selectedNode) return null;

  if (selectedNode.type === "annotationNode") {
    return (
      <div className="inspector">
        <div className="inspector-title">Anotação</div>
        <label className="field">
          <span>Conteúdo</span>
          <textarea
            rows={5}
            value={asString(selectedNode.data?.content)}
            onChange={(e) => onUpdateAnnotationContent(selectedNode.id, e.target.value)}
          />
        </label>
      </div>
    );
  }

  if (selectedNode.type !== "tableNode") {
    return (
      <div className="inspector">
        <div className="inspector-title">Selecionado</div>
        <div className="muted">Tipo não suportado: {selectedNode.type}</div>
      </div>
    );
  }

  const tableName = asString(selectedNode.data?.tableName ?? selectedNode.data?.name);
  const columns = asArray(selectedNode.data?.columns);
  const headerColor = selectedNode.data?.headerColor ?? DEFAULT_TABLE_COLOR;

  return (
    <div className="inspector">
      <div className="inspector-title">Tabela</div>

      <div className="inspector-color-section">
        <span className="inspector-color-label">Cor</span>
        <div className="inspector-color-swatches">
          {TABLE_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`inspector-swatch${headerColor === c.value ? " active" : ""}`}
              title={c.name}
              style={{ background: c.value }}
              onClick={() => onUpdateTableColor(selectedNode.id, c.value)}
            />
          ))}
        </div>
      </div>

      <details className="inspector-details" open>
        <summary>Detalhes</summary>
        <div className="inspector-details-body">
          <datalist id="type-options">
            {typeOptions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>

          <label className="field">
            <span>Nome</span>
            <input value={tableName} onChange={(e) => onUpdateTableName(selectedNode.id, e.target.value)} />
          </label>

          <div className="inspector-row">
            <div className="inspector-subtitle">Colunas</div>
            <button className="small" onClick={() => onAddColumn(selectedNode.id)}>
              + Coluna
            </button>
          </div>

          {columns.length === 0 && <div className="muted">Sem colunas.</div>}

          <div className="columns-editor">
            {columns.map((col) => {
              const colName = asString(col?.name);
              const type = asString(col?.type);
              const length = col?.length ?? "";
              const precision = asString(col?.precision);
              const notNull = Boolean(col?.notNull);
              const isPrimary = Boolean(col?.isPrimary ?? col?.isPK);
              const isUnique = Boolean(col?.isUnique);
              const def = asString(col?.default);

              return (
                <div key={col?.id ?? colName} className="column-card">
                  <div className="column-grid">
                    <label className="field">
                      <span>Nome</span>
                      <input
                        value={colName}
                        onChange={(e) => onUpdateColumn(selectedNode.id, col.id, { name: e.target.value })}
                      />
                    </label>

                    <label className="field">
                      <span>Type</span>
                      <input
                        value={type}
                        list="type-options"
                        onChange={(e) => onUpdateColumn(selectedNode.id, col.id, { type: e.target.value })}
                      />
                    </label>

                    <label className="field">
                      <span>Default</span>
                      <input
                        value={def}
                        onChange={(e) => onUpdateColumn(selectedNode.id, col.id, { default: e.target.value })}
                      />
                    </label>

                    {isCharLike(type) && (
                      <label className="field">
                        <span>max_length</span>
                        <input
                          inputMode="numeric"
                          value={String(length)}
                          onChange={(e) =>
                            onUpdateColumn(selectedNode.id, col.id, {
                              length: e.target.value === "" ? undefined : Number(e.target.value)
                            })
                          }
                        />
                      </label>
                    )}

                    {isDecimalLike(type) && (
                      <label className="field">
                        <span>max_digits, decimal_places</span>
                        <input
                          placeholder="10,2"
                          value={precision}
                          onChange={(e) => onUpdateColumn(selectedNode.id, col.id, { precision: e.target.value })}
                        />
                      </label>
                    )}
                  </div>

                  <div className="flags">
                    <label>
                      <input
                        type="checkbox"
                        checked={isPrimary}
                        onChange={(e) =>
                          onUpdateColumn(selectedNode.id, col.id, {
                            isPrimary: e.target.checked,
                            notNull: e.target.checked ? true : notNull
                          })
                        }
                      />
                      PK
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={notNull}
                        onChange={(e) => onUpdateColumn(selectedNode.id, col.id, { notNull: e.target.checked })}
                      />
                      NOT NULL
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={isUnique}
                        onChange={(e) => onUpdateColumn(selectedNode.id, col.id, { isUnique: e.target.checked })}
                      />
                      UNIQUE
                    </label>

                    <button className="danger small" onClick={() => onRemoveColumn(selectedNode.id, col.id)}>
                      Remover
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </details>
    </div>
  );
}
