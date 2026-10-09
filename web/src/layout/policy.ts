// 配置を決め直すとき（layout.ts の settle）の、場面ごとの設定値（SCENES）と、何を保つかの決まり（AnchorRule）。
// settle は 1 つだけで、呼ぶ側が場面の行を渡し、settle はその値で振る舞いを切り替える。場面ごとの違いは 1 行の値の差になる。
// 配置の決まりの全体ではない（2026-10-10 に位置付けを改めた）。表の外の決まり（ドラッグ中の入れ替え、文字の箱を隣の手前で
// 折り返す fitToRow、位置の無い箱の置き方、リストやツリーの並べ方など）は layout.ts の冒頭と docs/HANDOFF.md の 8 章
import type { Box } from "../model";
import type { Rect } from "./node-kinds";

// ---- 何を保つか（AnchorRule） ----

// 大きさが変わる前に呼び、変わったあとの位置を返す関数を返す
export interface Keep {
  x(m: Box): number;
  y(m: Box): number;
}
export type AnchorRule = (n: Box) => Keep;
export type AnchorName = "topLeft" | "topCenter";

export interface AnchorContext {
  anchorRect(n: Box): Rect; // 線がつながる範囲（ツリーなら外枠、それ以外は本体）
}

export function createAnchorRules(ctx: AnchorContext): Record<AnchorName, AnchorRule> {
  const { anchorRect } = ctx;
  return {
    // 左上を保ち、右と下へ伸び縮みする。グループの中で使う。位置がずれないので、切り替えを繰り返しても元に戻り、
    // 上の相手にもぶつからない
    topLeft: n => {
      const { x, y } = n;
      return { x: () => x, y: () => y };
    },
    // 上辺と、線がつながる範囲の横の中心を保つ。左右と下へ伸び縮みする。最上位で使う
    // （左上を保つと、非表示にしたとき元の枠の左上に寄ってしまう）。上へは伸びないので、上の相手にぶつからない。
    // 保つのは今の中心ではなく本来いたい中心（intendedCX）なので、端で押し戻されたり大きい隣にぶつかってずれたり
    // した分は、縮めば元に戻る
    topCenter: n => {
      const a = anchorRect(n);
      const cx = Number.isFinite(n.intendedCX) ? n.intendedCX : n.x + a.x + a.w / 2, { y } = n;
      return { x: m => { const b = anchorRect(m); return cx - b.x - b.w / 2; }, y: () => y };
    },
  };
}

// 線は、真横や真下の相手とはつなぐ位置が滑るだけで水平・垂直のまま保たれる（render.ts の edgeEnds）ので、
// 線の角度を箱の位置で保つ必要は無い。以前は最上位で線の相手の側の辺や中心を保っていたが、親の端で押し戻された
// ずれが残ったり、上の相手にぶつかったりして、切り替えるたびに位置が変わったのでやめた（2026-09-28）

// ---- 場面の表 ----

export interface Scene {
  // 大きさが変わった節点の、どこを保つか（グループの中と最上位で別）。null なら保たない（データの位置のまま）
  anchor: { inGroup: AnchorName; topLevel: AnchorName } | null;
  // ぶつかったとき誰が動くか。later: 後から置くもの。others: 変えた節点と祖先はその場に残り、ほかが動く
  yieldTo: "later" | "others";
  // 広がった節点が自分より大きい兄弟にぶつかったら、自分の方がずれる（大きい方を動かすと全体が崩れるため）
  giveWayToLarger: boolean;
  // 子の中身を詰め直すときにずらす向き（幅を縮めるとき / 高さを縮めるとき）。null なら詰め直さない
  repack: { w: "down" | "right"; h: "down" | "right" } | null;
  // 表示領域の右にはみ出した最上位を下へ移すか（最初に開いたときだけ）
  fitViewport: boolean;
  // 置いた位置を、すべての箱の本来いたい位置にするか（データの位置が重なって押し下げられた箱も、押し下げられた
  // 位置を正とする。あとで上が空いても上がらない。保存された位置を正とする Undo・読み直しと同じ考え方。
  // docs/LAYOUT-PENDING.md の 3）
  adoptPlaced: boolean;
}

// 手を離したときと、箱を消したときの設定（同じ値。変えた節点と祖先はその場に残り、重なった相手が下へずれる）
const AFTER_EDIT: Scene = {
  anchor: null, yieldTo: "others", giveWayToLarger: false, repack: null, fitViewport: false, adoptPlaced: false,
};

export const SCENES = {
  // 開いたとき
  open: {
    anchor: null, yieldTo: "later", giveWayToLarger: false, repack: null, fitViewport: true, adoptPlaced: true,
  },
  // 外部の変更の読み直し・Undo・Redo
  reload: {
    anchor: null, yieldTo: "later", giveWayToLarger: false, repack: null, fitViewport: false, adoptPlaced: true,
  },
  // サイドバーでの設定変更（キャプション、サイズ、形、見せ方など）
  settings: {
    anchor: { inGroup: "topLeft", topLevel: "topCenter" }, yieldTo: "others", giveWayToLarger: true,
    repack: null, fitViewport: false, adoptPlaced: false,
  },
  // 子のサイズをそろえる（alignChildren で子の中身を詰め直してから、全体を決め直す）
  fitChildren: {
    anchor: null, yieldTo: "others", giveWayToLarger: false,
    repack: { w: "down", h: "right" }, fitViewport: false, adoptPlaced: false,
  },
  // ドラッグして手を離したとき（ドラッグ中にどけられなかった兄弟が重なっていれば、相手を下へずらす。
  // ドラッグ中の配置は表では表せないので drag.ts の先頭に決まりがある）
  drop: AFTER_EDIT,
  // ボックスを消したとき（親と祖先はその場に残して縮め、縮んだ分、押し下げていた相手は元の高さへ戻る。
  // 残った子は動かさない。docs/DELETE-plan.md）
  remove: AFTER_EDIT,
} as const satisfies Record<string, Scene>;
