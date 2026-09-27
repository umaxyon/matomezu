// データ形式の型。仕様の要点は prototype/box-graph-HANDOFF.md を参照。

export type Size = "L" | "M" | "S";
export type ChildView = "nest" | "tree" | "hidden";
export type Overflow = "wrap" | "grow" | "clip";

export interface World {
  width?: number;
  height?: number;
  overflow?: Exclude<Overflow, "grow">;
}

export interface Node {
  id: number;
  caption: string;
  parent?: number;
  x?: number;
  y?: number;
  color?: string;
  size?: Size;
  childView?: ChildView;
  fill?: boolean;
  border?: boolean;
  overflow?: Overflow;
  [key: string]: unknown; // 未知の項目は保存時にそのまま残す
}

export interface Edge {
  id: string;
  from: number;
  to: number;
  [key: string]: unknown;
}

export interface Diagram {
  world?: World;
  nodes: Node[];
  edges?: Edge[];
  [key: string]: unknown;
}
