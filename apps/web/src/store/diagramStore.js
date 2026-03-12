import { create } from "zustand";

const DEFAULT_DIAGRAM = { nodes: [], edges: [], databaseConfig: { enums: [] } };
const STORAGE_KEY = "diagram-db:lastDiagram";

function persistDiagram({ nodes, edges, databaseConfig }) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(
      {
        nodes: Array.isArray(nodes) ? nodes : [],
        edges: Array.isArray(edges) ? edges : [],
        databaseConfig: databaseConfig ?? { enums: [] }
      },
      null,
      0
    )
  );
}

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function loadInitialDiagram() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? safeParse(raw) : null;
  if (!parsed || typeof parsed !== "object") return DEFAULT_DIAGRAM;
  return {
    nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
    edges: Array.isArray(parsed.edges) ? parsed.edges : [],
    databaseConfig: parsed.databaseConfig ?? { enums: [] }
  };
}

export const useDiagramStore = create((set, get) => ({
  ...loadInitialDiagram(),

  setNodes: (nodes) => {
    set({ nodes });
    persistDiagram({ nodes, edges: get().edges, databaseConfig: get().databaseConfig });
  },

  setEdges: (edges) => {
    set({ edges });
    persistDiagram({ nodes: get().nodes, edges, databaseConfig: get().databaseConfig });
  },

  addTable: () => {
    const id = crypto.randomUUID();
    const tableName = `table_${get().nodes.length + 1}`;
    const colId = crypto.randomUUID();

    const node = {
      id,
      type: "tableNode",
      position: { x: 100 + get().nodes.length * 40, y: 80 + get().nodes.length * 30 },
      data: {
        tableName,
        columns: [
          { id: colId, name: "id", type: "BigAutoField", isPrimary: true, notNull: true, default: "" }
        ],
        indices: []
      }
    };

    const nodes = [...get().nodes, node];
    get().setNodes(nodes);
  },

  updateTableName: (nodeId, tableName) => {
    const nodes = get().nodes.map((n) => {
      if (n.id !== nodeId) return n;
      return { ...n, data: { ...(n.data ?? {}), tableName } };
    });
    get().setNodes(nodes);
  },

  updateTableColor: (nodeId, headerColor) => {
    const nodes = get().nodes.map((n) => {
      if (n.id !== nodeId) return n;
      return { ...n, data: { ...(n.data ?? {}), headerColor } };
    });
    get().setNodes(nodes);
  },

  addColumn: (nodeId) => {
    const nodes = get().nodes.map((n) => {
      if (n.id !== nodeId) return n;
      const data = n.data ?? {};
      const columns = Array.isArray(data.columns) ? data.columns : [];
      const nextColumn = {
        id: crypto.randomUUID(),
        name: `column_${columns.length + 1}`,
        type: "CharField",
        notNull: false,
        isUnique: false,
        isPrimary: false,
        default: ""
      };
      return { ...n, data: { ...data, columns: [...columns, nextColumn] } };
    });
    get().setNodes(nodes);
  },

  updateColumn: (nodeId, columnId, patch) => {
    if (typeof columnId !== "string" || columnId.trim() === "") return;
    const nodes = get().nodes.map((n) => {
      if (n.id !== nodeId) return n;
      const data = n.data ?? {};
      const columns = Array.isArray(data.columns) ? data.columns : [];
      const nextColumns = columns.map((c) => {
        const key = typeof c?.id === "string" && c.id.trim() !== "" ? c.id : c?.name;
        return key === columnId ? { ...c, ...patch } : c;
      });
      return { ...n, data: { ...data, columns: nextColumns } };
    });
    get().setNodes(nodes);
  },

  removeColumn: (nodeId, columnId) => {
    if (typeof columnId !== "string" || columnId.trim() === "") return;
    const nodes = get().nodes.map((n) => {
      if (n.id !== nodeId) return n;
      const data = n.data ?? {};
      const columns = Array.isArray(data.columns) ? data.columns : [];
      const nextColumns = columns.filter((c) => {
        const key = typeof c?.id === "string" && c.id.trim() !== "" ? c.id : c?.name;
        return key !== columnId;
      });
      return { ...n, data: { ...data, columns: nextColumns } };
    });
    get().setNodes(nodes);
  },

  addAnnotation: () => {
    const id = crypto.randomUUID();
    const node = {
      id,
      type: "annotationNode",
      position: { x: 300, y: 40 },
      data: { content: "Nota (ignorada no SQL)" }
    };
    const nodes = [...get().nodes, node];
    get().setNodes(nodes);
  },

  updateAnnotationContent: (nodeId, content) => {
    const nodes = get().nodes.map((n) => {
      if (n.id !== nodeId) return n;
      return { ...n, data: { ...(n.data ?? {}), content } };
    });
    get().setNodes(nodes);
  },

  updateEdgeData: (edgeId, patch) => {
    const edges = get().edges.map((e) => {
      if (e.id !== edgeId) return e;
      return { ...e, data: { ...(e.data ?? {}), ...patch } };
    });
    get().setEdges(edges);
  },

  removeEdge: (edgeId) => {
    const edges = get().edges.filter((e) => e.id !== edgeId);
    get().setEdges(edges);
  },

  addEnum: () => {
    const name = prompt("Nome do enum (ex: user_status):");
    if (!name) return;
    const rawValues = prompt('Valores separados por vírgula (ex: active,inactive,banned):');
    const values = (rawValues ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (!values.length) return;

    const databaseConfig = get().databaseConfig ?? { enums: [] };
    const enums = Array.isArray(databaseConfig.enums) ? databaseConfig.enums : [];
    const next = { ...databaseConfig, enums: [...enums, { name: name.trim(), values }] };

    set({ databaseConfig: next });
    persistDiagram({ nodes: get().nodes, edges: get().edges, databaseConfig: next });
  }
}));
