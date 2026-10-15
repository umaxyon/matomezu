// まだユーザーが見ていない LLM の変更（外部の変更の読み直し。D31。2026-10-15 ユーザー）。変えた箱が見えている範囲に入ったら（スクロールで
// 通っただけでも）認知し、ユーザーの履歴の時刻の位置に差し込む（history.ts の adopt）。1 つの変更が複数の箱を扱うときは、どれか 1 つが見えたら全体。
// 消した箱は消す前の場所、ページの設定（world・pages）は、そのページが出たら。非表示や縮図の行の中の箱は、▼ や縮図が見えても認知しない
import { touchedOf } from "./diff";
import type { Rect } from "./geom";
import type { Op } from "./history";
import { type Box, ancestors, isHidden } from "./model";

export interface UnseenContext {
  container: HTMLElement;
  worldEl: HTMLElement;
  page(): string | null;            // 今見ているページ
  boxById(id: string): Box | undefined;
  zoom(): number;                   // 今ワールドにかけている倍率
  alive(): boolean;                 // 図を壊していないか
  adopt(op: Op): void;              // 見た変更をユーザーの履歴に差し込む（history.ts）
  seen(version: string): void;      // その版にした変更をユーザーが見た（onLLMSeen）
}

interface Unseen {
  op: Op;
  version: string | null;
  nodes: Set<string>;
  removed: { page: string | null; rect: Rect }[];
  pages: Set<string | null>;
  whole: boolean;
}

export function createUnseen(ctx: UnseenContext) {
  const { container, worldEl } = ctx;
  let unseen: Unseen[] = [];

  // 外部の変更 op を、見ていない変更として覚える。before は読み直す前の箱の場所（消した箱の認知は、消す前の場所が見えたとき）
  function add(op: Op, version: string | undefined, before: Map<string, { page: string | null; rect: Rect }> | null) {
    const t = touchedOf(op.changes);
    unseen.push({
      op, version: version ? version.replace(/^W\//, "").replace(/"/g, "") : null, nodes: t.nodes, pages: t.pages, whole: t.whole,
      removed: [...t.removed.keys()].flatMap(id => { const b = before?.get(id); return b ? [b] : []; }),
    });
    setTimeout(check, 0); // 描いてから
  }

  // 見ていない LLM の変更のうち、見えたものを認知する（読み込み・スクロール・大きさの変化・ページの切り替え・拡大縮小のあと）
  function check() {
    if (!unseen.length || !ctx.alive() || !container.getClientRects().length) return; // 裏のブック（隠れている）は見えていない
    const c = container.getBoundingClientRect();
    const view = { left: c.left + container.clientLeft, top: c.top + container.clientTop, right: 0, bottom: 0 };
    view.right = view.left + container.clientWidth;
    view.bottom = view.top + container.clientHeight;
    const hits = (r: { left: number; top: number; right: number; bottom: number }) =>
      r.right > view.left && r.left < view.right && r.bottom > view.top && r.top < view.bottom;
    const w = worldEl.getBoundingClientRect(), z = ctx.zoom(), page = ctx.page();
    const seen = (u: Unseen) => u.whole || u.pages.has(page)
      || [...u.nodes].some(id => {
        const n = ctx.boxById(id);
        // スクロールしているリスト（D33）の中の子は、リストの枠の中に見えているときだけ（隠れた所は画面の上でも枠の外）
        const r = n?.head.getBoundingClientRect();
        return !!n && !!r && !isHidden(n) && n.el.getClientRects().length > 0 && hits(r)
          && ancestors(n).every(a => !a.kidsEl || (() => { const k = a.kidsEl!.getBoundingClientRect(); return r.bottom > k.top && r.top < k.bottom; })());
      })
      || u.removed.some(r => r.page === page && hits({
        left: w.left + r.rect.x * z, top: w.top + r.rect.y * z,
        right: w.left + (r.rect.x + r.rect.w) * z, bottom: w.top + (r.rect.y + r.rect.h) * z,
      }));
    const now = unseen.filter(seen);
    if (!now.length) return;
    unseen = unseen.filter(u => !now.includes(u));
    for (const u of now) {
      ctx.adopt(u.op);
      if (u.version) ctx.seen(u.version);
    }
  }
  container.addEventListener("scroll", () => check(), { passive: true });
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => check()).observe(container);

  return {
    add, check,
    any: () => unseen.length > 0,
    clear: () => { unseen = []; }, // 読み込み直し（出発点にする）
  };
}
