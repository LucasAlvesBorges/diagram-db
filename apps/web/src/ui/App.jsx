import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, { addEdge, applyEdgeChanges, applyNodeChanges, Background, Controls, MiniMap } from "reactflow";
import "reactflow/dist/style.css";

import { useDiagramStore } from "../store/diagramStore.js";
import { TableNode } from "./nodes/TableNode.jsx";
import { AnnotationNode } from "./nodes/AnnotationNode.jsx";
import { Inspector } from "./Inspector.jsx";

import { generatePostgresSql } from "@diagram-db/shared/postgres";

/* ── Inline SVG Icons ─────────────────────────── */

function IconTable() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="12" height="12" rx="2" />
      <line x1="2" y1="6" x2="14" y2="6" />
      <line x1="7" y1="6" x2="7" y2="14" />
    </svg>
  );
}

function IconNote() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2h7l4 4v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" />
      <path d="M10 2v4h4" />
    </svg>
  );
}

function IconEnum() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="6" y1="4" x2="14" y2="4" />
      <line x1="6" y1="8" x2="14" y2="8" />
      <line x1="6" y1="12" x2="14" y2="12" />
      <circle cx="3" cy="4" r="1" fill="currentColor" stroke="none" />
      <circle cx="3" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="3" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v8m0 0l-3-3m3 3l3-3" />
      <path d="M3 12v1a1 1 0 001 1h8a1 1 0 001-1v-1" />
    </svg>
  );
}

function IconSave() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 14h10a1 1 0 001-1V5.414a1 1 0 00-.293-.707l-2.414-2.414A1 1 0 0010.586 2H3a1 1 0 00-1 1v10a1 1 0 001 1z" />
      <path d="M5 14v-4h6v4" />
      <path d="M6 2v3h3" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4v8a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1H8L6.5 3H3a1 1 0 00-1 1z" />
    </svg>
  );
}

/* ── Helpers ───────────────────────────────────── */

function download(filename, content) {
  const blob = new Blob([content], { type: "text/sql;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const RELATIONSHIP_OPTIONS = [
  { value: "1:1", label: "1 : 1" },
  { value: "1:n", label: "1 : N" },
  { value: "n:m", label: "N : M" }
];

const CASCADE_OPTIONS = ["CASCADE", "SET NULL", "SET DEFAULT", "RESTRICT", "NO ACTION"];

const defaultEdgeOptions = {
  type: "smoothstep",
  style: { stroke: "rgba(34, 211, 238, 0.25)", strokeWidth: 1.5 }
};

/* ── App ───────────────────────────────────────── */

export function App() {
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const databaseConfig = useDiagramStore((s) => s.databaseConfig);
  const setNodes = useDiagramStore((s) => s.setNodes);
  const setEdges = useDiagramStore((s) => s.setEdges);
  const addTable = useDiagramStore((s) => s.addTable);
  const addAnnotation = useDiagramStore((s) => s.addAnnotation);
  const addEnum = useDiagramStore((s) => s.addEnum);
  const updateTableName = useDiagramStore((s) => s.updateTableName);
  const updateTableColor = useDiagramStore((s) => s.updateTableColor);
  const addColumn = useDiagramStore((s) => s.addColumn);
  const updateColumn = useDiagramStore((s) => s.updateColumn);
  const removeColumn = useDiagramStore((s) => s.removeColumn);
  const updateAnnotationContent = useDiagramStore((s) => s.updateAnnotationContent);
  const updateEdgeData = useDiagramStore((s) => s.updateEdgeData);
  const removeEdge = useDiagramStore((s) => s.removeEdge);
  const loadDiagram = useDiagramStore((s) => s.loadDiagram);

  const nodeTypes = useMemo(() => ({ tableNode: TableNode, annotationNode: AnnotationNode }), []);

  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [sqlPreview, setSqlPreview] = useState("");
  const [showSqlPanel, setShowSqlPanel] = useState(false);
  const [issues, setIssues] = useState({ errors: [], warnings: [] });
  const [showProjects, setShowProjects] = useState(false);
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState(null);

  async function fetchProjects() {
    setLoadingProjects(true);
    try {
      const res = await fetch("/projects");
      if (!res.ok) return;
      const data = await res.json();
      setProjects(Array.isArray(data.projects) ? data.projects : []);
    } catch { /* API offline */ }
    setLoadingProjects(false);
  }

  async function onLoadProject(projectId) {
    try {
      const res = await fetch(`/projects/${projectId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.project?.diagram) {
        loadDiagram(data.project.diagram);
        setCurrentProjectId(projectId);
        setShowProjects(false);
      }
    } catch { /* ignore */ }
  }

  async function onDeleteProject(projectId) {
    try {
      const res = await fetch(`/projects/${projectId}`, { method: "DELETE" });
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== projectId));
        if (currentProjectId === projectId) {
          loadDiagram({ nodes: [], edges: [], databaseConfig: { enums: [] } });
          setCurrentProjectId(null);
        }
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("project");
    if (pid) { setCurrentProjectId(pid); onLoadProject(pid); }
  }, []);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const selectedEdge = useMemo(() => edges.find((e) => e.id === selectedEdgeId) ?? null, [edges, selectedEdgeId]);

  const edgesWithLabels = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        label: e.data?.relationship ?? "",
        labelStyle: { fill: "#8a8a9e", fontSize: 11, fontFamily: "'Outfit', sans-serif", fontWeight: 600 },
        labelBgStyle: { fill: "#111119", fillOpacity: 0.9 },
        labelBgPadding: [6, 3],
        labelBgBorderRadius: 4
      })),
    [edges]
  );

  function buildDiagram() {
    return { nodes, edges, databaseConfig };
  }

  function onExportSql() {
    const result = generatePostgresSql(buildDiagram());
    setSqlPreview(result.sql);
    setIssues({ errors: result.errors, warnings: result.warnings });
    setShowSqlPanel(true);
  }

  async function onSaveToApi() {
    const res = await fetch("/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Untitled", diagram: buildDiagram() })
    });
    if (!res.ok) alert(`Falha ao salvar: ${res.status}`);
    else alert("Salvo!");
  }

  const onEdgeClick = useCallback((_event, edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedEdgeId(null);
  }, []);

  const inspectorOpen = Boolean(selectedNode);

  // Find table names for the selected edge
  let edgeSourceTable = "";
  let edgeTargetTable = "";
  if (selectedEdge) {
    const srcNode = nodes.find((n) => n.id === selectedEdge.source);
    const tgtNode = nodes.find((n) => n.id === selectedEdge.target);
    edgeSourceTable = srcNode?.data?.tableName ?? srcNode?.data?.name ?? "";
    edgeTargetTable = tgtNode?.data?.tableName ?? tgtNode?.data?.name ?? "";
  }

  return (
    <div className="app">
      {/* ── Toolbar ── */}
      <div className="toolbar">
        <div className="toolbar-brand">
          <span className="toolbar-logo">&#9670;</span>
          <span className="toolbar-name">Diagram DB</span>
        </div>

        <div className="toolbar-group">
          <button className="toolbar-btn" onClick={() => { setShowProjects(!showProjects); if (!showProjects) fetchProjects(); }}>
            <IconFolder /> Projetos
          </button>
        </div>

        <div className="toolbar-spacer" />

        <div className="toolbar-group">
          <button className="toolbar-btn" onClick={addTable}>
            <IconTable /> Tabela
          </button>
          <button className="toolbar-btn" onClick={addAnnotation}>
            <IconNote /> Nota
          </button>
          <button className="toolbar-btn" onClick={addEnum}>
            <IconEnum /> Enum
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button className="toolbar-btn primary" onClick={onExportSql}>
            <IconDownload /> Exportar SQL
          </button>
          <button className="toolbar-btn" onClick={onSaveToApi}>
            <IconSave /> Salvar
          </button>
        </div>
      </div>

      {/* ── Workspace ── */}
      <div className={`workspace${inspectorOpen ? " inspector-open" : ""}`}>
        <div className="canvas">
          <ReactFlow
            nodes={nodes}
            edges={edgesWithLabels}
            onNodesChange={(changes) => setNodes(applyNodeChanges(changes, nodes))}
            onEdgesChange={(changes) => setEdges(applyEdgeChanges(changes, edges))}
            onConnect={(params) => {
              setEdges(
                addEdge(
                  { ...params, data: { relationship: "1:n", onUpdate: "CASCADE", onDelete: "CASCADE" } },
                  edges
                )
              );
            }}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onSelectionChange={({ nodes: selection }) => {
              const nodeId = selection?.[0]?.id ?? null;
              setSelectedNodeId(nodeId);
              if (nodeId) setSelectedEdgeId(null);
            }}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            connectionMode="loose"
            zoomOnDoubleClick={false}
            fitView
          >
            <Background color="rgba(255, 255, 255, 0.035)" gap={24} size={1} />
            <Controls />
            <MiniMap
              nodeColor="rgba(34, 211, 238, 0.5)"
              maskColor="rgba(6, 6, 11, 0.75)"
            />
          </ReactFlow>
        </div>

        {/* ── Projects Panel ── */}
        {showProjects && (
          <div className="projects-panel">
            <div className="panel-header">
              <span className="panel-title">Projetos</span>
              <button className="panel-close" onClick={() => setShowProjects(false)}>
                &#215;
              </button>
            </div>
            <div className="panel-body">
              {loadingProjects && <p className="muted">Carregando...</p>}
              {!loadingProjects && projects.length === 0 && (
                <p className="muted">Nenhum projeto salvo. Use o MCP ou o botão Salvar.</p>
              )}
              {projects.map((p) => (
                <div key={p.id} className="project-item">
                  <button
                    type="button"
                    className="project-item-load"
                    onClick={() => onLoadProject(p.id)}
                  >
                    <span className="project-item-name">{p.name}</span>
                    <span className="project-item-date">
                      {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString("pt-BR") : ""}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="project-item-delete"
                    title="Excluir projeto"
                    onClick={() => onDeleteProject(p.id)}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 4h12" />
                      <path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1" />
                      <path d="M13 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V4" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Edge Editor Panel ── */}
        {selectedEdge && (
          <div className="edge-panel" key={selectedEdgeId}>
            <div className="panel-header">
              <span className="panel-title">Relacionamento</span>
              <button className="panel-close" onClick={() => setSelectedEdgeId(null)}>
                &#215;
              </button>
            </div>
            <div className="panel-body">
              <div className="edge-tables">
                <span className="edge-table-name">{edgeSourceTable}</span>
                <span className="edge-arrow">&#8594;</span>
                <span className="edge-table-name">{edgeTargetTable}</span>
              </div>

              <label className="field">
                <span>Tipo</span>
                <div className="edge-type-btns">
                  {RELATIONSHIP_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`edge-type-btn${(selectedEdge.data?.relationship ?? "1:n") === opt.value ? " active" : ""}`}
                      onClick={() => updateEdgeData(selectedEdge.id, { relationship: opt.value })}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </label>

              <label className="field">
                <span>ON DELETE</span>
                <select
                  value={selectedEdge.data?.onDelete ?? "CASCADE"}
                  onChange={(e) => updateEdgeData(selectedEdge.id, { onDelete: e.target.value })}
                >
                  {CASCADE_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>ON UPDATE</span>
                <select
                  value={selectedEdge.data?.onUpdate ?? "CASCADE"}
                  onChange={(e) => updateEdgeData(selectedEdge.id, { onUpdate: e.target.value })}
                >
                  {CASCADE_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className="edge-delete-btn"
                onClick={() => {
                  removeEdge(selectedEdge.id);
                  setSelectedEdgeId(null);
                }}
              >
                Excluir relacionamento
              </button>
            </div>
          </div>
        )}

        {/* ── Inspector Panel ── */}
        {inspectorOpen && (
          <div className="inspector-panel" key={selectedNodeId}>
            <div className="panel-header">
              <span className="panel-title">Propriedades</span>
              <button className="panel-close" onClick={() => setSelectedNodeId(null)}>
                &#215;
              </button>
            </div>
            <div className="panel-body">
              <Inspector
                selectedNode={selectedNode}
                databaseConfig={databaseConfig}
                onUpdateTableName={updateTableName}
                onUpdateTableColor={updateTableColor}
                onAddColumn={addColumn}
                onUpdateColumn={updateColumn}
                onRemoveColumn={removeColumn}
                onUpdateAnnotationContent={updateAnnotationContent}
              />
            </div>
          </div>
        )}

        {/* ── SQL Preview Panel ── */}
        {showSqlPanel && sqlPreview && (
          <div className="sql-panel">
            <div className="panel-header">
              <span className="panel-title">SQL Gerado</span>
              <div className="panel-header-actions">
                {issues.warnings.length > 0 && (
                  <span className="badge warning">{issues.warnings.length} warning{issues.warnings.length > 1 ? "s" : ""}</span>
                )}
                {issues.errors.length > 0 && (
                  <span className="badge error">{issues.errors.length} erro{issues.errors.length > 1 ? "s" : ""}</span>
                )}
                <button className="sql-download-btn" onClick={() => download("schema.sql", sqlPreview)}>
                  <IconDownload /> .sql
                </button>
                <button className="panel-close" onClick={() => setShowSqlPanel(false)}>
                  &#215;
                </button>
              </div>
            </div>
            <pre className="sql-code">{sqlPreview}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
