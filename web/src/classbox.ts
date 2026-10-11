/*
 * クラス図の形（shape: "class"。D11、docs/CLASS-plan.md）。DOM に依存しない部分: 属性・操作の読み取り、行の文字、
 * 本体の大きさ（ヘッダーと行の高さは決まった値。幅だけ測る）、線の接点の位置。
 * 区画はクラス名・属性・操作の 3 つ。線はクラスそのもの（クラス名の区画の左右の真ん中と、箱の上下の辺の真ん中）か、
 * 属性・操作の行の左右にだけつながる（ひし形の頂点と同じく、決まった所だけ）。
 */

import type { Pt, Rect } from "./geom";

export const ACCESSES = ["public", "private", "protected", "package"] as const;
export type Access = typeof ACCESSES[number];
export const ACCESS_MARK: Record<Access, string> = { public: "+", private: "-", protected: "#", package: "~" };

export interface ClassAttr { name: string; type?: string; access?: Access; static?: boolean }
export interface ClassOp { name: string; params?: string; type?: string; access?: Access; static?: boolean; abstract?: boolean }

// 本体の大きさ（px。graph-style.ts の .mz-shape-class と合わせる）。行は折り返さないので、高さは行の数で決まる
export const CLASS_HEAD = 24;  // クラス名の区画の高さ
export const CLASS_ROW = 16;   // 属性・操作の 1 行の高さ
export const CLASS_PAD = 3;    // 属性・操作の区画の上下の余白
export const CLASS_MIN_W = 120;
export const CLASS_MAX_W = 400;

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const isAccess = (v: unknown): v is Access => ACCESSES.includes(v as Access);

// 属性の並び（name の無い行は読まない。検査で誤りにする）
export function attrsOf(src: Record<string, unknown>): ClassAttr[] {
  return (Array.isArray(src.attrs) ? src.attrs : []).filter(a => isObject(a) && typeof a.name === "string") as ClassAttr[];
}

export function opsOf(src: Record<string, unknown>): ClassOp[] {
  return (Array.isArray(src.ops) ? src.ops : []).filter(o => isObject(o) && typeof o.name === "string") as ClassOp[];
}

// 属性と操作の名前（線がつなぐ先。上から順）
export const memberNames = (src: Record<string, unknown>): string[] => [...attrsOf(src), ...opsOf(src)].map(m => m.name);

const mark = (a: unknown) => (isAccess(a) ? ACCESS_MARK[a] + " " : "");

// 行に出す文字（例 "- id: int"、"+ save(u: User): void"）
export const attrText = (a: ClassAttr): string => `${mark(a.access)}${a.name}${a.type ? ": " + a.type : ""}`;
export const opText = (o: ClassOp): string => `${mark(o.access)}${o.name}(${o.params ?? ""})${o.type ? ": " + o.type : ""}`;

// 区画の高さ（上の仕切りの線 1px と上下の余白を含む）
const sectionH = (rows: number) => 1 + 2 * CLASS_PAD + rows * CLASS_ROW;

// 本体の高さ
export const classHeight = (src: Record<string, unknown>): number =>
  CLASS_HEAD + sectionH(attrsOf(src).length) + sectionH(opsOf(src).length);

// 名前の属性か操作の行の、本体の上からの真ん中の高さ。無ければ null
export function memberY(src: Record<string, unknown>, name: string): number | null {
  const attrs = attrsOf(src), ops = opsOf(src);
  const i = attrs.findIndex(a => a.name === name);
  if (i >= 0) return CLASS_HEAD + 1 + CLASS_PAD + (i + 0.5) * CLASS_ROW;
  const j = ops.findIndex(o => o.name === name);
  if (j >= 0) return CLASS_HEAD + sectionH(attrs.length) + 1 + CLASS_PAD + (j + 0.5) * CLASS_ROW;
  return null;
}

// クラスそのものにつなぐ線の接点 4 つ（本体 r の上でのワールドの座標）: 上下の辺の真ん中、クラス名の区画の左右の真ん中
export function classAnchors(r: Rect): Record<"t" | "r" | "b" | "l", Pt> {
  const cy = r.y + Math.min(CLASS_HEAD, r.h) / 2;
  return { t: [r.x + r.w / 2, r.y], b: [r.x + r.w / 2, r.y + r.h], l: [r.x, cy], r: [r.x + r.w, cy] };
}

const dist2 = (p: Pt, q: Pt) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;

// クラスの線の端の点（ワールドの座標）。r はクラスの本体、other は相手の箱。
// member があれば、その行の左右のうち相手のいる側。無ければ 4 つの接点から相手の向きで選ぶ。
// near（データの exitAt / enterAt が指す点）があれば、それに一番近い接点（行なら近い側）
export function classEnd(r: Rect, src: Record<string, unknown>, member: string | undefined, other: Rect, near: Pt | null): Pt {
  const [ox, oy] = [other.x + other.w / 2, other.y + other.h / 2];
  const y = member == null ? null : memberY(src, member);
  if (y != null) {
    const left: Pt = [r.x, r.y + y], right: Pt = [r.x + r.w, r.y + y];
    if (near) return dist2(near, left) <= dist2(near, right) ? left : right;
    return ox < r.x + r.w / 2 ? left : right;
  }
  const a = classAnchors(r);
  if (near) return (Object.values(a) as Pt[]).reduce((best, p) => (dist2(near, p) < dist2(near, best) ? p : best));
  // 横に並ぶ（上下の範囲が重なる）なら左右、縦に並ぶなら上下。斜めなら、隙間の大きい向き
  const gx = Math.max(other.x - (r.x + r.w), r.x - (other.x + other.w));
  const gy = Math.max(other.y - (r.y + r.h), r.y - (other.y + other.h));
  if (gx >= gy) return ox < r.x + r.w / 2 ? a.l : a.r;
  return oy < r.y + r.h / 2 ? a.t : a.b;
}

// 書く形に整える: 名前の無い行は捨て、既定の項目（空の型・引数、false の static・abstract、無しの access）は書かない
export function cleanMembers<T extends ClassAttr | ClassOp>(list: T[]): T[] {
  return list.filter(m => m.name.trim()).map(m => {
    const out: Record<string, unknown> = { name: m.name.trim() };
    for (const [k, v] of Object.entries(m)) {
      if (k === "name" || v == null || v === false || v === "") continue;
      out[k] = typeof v === "string" ? v.trim() : v;
    }
    return out as T;
  });
}
