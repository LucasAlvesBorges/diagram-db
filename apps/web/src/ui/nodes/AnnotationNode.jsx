import React from "react";

export function AnnotationNode({ data }) {
  return <div className="note">{data?.content ?? "Nota"}</div>;
}

