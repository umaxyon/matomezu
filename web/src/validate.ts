// データの検証と正規化。DOM に依存しない。

import type { Diagram, EdgeData, Id, Size } from "./types";

export interface SizeSpec {
  w: number;
  h: number;
  maxW?: number;
  maxH?: number;
  limit?: number; // 表示する最大文字数
  fixed?: boolean;
}

// ボックスの大きさの段階
export const SIZES: Record<Size, SizeSpec> = {
  L: { w: 120, h: 64 },
  M: { w: 120, h: 64, maxW: 180, maxH: 80, limit: 14 },
  S: { w: 96, h: 44, fixed: true, limit: 10 },
};

export const OVERFLOWS = ["wrap", "grow", "clip"] as const;
export const VIEWS = ["nest", "tree", "hidden"] as const;
export const SHAPES = ["box", "person", "db"] as const;

const includes = <T>(list: readonly T[], v: unknown): v is T => list.includes(v as T);
export const isSize = (v: unknown): v is Size => typeof v === "string" && v in SIZES;
export const isOverflow = (v: unknown) => includes(OVERFLOWS, v);
export const isView = (v: unknown) => includes(VIEWS, v);
export const isShape = (v: unknown) => includes(SHAPES, v);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function normalizeEdge(e: EdgeData | [Id, Id]): EdgeData {
  if (Array.isArray(e)) return { from: e[0], to: e[1] };
  return { ...e };
}

export function checkSettings(s: Record<string, unknown>, where: unknown): void {
  if (s.overflow != null && !isOverflow(s.overflow)) {
    throw new Error(`overflow の値が不正です: ${where} (${s.overflow})`);
  }
  if (s.size != null && !isSize(s.size)) {
    throw new Error(`size の値が不正です: ${where} (${s.size})`);
  }
  if (s.shape != null && !isShape(s.shape)) {
    throw new Error(`shape の値が不正です: ${where} (${s.shape})`);
  }
  if (s.childView != null && !isView(s.childView)) {
    throw new Error(`childView の値が不正です: ${where} (${s.childView})`);
  }
}

// id の無いボックスに連番を振る（既存の数値 id の続きから）
export function assignIds(data: unknown): void {
  if (!isObject(data) || !Array.isArray(data.nodes)) return;
  const nodes: unknown[] = data.nodes;
  const used = nodes.map(n => Number(isObject(n) ? n.id : NaN)).filter(Number.isInteger);
  let next = Math.max(0, ...used) + 1;
  for (const n of nodes) {
    if (isObject(n) && n.id == null) n.id = next++;
  }
}

export function validate(data: unknown): asserts data is Diagram {
  if (!isObject(data) || !Array.isArray(data.nodes)) throw new Error("nodes 配列がありません");
  if (data.world != null) {
    if (!isObject(data.world)) throw new Error("world がオブジェクトではありません");
    checkSettings(data.world, "world");
    if (data.world.overflow === "grow") throw new Error("world に overflow: grow は使えません");
    if (data.world.background != null && typeof data.world.background !== "string") {
      throw new Error("world の background は色の文字列にしてください");
    }
  }
  const byId = new Map<string, Record<string, unknown>>();
  for (const n of data.nodes as unknown[]) {
    if (!isObject(n) || n.id == null) throw new Error("空のノードがあります");
    if (byId.has(String(n.id))) throw new Error(`id が重複しています: ${n.id}`);
    byId.set(String(n.id), n);
    checkSettings(n, n.id);
  }
  for (const n of byId.values()) {
    if (n.parent == null) continue;
    if (!byId.has(String(n.parent))) throw new Error(`存在しない親です: ${n.id} → ${n.parent}`);
    const seen = new Set([String(n.id)]);
    for (let p: unknown = n.parent; p != null; p = byId.get(String(p))?.parent) {
      if (seen.has(String(p))) throw new Error(`親子関係が循環しています: ${n.id}`);
      seen.add(String(p));
    }
  }
  const parentOf = (id: unknown) => {
    const p = byId.get(String(id))?.parent;
    return p == null ? null : String(p);
  };
  if (data.edges != null && !Array.isArray(data.edges)) throw new Error("edges が配列ではありません");
  const edgeIds = new Set<string>();
  for (const e of (data.edges ?? []) as unknown[]) {
    if (!isObject(e) && !Array.isArray(e)) throw new Error("空の線があります");
    const { id, from, to } = normalizeEdge(e as EdgeData | [Id, Id]);
    if (!byId.has(String(from)) || !byId.has(String(to))) {
      throw new Error(`存在しないノードへの線があります: ${from} - ${to}`);
    }
    if (String(from) === String(to)) throw new Error(`同じボックス同士の線があります: ${from}`);
    if (parentOf(from) !== parentOf(to)) {
      throw new Error(`階層の違うボックス同士の線があります: ${from} - ${to}`);
    }
    if (id != null) {
      if (edgeIds.has(String(id))) throw new Error(`線の id が重複しています: ${id}`);
      edgeIds.add(String(id));
    }
  }
}
