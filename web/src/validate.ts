// データの検証と正規化。DOM に依存しない。

import { THEMES, isTheme } from "./theme";
import type { Diagram, EdgeData, Id, Size } from "./types";

export interface SizeSpec {
  minW: number;
  maxW: number; // 文字がこれより長ければ折り返す
  h: number; // 高さの最小（fixedH なら固定）
  fixedH?: boolean;
  limit?: number; // 表示する最大文字数
}

// ボックスの大きさの段階。文字のボックスの幅は、文字に合わせて minW〜maxW の間で決まる。
// 見た目の調整で変えてよい値（テストは test/graph.test.ts の「サイズの段階」）
export const SIZES: Record<Size, SizeSpec> = {
  L: { minW: 120, maxW: 400, h: 64 },
  M: { minW: 120, maxW: 240, h: 64 },
  S: { minW: 64, maxW: 96, h: 44, fixedH: true, limit: 10 },
};

// 子を内包するボックスとワールドの最小の大きさ（サイズによらない）
export const GROUP_MIN = { w: 120, h: 64 };

export const OVERFLOWS = ["wrap", "grow", "clip"] as const;
export const VIEWS = ["nest", "tree", "hidden", "list"] as const;
export const SHAPES = ["box", "person", "db", "diamond", "server"] as const;
export const TREE_DIRECTIONS = ["down", "up", "left", "right"] as const;
export const ARROWS = ["start", "end", "both"] as const;
export const DASHES = ["solid", "dashed"] as const;
export const ROUTES = ["straight", "elbow"] as const;
export const AXES = ["horizontal", "vertical"] as const;
export const isRoute = (v: unknown) => includes(ROUTES, v);

const includes = <T>(list: readonly T[], v: unknown): v is T => list.includes(v as T);
export const isSize = (v: unknown): v is Size => typeof v === "string" && v in SIZES;
export const isOverflow = (v: unknown) => includes(OVERFLOWS, v);
export const isView = (v: unknown) => includes(VIEWS, v);
export const isShape = (v: unknown) => includes(SHAPES, v);
export const isTreeDirection = (v: unknown) => includes(TREE_DIRECTIONS, v);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function normalizeEdge(e: EdgeData | [Id, Id]): EdgeData {
  if (Array.isArray(e)) return { from: e[0], to: e[1] };
  return { ...e };
}

// 箱とワールドの設定の値。誤りの文を返す（無ければ空）。
// theme が false なら、知らないテーマの名前は誤りにしない（画面で開くとき。標準として描き、知らせる。名前を変えたり減らしたりしても図が開けるように）
export function settingsProblems(s: Record<string, unknown>, where: unknown, theme = true): string[] {
  const out: string[] = [];
  if (s.overflow != null && !isOverflow(s.overflow)) out.push(`overflow の値が不正です: ${where} (${s.overflow})`);
  if (s.size != null && !isSize(s.size)) out.push(`size の値が不正です: ${where} (${s.size})`);
  if (s.shape != null && !isShape(s.shape)) out.push(`shape の値が不正です: ${where} (${s.shape})`);
  if (s.body != null && typeof s.body !== "string") out.push(`body は文字列にしてください: ${where}`);
  if (s.width != null && !(typeof s.width === "number" && s.width > 0)) out.push(`width は正の数にしてください: ${where} (${s.width})`);
  if (s.bodyWidth != null && !(typeof s.bodyWidth === "number" && s.bodyWidth > 0)) out.push(`bodyWidth は正の数にしてください: ${where} (${s.bodyWidth})`);
  if (s.bodyLines != null && !(Number.isInteger(s.bodyLines) && (s.bodyLines as number) > 0)) out.push(`bodyLines は 1 以上の整数にしてください: ${where} (${s.bodyLines})`);
  if (s.userAdded != null && typeof s.userAdded !== "boolean") out.push(`userAdded は true か false にしてください: ${where} (${s.userAdded})`);
  if (s.bodyRule != null && typeof s.bodyRule !== "boolean") out.push(`bodyRule は true か false にしてください: ${where} (${s.bodyRule})`);
  if (s.treeDirection != null && !isTreeDirection(s.treeDirection)) out.push(`treeDirection の値が不正です: ${where} (${s.treeDirection})`);
  if (s.childView != null && !isView(s.childView)) out.push(`childView の値が不正です: ${where} (${s.childView})`);
  if (theme && s.theme != null && !isTheme(s.theme)) {
    out.push(`theme の値が不正です: ${where} (${s.theme})。使えるのは ${THEMES.map(t => t.id).join(" / ")}`);
  }
  return out;
}

export function checkSettings(s: Record<string, unknown>, where: unknown): void {
  const [first] = settingsProblems(s, where);
  if (first) throw new Error(first);
}

// id の無いボックスに連番を振る（既存の数値 id の続きから。消したボックスの id も使用済みとして数える）
export function assignIds(data: unknown): void {
  if (!isObject(data) || !Array.isArray(data.nodes)) return;
  const nodes: unknown[] = data.nodes;
  const removed: unknown[] = Array.isArray(data.removed) ? data.removed : [];
  const used = [...nodes, ...removed].map(n => Number(isObject(n) ? n.id : NaN)).filter(Number.isInteger);
  let next = Math.max(0, ...used) + 1;
  for (const n of nodes) {
    if (isObject(n) && n.id == null) n.id = next++;
  }
}

// 図のデータの誤りを全部挙げる（無ければ空）。画面は最初の 1 つで止める（validate）。
// CLI（matomezu validate）も、ビルドしたこの関数を実行ファイルに埋め込んで使う（validate-cli.ts、internal/validate）
export function problems(data: unknown): string[] {
  const out: string[] = [];
  inspect(data, m => { out.push(m); }, true);
  return out;
}

// 画面で開くときの検査。知らないテーマの名前は誤りにしない（標準として描く。graph.ts の unknownThemes で知らせる）
export function validate(data: unknown): asserts data is Diagram {
  inspect(data, m => { throw new Error(m); }, false);
}

// 誤りを見つけるたびに fail を呼ぶ。fail が例外を投げれば最初の 1 つで止まる。投げなければ、続けられる所から調べ続ける。
// theme が false なら、知らないテーマの名前は誤りにしない
function inspect(data: unknown, fail: (message: string) => void, theme: boolean): void {
  if (!isObject(data) || !Array.isArray(data.nodes)) return fail("nodes 配列がありません");
  if (data.world != null) {
    if (!isObject(data.world)) fail("world がオブジェクトではありません");
    else {
      settingsProblems(data.world, "world", theme).forEach(fail);
      if (data.world.overflow === "grow") fail("world に overflow: grow は使えません");
      if (data.world.route != null && !includes(ROUTES, data.world.route)) fail(`world の route の値が不正です: ${data.world.route}`);
      if (data.world.background != null && typeof data.world.background !== "string") fail("world の background は色の文字列にしてください");
      if (data.world.title != null && typeof data.world.title !== "string") fail("world の title は文字列にしてください");
    }
  }
  const byId = new Map<string, Record<string, unknown>>();
  for (const n of data.nodes as unknown[]) {
    if (!isObject(n) || n.id == null) { fail("空のノードがあります"); continue; }
    if (byId.has(String(n.id))) { fail(`id が重複しています: ${n.id}`); continue; }
    byId.set(String(n.id), n);
    settingsProblems(n, n.id, theme).forEach(fail);
  }
  // 消したボックス。id は nodes と重ならないこと（parent は消したボックスや、もう無い id でもよい）
  if (data.removed != null && !Array.isArray(data.removed)) fail("removed が配列ではありません");
  const removedIds = new Set<string>();
  for (const n of (Array.isArray(data.removed) ? data.removed : []) as unknown[]) {
    if (!isObject(n) || n.id == null) { fail("removed に空のノードがあります"); continue; }
    if (byId.has(String(n.id)) || removedIds.has(String(n.id))) { fail(`id が重複しています: ${n.id}`); continue; }
    removedIds.add(String(n.id));
  }
  for (const n of byId.values()) {
    if (n.parent == null) continue;
    if (!byId.has(String(n.parent))) { fail(`存在しない親です: ${n.id} → ${n.parent}`); continue; }
    const seen = new Set([String(n.id)]);
    for (let p: unknown = n.parent; p != null; p = byId.get(String(p))?.parent) {
      if (seen.has(String(p))) { fail(`親子関係が循環しています: ${n.id}`); break; }
      seen.add(String(p));
    }
  }
  // ページは入れ子にしない（page: true の箱の祖先に、page: true の箱があってはいけない）
  for (const n of byId.values()) {
    if (n.page == null) continue;
    if (typeof n.page !== "boolean") { fail(`page は true か false にしてください: ${n.id}`); continue; }
    if (n.world != null) {
      if (!isObject(n.world)) fail(`world がオブジェクトではありません: ${n.id}`);
      else {
        settingsProblems(n.world, `${n.id} の world`).forEach(fail);
        if (n.world.overflow === "grow") fail(`world に overflow: grow は使えません: ${n.id}`);
        if (n.world.route != null && !includes(ROUTES, n.world.route)) fail(`world の route の値が不正です: ${n.id} (${n.world.route})`);
      }
    }
    if (n.page !== true) continue;
    const seen = new Set<unknown>();
    for (let p = byId.get(String(n.parent)); p && !seen.has(p); p = byId.get(String(p.parent))) {
      seen.add(p); // 親子の循環があっても止まるように
      if (p.page === true) { fail(`ページの中の箱はページにできません: ${n.id}（${p.id} のページの中）`); break; }
    }
  }
  const parentOf = (id: unknown) => {
    const p = byId.get(String(id))?.parent;
    return p == null ? null : String(p);
  };
  if (data.edges != null && !Array.isArray(data.edges)) fail("edges が配列ではありません");
  const edgeIds = new Set<string>();
  for (const e of (Array.isArray(data.edges) ? data.edges : []) as unknown[]) {
    if (!isObject(e) && !Array.isArray(e)) { fail("空の線があります"); continue; }
    const { id, from, to } = normalizeEdge(e as EdgeData | [Id, Id]);
    if (!byId.has(String(from)) || !byId.has(String(to))) { fail(`存在しないノードへの線があります: ${from} - ${to}`); continue; }
    const caption = (e as EdgeData).caption;
    if (caption != null && typeof caption !== "string") fail(`線の caption は文字列にしてください: ${from} - ${to}`);
    const captionAt = (e as EdgeData).captionAt;
    if (captionAt != null && !(typeof captionAt === "number" && captionAt >= 0 && captionAt <= 1)) fail(`captionAt は 0 から 1 の数にしてください: ${from} - ${to}`);
    const captionOffset = (e as EdgeData).captionOffset;
    if (captionOffset != null && !Number.isFinite(captionOffset)) fail(`captionOffset は数にしてください: ${from} - ${to}`);
    const arrow = (e as EdgeData).arrow;
    if (arrow != null && !includes(ARROWS, arrow)) fail(`arrow の値が不正です: ${from} - ${to} (${arrow})`);
    const route = (e as EdgeData).route;
    if (route != null && !includes(ROUTES, route)) fail(`route の値が不正です: ${from} - ${to} (${route})`);
    for (const k of ["exit", "enter"] as const) {
      const v = (e as EdgeData)[k];
      if (v != null && !includes(AXES, v)) fail(`${k} の値が不正です: ${from} - ${to} (${v})`);
    }
    for (const k of ["exitAt", "enterAt"] as const) {
      const v = (e as EdgeData)[k];
      if (v != null && !(typeof v === "number" && v >= 0 && v <= 1)) fail(`${k} は 0 から 1 の数にしてください: ${from} - ${to} (${v})`);
    }
    const via = (e as EdgeData).via;
    if (via != null && !(Array.isArray(via) && via.every(v => typeof v === "number" && Number.isFinite(v)))) {
      fail(`via は数の並びにしてください: ${from} - ${to}`);
    }
    const bend = (e as EdgeData).bend;
    if (bend != null && !(typeof bend === "number" && bend > 0 && bend < 1)) fail(`bend は 0 より大きく 1 より小さい数にしてください: ${from} - ${to} (${bend})`);
    const dash = (e as EdgeData).dash;
    if (dash != null && !includes(DASHES, dash)) fail(`dash の値が不正です: ${from} - ${to} (${dash})`);
    if (parentOf(from) !== parentOf(to)) fail(`階層の違うボックス同士の線があります: ${from} - ${to}`);
    if (id != null) {
      if (edgeIds.has(String(id))) fail(`線の id が重複しています: ${id}`);
      edgeIds.add(String(id));
    }
  }
}
