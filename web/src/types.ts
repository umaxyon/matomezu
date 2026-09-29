// データ形式の型。仕様は graph.ts 冒頭のコメントを参照。

export type Size = "L" | "M" | "S";
export type ChildView = "nest" | "tree" | "hidden";
export type Overflow = "wrap" | "grow" | "clip";
export type Shape = "box" | "person" | "db";
export type TreeDirection = "down" | "up" | "left" | "right";
export type Id = number | string;

export interface WorldData {
  width?: number;
  height?: number;
  overflow?: Exclude<Overflow, "grow">;
  background?: string; // 背景色。省略すると背景なし
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
  shape?: Shape;
  childView?: ChildView;
  treeDirection?: TreeDirection; // ツリーで子を置く向き（既定は down）
  fill?: boolean;
  border?: boolean;
  overflow?: Overflow;
  page?: boolean;        // 中身を別のページにする（docs/TABS-plan.md）。ページは入れ子にしない
  world?: WorldData;     // ページの箱のとき、そのページのワールドの設定
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
  // 人が消したボックス（nodes と同じ形。parent は消す直前の親）。サイドバーの一覧から戻せる
  removed?: BoxData[];
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
  background: string | null;
}

export interface BoxInfo {
  kind: "group" | "box";
  id: string;
  caption: string;
  color: string;
  fill: boolean;
  border: boolean;
  size: Size;
  shape: Shape;
  canShape: boolean; // 形を選べるか（内包しているグループは枠なので選べない）
  sizableChildren: number; // 大きさをそろえられる子の数（内包しているときだけ。2 以上でそろえられる）
  childView: ChildView;
  treeDirection: TreeDirection;
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

// サイドバーの一覧の 1 行。parent は親のキャプション（最上位なら null）
export interface ListItem {
  id: string;
  caption: string;
  color: string;
  parent: string | null;
}

// サイドバーの一覧: 表示中のボックスと、消したボックス（どちらもデータの並び順）
export interface Items {
  live: ListItem[];
  removed: ListItem[];
}

// update() で変えられる項目。caption と color は空にすると既定に戻る。background はワールドだけ（空で背景なし）
export interface Patch {
  background?: string | null;
  caption?: string | null;
  color?: string | null;
  size?: Size;
  shape?: Shape;
  childView?: ChildView;
  treeDirection?: TreeDirection;
  fill?: boolean;
  border?: boolean;
  overflow?: Overflow;
}
