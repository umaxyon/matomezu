// 配置の方針。判断の単位ごとのストラテジーを組み合わせて、場面の表（SCENES）にする。
// この表が配置の決まりの仕様（docs/REFACTOR-layout.md の 3.2）。場面ごとの違いは、ここの1行の差として見る。
// 表で書けない振る舞いを足したくなったら、まず表（と決まり）を見直す
import type { Rect } from "./node-kinds";
import { type Box, type Edge, other } from "./model";

// ---- 何を保つか（AnchorRule） ----

// 大きさが変わる前に呼び、変わったあとの位置を返す関数を返す
export interface Keep {
  x(m: Box): number;
  y(m: Box): number;
}
export type AnchorRule = (n: Box) => Keep;
export type AnchorName = "topLeft" | "edgeOrCenter";

export interface AnchorContext {
  anchorRect(n: Box): Rect;
  incident(n: Box): Edge[];
}

export function createAnchorRules(ctx: AnchorContext): Record<AnchorName, AnchorRule> {
  const { anchorRect, incident } = ctx;

  // 左上を保ち、右と下へ伸び縮みする。グループの中で使う（中心を保つと、親の端で押し戻されたずれが
  // 次に縮むときに残り、切り替えるたびに位置が変わっていくため）
  const topLeft: AnchorRule = n => {
    const { x, y } = n;
    return { x: () => x, y: () => y };
  };

  // 線でつながる相手が片側にだけいれば、線がつながる範囲（anchorRect。ツリーなら外枠）のその側の辺を保つ
  // （線の長さも角度も変わらない）。相手が範囲の内側（真横や真下）にいるか両側にいれば、線がつながる範囲の
  // 中心を保つ。相手がいなければ本体の中心を保つ（見た目の位置が変わらない）。横と縦は別々に決める。最上位で使う
  const edgeOrCenter: AnchorRule = n => {
    const l = n.x + n.hx, t = n.y + n.hy, r = l + n.hw, b = t + n.hh;
    const ar = anchorRect(n);
    const al = n.x + ar.x, at = n.y + ar.y, arr = al + ar.w, ab = at + ar.h;
    const others = incident(n)
      .filter(e => e.a.parent === e.b.parent)
      .map(e => other(e, n))
      .map(o => { const a = anchorRect(o); return [o.x + a.x + a.w / 2, o.y + a.y + a.h / 2] as const; });
    // 相手が範囲の内側（真横や真下）にいる方向は、中心を保つ（辺を保つと、その相手への線が斜めになる）
    const side = (lo: number, hi: number, vs: number[]) => {
      const before = vs.some(v => v < lo), after = vs.some(v => v > hi);
      const inside = vs.some(v => v >= lo && v <= hi);
      return inside ? "center" : before && !after ? "start" : after && !before ? "end" : "center";
    };
    const sx = side(al, arr, others.map(o => o[0])), sy = side(at, ab, others.map(o => o[1]));
    const linked = others.length > 0;
    return {
      x: m => {
        const a = anchorRect(m);
        if (sx === "start") return al - a.x;
        if (sx === "end") return arr - a.x - a.w;
        return linked ? (al + arr) / 2 - a.x - a.w / 2 : (l + r) / 2 - m.hx - m.hw / 2;
      },
      y: m => {
        const a = anchorRect(m);
        if (sy === "start") return at - a.y;
        if (sy === "end") return ab - a.y - a.h;
        return linked ? (at + ab) / 2 - a.y - a.h / 2 : (t + b) / 2 - m.hy - m.hh / 2;
      },
    };
  };

  return { topLeft, edgeOrCenter };
}

// ---- 場面の表 ----

export interface Scene {
  // 大きさが変わった節点の、どこを保つか（グループの中と最上位で別）。null なら保たない（データの位置のまま）
  anchor: { inGroup: AnchorName; topLevel: AnchorName } | null;
  // ぶつかったとき誰が動くか。later: 後から置くもの。others: 変えた節点と祖先はその場に残り、ほかが動く
  yieldTo: "later" | "others";
  // 広がった節点が自分より大きい兄弟にぶつかったら、自分の方がずれる（大きい方を動かすと全体が崩れるため）
  giveWayToLarger: boolean;
  // ぶつかった相手をずらす向き
  direction: "down";
  // 押し下げた相手を、空いたら元の位置へ戻すか
  restore: boolean;
  // 表示領域の右にはみ出した最上位を下へ移すか（最初に開いたときだけ）
  fitViewport: boolean;
}

export const SCENES = {
  // 開いたとき
  open: { anchor: null, yieldTo: "later", giveWayToLarger: false, direction: "down", restore: true, fitViewport: true },
  // 外部の変更の読み直し・Undo・Redo
  reload: { anchor: null, yieldTo: "later", giveWayToLarger: false, direction: "down", restore: true, fitViewport: false },
  // サイドバーでの設定変更（キャプション、サイズ、形、見せ方など）
  settings: {
    anchor: { inGroup: "topLeft", topLevel: "edgeOrCenter" },
    yieldTo: "others", giveWayToLarger: true, direction: "down", restore: true, fitViewport: false,
  },
  // 子のサイズをそろえたあと（子の詰め直しは compress が行う）
  fitChildren: { anchor: null, yieldTo: "others", giveWayToLarger: false, direction: "down", restore: true, fitViewport: false },
} as const satisfies Record<string, Scene>;
