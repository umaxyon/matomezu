// 形の表（docs/LAYOUT-BASE-plan.md の 3.1）。形ごとの決まりは、ここに 1 行。DOM に依らない。
// 大きさ・線の輪郭・描き方の判定は、この表から引く（形の名前を直接比べる判定を、ほかのファイルに散らさない。test/rules.test.ts が見張る）。
// 決まりの中身（土台の決め方・描き方）は、名前で引いた先に書く: 土台は layout/node-kinds.ts の BASES、描き方は render.ts の DRAWS。
// クラスの行の操作（属性・操作の編集、行に線をつなぐ）は形の決まりではなく、classbox.ts と編集の画面の側
//
// 形の種類（2026-10-12 ユーザー）:
//   normal  … 四角っぽい形。土台の決め方は共通（文字とサイズ L/M/S）。斜めの辺や丸い端は、描くときのはみ出し
//   special … 土台を自分で決める形（文字を中に収めるため、または絵を持つため）
import type { Shape } from "./types";

// 土台（配置に使う大きさのもと）の決め方
export type Base = "box" | "diamond" | "circle" | "class" | "icon";
// 描き方
export type Draw = "box" | "class" | "diamond" | "outline" | "person" | "db" | "server";

export interface ShapeDef {
  kind: "normal" | "special";
  base: Base;
  draw: Draw;
  vertexOnly: boolean;  // 線の端を辺の真ん中（頂点）に限る（辺の途中は形の外になる）
  insetEnds: boolean;   // 線がつながる範囲を、斜めの辺の食い込みの半分だけ左右に縮める（左右の辺の真ん中が本体の縁より内側）
  slanted: boolean;     // 斜めの辺を持つ（左右の余白に食い込みを足す）
  body: boolean;        // 本文を持てる
  overflow: boolean;    // 中身の扱い（切り詰める）を選べる
  kids: boolean;        // 子を持てる（内包・リストなどで子を並べる）
  terminal: boolean;    // 流れの端（開始・終了）を表す形（フローチャートの整列で、本筋の始まりにする）
  branch: boolean;      // 分岐を表す形（出る線を別々の頂点から出す・キャプションの候補 Yes / No。フローチャートの戦略が使う）
  borderToggle: boolean; // 枠線の有無を選べる（ボックスだけ）
  fillToggle: boolean;   // 塗りの有無を選べる（スティックマンは線だけの絵なので選べない）
}

const NORMAL = {
  kind: "normal", base: "box", draw: "box", vertexOnly: false, insetEnds: false, slanted: false,
  body: false, overflow: true, kids: true, terminal: false, branch: false, borderToggle: false, fillToggle: true,
} as const;
const OUTLINE = { ...NORMAL, draw: "outline", vertexOnly: true } as const;
const SLANT = { ...OUTLINE, slanted: true } as const;
const ICON = {
  ...NORMAL, kind: "special", base: "icon", vertexOnly: false, overflow: false,
} as const;

export const SHAPE_DEFS: Record<Shape, ShapeDef> = {
  box:              { ...NORMAL, body: true, borderToggle: true },
  stadium:          { ...OUTLINE, terminal: true },
  hexagon:          { ...SLANT },
  parallelogram:    { ...SLANT, insetEnds: true },
  parallelogramAlt: { ...SLANT, insetEnds: true },
  trapezoid:        { ...SLANT, insetEnds: true },
  trapezoidAlt:     { ...SLANT, insetEnds: true },
  diamond:          { ...NORMAL, kind: "special", base: "diamond", draw: "diamond", vertexOnly: true, branch: true },
  circle:           { ...NORMAL, kind: "special", base: "circle", draw: "outline", vertexOnly: true, terminal: true },
  person:           { ...ICON, draw: "person", fillToggle: false },
  db:               { ...ICON, draw: "db" },
  server:           { ...ICON, draw: "server" },
  class:            { ...NORMAL, kind: "special", base: "class", draw: "class", overflow: false, kids: false },
};

export const shapeDef = (s: Shape): ShapeDef => SHAPE_DEFS[s];
// 形の既定（書いていなければボックス）
export const DEFAULT_SHAPE: Shape = "box";
