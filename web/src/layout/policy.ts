// 配置を決め直すとき（layout.ts の settle）の、場面ごとの設定値（SCENES）。
// settle は 1 つだけで、呼ぶ側が場面の行を渡し、settle はその値で振る舞いを切り替える。場面ごとの違いは 1 行の値の差になる。
// 配置の決まりの全体ではない（2026-10-10 に位置付けを改めた）。表の外の決まり（ドラッグ中の入れ替え、文字の箱を隣の手前で
// 折り返す fitToRow、位置の無い箱の置き方、リストやツリーの並べ方など）は layout.ts の冒頭と docs/HANDOFF.md の 8 章。
// 大きさが変わったとき（設定変更・追加・貼り付け・付け替え・箱を消す・つまみ）は settle ではなく layout.ts の regrow
// （docs/PAPER-plan.md の 4.6。起点はページの起点 STRATEGIES の growFrom。以前この表にあった「何を保つか」と「大きい相手に譲る」は外した）

// ---- 場面の表 ----

export interface Scene {
  // ぶつかったとき誰が動くか。later: 後から置くもの。others: 変えた節点と祖先はその場に残り、ほかが動く
  yieldTo: "later" | "others";
  // 子の中身を詰め直すときにずらす向き（幅を縮めるとき / 高さを縮めるとき）。null なら詰め直さない
  repack: { w: "down" | "right"; h: "down" | "right" } | null;
  // 表示領域の右にはみ出した最上位を下へ移すか（最初に開いたときだけ）
  fitViewport: boolean;
  // 置いた位置を、すべての箱の本来いたい位置にするか（データの位置が重なって押し下げられた箱も、押し下げられた
  // 位置を正とする。あとで上が空いても上がらない。保存された位置を正とする Undo・読み直しと同じ考え方。
  // docs/LAYOUT-PENDING.md の 3）
  adoptPlaced: boolean;
  // データの大きさを前の状態として、ユーザーの操作と同じ決まり（regrow）で押すか（開いたとき・読み直し・Undo。layout.ts の settleFromData。D45）
  fromData: boolean;
}

// 手を離したときと、位置の無い子を空きに置くときの設定（同じ値。変えた節点と祖先はその場に残り、重なった相手が下へずれる）
const AFTER_EDIT: Scene = {
  yieldTo: "others", repack: null, fitViewport: false, adoptPlaced: false, fromData: false,
};

export const SCENES = {
  // 開いたとき
  // 位置はデータのまま、本当の大きさへ広がった分を regrow で押す（D45）。開いたときは並べた結果が出発点（adoptPlaced）、
  // 読み直し・Undo は画面から本来いたい位置を引き継ぐ（縮めば戻る）
  open: {
    yieldTo: "later", repack: null, fitViewport: true, adoptPlaced: true, fromData: true,
  },
  // 外部の変更の読み直し・Undo・Redo
  reload: {
    yieldTo: "later", repack: null, fitViewport: false, adoptPlaced: false, fromData: true,
  },
  // 設定変更（キャプション、サイズ、形、見せ方など）で、見せ方を内包に戻した子に位置が無かったとき（空きに置く）。
  // 大きさが変わった分の並べ直しは layout.ts の regrow（docs/PAPER-plan.md の 4.6）
  settings: AFTER_EDIT,
  // 子のサイズをそろえる（alignChildren で子の中身を詰め直してから、全体を決め直す）
  fitChildren: {
    yieldTo: "others", repack: { w: "down", h: "right" }, fitViewport: false, adoptPlaced: false, fromData: false,
  },
  // ドラッグして手を離したとき（ドラッグ中にどけられなかった兄弟が重なっていれば、相手を下へずらす。
  // ドラッグ中の配置は表では表せないので drag.ts の先頭に決まりがある）
  drop: AFTER_EDIT,
} as const satisfies Record<string, Scene>;
