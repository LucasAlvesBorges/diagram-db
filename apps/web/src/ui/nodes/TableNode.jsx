import React, { useMemo, useState } from "react";
import { Handle, Position } from "reactflow";

import { DJANGO_FIELD_TYPES } from "@diagram-db/shared/postgres";
import { useDiagramStore } from "../../store/diagramStore.js";
import { TABLE_COLORS, DEFAULT_TABLE_COLOR } from "../tableColors.js";

function IconTrash() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h12" />
      <path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1" />
      <path d="M13 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V4" />
      <line x1="6.5" y1="7" x2="6.5" y2="12" />
      <line x1="9.5" y1="7" x2="9.5" y2="12" />
    </svg>
  );
}

function ConfirmDeleteModal({ tableName, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <p className="modal-text">
          Tem certeza que deseja deletar a tabela <strong>{tableName}</strong>?
        </p>
        <div className="modal-actions">
          <button type="button" className="modal-btn cancel" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="modal-btn confirm" onClick={onConfirm}>
            Deletar
          </button>
        </div>
      </div>
    </div>
  );
}

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

export function TableNode({ id, data }) {
  const updateTableName = useDiagramStore((s) => s.updateTableName);
  const updateTableColor = useDiagramStore((s) => s.updateTableColor);
  const updateColumn = useDiagramStore((s) => s.updateColumn);
  const addColumn = useDiagramStore((s) => s.addColumn);
  const removeColumn = useDiagramStore((s) => s.removeColumn);
  const removeTable = useDiagramStore((s) => s.removeTable);
  const databaseConfig = useDiagramStore((s) => s.databaseConfig);

  const [showColors, setShowColors] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const name = asString(data?.tableName ?? data?.name ?? "table");
  const columns = Array.isArray(data?.columns) ? data.columns : [];
  const headerColor = data?.headerColor ?? DEFAULT_TABLE_COLOR;

  const typeOptions = useMemo(() => {
    const set = new Set();
    for (const t of DJANGO_FIELD_TYPES) set.add(t);
    for (const t of getEnumNames(databaseConfig)) set.add(t);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [databaseConfig]);

  const typeOptionsId = `type-options-${id}`;

  return (
    <div className="node">
      <div className="node-accent-line" style={{ background: headerColor }} />

      <datalist id={typeOptionsId}>
        {typeOptions.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <div className="node-header">
        <div className="node-header-tint" style={{ background: headerColor }} />
        <div className="node-drag-handle" title="Arrastar">
          &#8942;&#8942;
        </div>
        <input
          className="nodrag node-title-input"
          value={name}
          placeholder="table"
          spellCheck={false}
          onChange={(e) => updateTableName(id, e.target.value)}
        />
        <button
          type="button"
          className="nodrag node-color-btn"
          title="Cor do header"
          style={{ background: headerColor }}
          onClick={() => setShowColors(!showColors)}
        />
        <button
          type="button"
          className="nodrag node-delete-btn"
          title="Excluir tabela"
          onClick={() => setShowDeleteConfirm(true)}
        >
          <IconTrash />
        </button>
      </div>

      {showColors && (
        <div className="nodrag node-color-picker">
          {TABLE_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`nodrag node-color-swatch${headerColor === c.value ? " active" : ""}`}
              title={c.name}
              style={{ background: c.value }}
              onClick={() => {
                updateTableColor(id, c.value);
                setShowColors(false);
              }}
            />
          ))}
        </div>
      )}

      <div className="node-body">
        {columns.map((col) => {
          const handleId = col.id ?? col.name;
          return (
            <div key={handleId} className="col">
              <Handle
                type="target"
                position={Position.Left}
                id={handleId}
              />
              <input
                className="nodrag col-input col-name-input"
                value={asString(col?.name)}
                placeholder="column"
                spellCheck={false}
                onChange={(e) => updateColumn(id, col?.id ?? col?.name, { name: e.target.value })}
              />
              <input
                className="nodrag col-input col-type-input"
                value={asString(col?.type)}
                placeholder="type"
                spellCheck={false}
                list={typeOptionsId}
                onChange={(e) => updateColumn(id, col?.id ?? col?.name, { type: e.target.value })}
              />
              <button
                type="button"
                className="nodrag col-remove"
                title="Remover coluna"
                onClick={() => removeColumn(id, col?.id ?? col?.name)}
              >
                &#215;
              </button>
              <Handle
                type="source"
                position={Position.Right}
                id={handleId}
              />
            </div>
          );
        })}

        <button type="button" className="nodrag node-add-column" onClick={() => addColumn(id)}>
          + Coluna
        </button>
      </div>

      {showDeleteConfirm && (
        <ConfirmDeleteModal
          tableName={name}
          onConfirm={() => removeTable(id)}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
