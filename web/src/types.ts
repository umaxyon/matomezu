// データ形式の型。仕様は graph.ts 冒頭のコメントを参照。

export type Size = "L" | "M" | "S";
export type ChildView = "nest" | "tree" | "hidden";
export type Overflow = "wrap" | "grow" | "clip";
export type Id = number | string;

export interface WorldData {
  width?: number;
  height?: number;
  overflow?: Exclude<Overflow, "grow">;
  [key: string]: unknown;
}

export interface BoxData {
  id?: Id; // 省くと読み込み時に連番を振る
  caption?: string;
  parent?: Id;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
  size?: Size;
  childView?: ChildView;
  fill?: boolean;
  border?: boolean;
  overflow?: Overflow;
  [key: string]: unknown; // 未知の項目は保存時にそのまま残す
}

export interface EdgeData {
  id?: Id;
  from: Id;
  to: Id;
  [key: string]: unknown;
}

export interface Diagram {
  world?: WorldData;
  nodes: BoxData[];
  edges?: (EdgeData | [Id, Id])[]; // [from, to] の形でも読める
  [key: string]: unknown;
}

// ---- 画面（サイドバー）向けの情報 ----

export interface Brief {
  id: string;
  caption: string;
}

export interface WorldInfo {
  kind: "world";
  id: null;
  caption: string;
  x: number;
  y: number;
  w: number;
  h: number;
  children: Brief[];
  links: [];
  overflow: Overflow;
  overflows: Overflow[];
}

export interface BoxInfo {
  kind: "group" | "box";
  id: string;
  caption: string;
  color: string;
  fill: boolean;
  border: boolean;
  size: Size;
  childView: ChildView;
  parent: Brief | null;
  x: number;
  y: number;
  w: number;
  h: number;
  children: Brief[];
  links: (Brief & { edgeId: string })[];
  overflow: Overflow;
  overflows: Overflow[]; // 空なら中身の扱いを選べない
}

export type Info = WorldInfo | BoxInfo;

// update() で変えられる項目。caption と color は空にすると既定に戻る
export interface Patch {
  caption?: string | null;
  color?: string | null;
  size?: Size;
  childView?: ChildView;
  fill?: boolean;
  border?: boolean;
  overflow?: Overflow;
}
