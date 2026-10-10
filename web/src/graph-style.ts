export const GRAPH_STYLE_ID = "matomezu-graph-style";

// 線の色（--mz-edge）は、半透明の色を背景（--mz-bg）と混ぜた不透明な色にする。半透明のままだと、線が重なった区間だけ
// 2 回塗られて濃く見え、別の意味に見えるため（2026-10-03 ユーザーの指摘）。--mz-bg は画面の背景（index.html の --bg）か、ワールドの背景色
export const GRAPH_CSS = `
.mz-stage {
  --mz-bg: #1e1e1e;
  --mz-edge: color-mix(in srgb, rgb(180, 180, 190) 40%, var(--mz-bg));
  --mz-edge-hi: rgba(200, 180, 255, 0.9);
  --mz-edge-del: #f87171;
  --mz-text: #e4e4e7;
  --mz-select: #c4b5fd;
  --mz-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  --mz-scroll: rgba(255, 255, 255, 0.2);
  --mz-scroll-hover: rgba(255, 255, 255, 0.36);
  position: relative;
  overflow: auto;
  user-select: none;
  -webkit-user-select: none;
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) .mz-stage {
    --mz-bg: #f6f6f8;
    --mz-edge: color-mix(in srgb, rgb(90, 90, 110) 40%, var(--mz-bg));
    --mz-edge-hi: rgba(120, 80, 220, 0.9);
    --mz-edge-del: #dc2626;
    --mz-text: #1b1b1f;
    --mz-select: #6d4bd8;
    --mz-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
    --mz-scroll: rgba(0, 0, 0, 0.2);
    --mz-scroll-hover: rgba(0, 0, 0, 0.36);
  }
}
/* スクロールバー: 細い角丸のつまみだけを見せ、通り道は透明にする。乗せると太く濃くなる。
   Chrome・Edge・Safari は ::-webkit-scrollbar で形を作る（scrollbar-width / scrollbar-color を指定すると
   Chrome はこちらを無視するので、それらは ::-webkit-scrollbar が使えない Firefox だけに当てる） */
.mz-stage::-webkit-scrollbar { width: 12px; height: 12px; }
.mz-stage::-webkit-scrollbar-track, .mz-stage::-webkit-scrollbar-corner { background: transparent; }
.mz-stage::-webkit-scrollbar-thumb {
  background: var(--mz-scroll); border-radius: 6px;
  border: 3px solid transparent; background-clip: padding-box;
}
.mz-stage::-webkit-scrollbar-thumb:hover { background-color: var(--mz-scroll-hover); border-width: 2px; }
@supports not selector(::-webkit-scrollbar) {
  .mz-stage { scrollbar-width: thin; scrollbar-color: var(--mz-scroll) transparent; }
}

/* 背景色を付けたワールドでは、背景の明るさに合わせてテーマと関係なく配色を切り替える */
.mz-world.mz-on-light {
  --mz-edge: color-mix(in srgb, rgb(90, 90, 110) 45%, var(--mz-bg));
  --mz-edge-hi: rgba(120, 80, 220, 0.9);
  --mz-edge-del: #dc2626;
  --mz-text: #1b1b1f;
  --mz-select: #6d4bd8;
  --mz-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
}
.mz-world.mz-on-dark {
  --mz-edge: color-mix(in srgb, rgb(180, 180, 190) 45%, var(--mz-bg));
  --mz-edge-hi: rgba(200, 180, 255, 0.9);
  --mz-edge-del: #f87171;
  --mz-text: #e4e4e7;
  --mz-select: #c4b5fd;
  --mz-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
}
.mz-world { position: absolute; left: 0; top: 0; }
.mz-world.mz-ov-clip { overflow: hidden; }
.mz-world > svg {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 5; overflow: visible;
}
.mz-line {
  stroke: var(--mz-edge); stroke-width: 1.5;
  transition: stroke 0.15s, stroke-width 0.15s, opacity 0.15s;
}
.mz-hit { stroke: transparent; stroke-width: 12; pointer-events: none; }
/* 線は polyline なので、塗らない（塗ると折れ線の点で囲まれた面が既定の黒で塗られる） */
.mz-line, .mz-hit { fill: none; }
.mz-arrow { fill: var(--mz-edge); stroke: none; pointer-events: none; }
/* 線のキャプションの札（docs/EDGE-CAPTION-plan.md）。foreignObject の中で上下左右の真ん中にそろえる。
   選んだ線・ポインタを乗せた線のキャプションは、線と同じ強調の色にする。
   札だけがクリックを受ける（選択モードのとき。押すと線を選ぶ） */
.mz-label { overflow: visible; pointer-events: none; }
.mz-label-box { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.mz-label-box > span {
  max-width: 100%; box-sizing: border-box; padding: 1px 5px; border-radius: 4px;
  font-size: 11px; line-height: 1.35; text-align: center; overflow-wrap: anywhere;
  color: var(--mz-text); /* 枠線も背景も無し（2026-10-09 ユーザー） */
}
.mz-mode-move .mz-label-box > span { pointer-events: auto; cursor: pointer; }
.mz-edge.mz-hi .mz-label-box > span, .mz-edge.mz-selected .mz-label-box > span { color: var(--mz-edge-hi); }
.mz-line.mz-dashed { stroke-dasharray: 6 4; }
/* 線を消せるのは線モードだけ。それ以外では線はクリックを受けず、下のボックスや背景に届く */
/* 線を選べるのは選択モード（"move"）だけ */
.mz-mode-move .mz-hit { pointer-events: stroke; cursor: pointer; }
/* Z 字の中棒をつかむ透明な線。横の Z 字（中棒が縦）は左右に、縦の Z 字（中棒が横）は上下に動かす */
.mz-bend { stroke: transparent; stroke-width: 12; pointer-events: none; }
.mz-mode-move .mz-bend { pointer-events: stroke; cursor: row-resize; }
.mz-mode-move .mz-bend.mz-bend-x { cursor: col-resize; }
/* 線の端をドラッグして、ほかの線の端に吸着したときの目印 */
.mz-snap { fill: none; stroke: var(--mz-select); stroke-width: 2; pointer-events: none; }
/* 線の両端をつかむ丸。選択モードで線を選んでいるときだけ出す */
.mz-end { display: none; fill: var(--mz-select); stroke: #fff; stroke-width: 1.5; pointer-events: none; }
.mz-mode-move .mz-edge.mz-selected .mz-end { display: inline; pointer-events: all; cursor: move; }
.mz-edge.mz-hi .mz-line { stroke: var(--mz-edge-hi); stroke-width: 2.2; }
.mz-edge.mz-hi .mz-arrow { fill: var(--mz-edge-hi); }
.mz-edge.mz-dim .mz-line, .mz-edge.mz-dim .mz-arrow { opacity: 0.25; }
/* ポインタを乗せた線は、矢印も一緒に強調する（選んでいる線は選択の色のまま） */
.mz-mode-move .mz-edge:not(.mz-selected):hover .mz-line { stroke: var(--mz-edge-hi); }
.mz-mode-move .mz-edge:not(.mz-selected):hover .mz-arrow { fill: var(--mz-edge-hi); }
.mz-edge.mz-selected .mz-line { stroke: var(--mz-select); stroke-width: 3; opacity: 1; }
.mz-edge.mz-selected .mz-arrow { fill: var(--mz-select); opacity: 1; }
.mz-node { position: absolute; pointer-events: none; transition: opacity 0.15s; }
.mz-node.mz-clip { overflow: hidden; }
.mz-head {
  position: absolute;
  box-sizing: border-box;
  border-radius: var(--mz-radius, 8px); /* テーマの角の丸み（theme.ts） */
  pointer-events: auto;
  cursor: grab; touch-action: none;
  color: var(--mz-text);
  outline: 2px solid transparent; outline-offset: 3px;
  transition: outline-color 0.15s;
}
.mz-leaf {
  display: flex; align-items: center; justify-content: center;
  padding: var(--mz-pad-y, 4px) var(--mz-pad-x, 8px); text-align: center; /* テーマの箱の中の余白（theme.ts） */
  font-size: 14px; font-weight: 600; line-height: 1.3;
  overflow: hidden;
}
.mz-leaf.mz-size-S { font-size: 12px; padding: 2px 6px; border-radius: min(var(--mz-radius, 6px), 6px); }
/* 付箋（テーマのスタイル。render.ts の folded）: 右上の角は背景で切り欠き、折り返しの三角をここで重ねる。大きさ（12px）は render.ts の FOLD */
.mz-head.mz-style-sticky::after {
  content: ""; position: absolute; right: 0; top: 0; width: 12px; height: 12px; pointer-events: none;
  background: linear-gradient(to left bottom, transparent 50%, var(--mz-fold) 50%);
  border-bottom-left-radius: 2px;
}
.mz-leaf.mz-light { color: #fff; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35); }
.mz-leaf.mz-dark { color: #1b1b1f; }
.mz-text { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
.mz-leaf.mz-ov-clip .mz-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mz-group > .mz-caption {
  position: absolute; left: 0; right: 0; top: 0;
  padding: 0 10px; font-size: 13px; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mz-group.mz-size-S > .mz-caption { font-size: 11px; }
/* 本文（docs/BODY-plan.md）。子の無い箱はキャプションの下に区切り線を引いて左寄せ、内包する箱は見出しの下（位置は render.ts） */
.mz-body { font-size: 13px; font-weight: 400; line-height: 1.5; text-align: left; white-space: pre-wrap; overflow-wrap: anywhere; min-width: 0; }
.mz-body[hidden] { display: none; }
.mz-leaf.mz-has-body { flex-direction: column; align-items: stretch; justify-content: flex-start; }
.mz-leaf.mz-has-body > .mz-body { margin-top: 4px; padding-top: 4px; border-top: 1px solid color-mix(in srgb, currentColor 25%, transparent); }
.mz-group > .mz-body { color: var(--mz-text); }
/* 本文の幅のつまみ。選んでいる箱だけ、右の縁に出す（位置は render.ts。内包する箱は本文の右の縁） */
.mz-body-grip { display: none; position: absolute; right: -3px; top: 0; bottom: 0; width: 7px; cursor: ew-resize; pointer-events: auto; z-index: 1; }
.mz-body-grip::after { content: ""; position: absolute; left: 2px; top: 50%; width: 3px; height: 22px; max-height: 100%; transform: translateY(-50%); border-radius: 2px; background: var(--mz-select); }
.mz-mode-move .mz-node.mz-current > .mz-head > .mz-body-grip:not([hidden]) { display: block; }
.mz-preview .mz-body-grip { display: none !important; }
.mz-more { position: absolute; right: 5px; bottom: 3px; font-size: 9px; line-height: 1; opacity: 0.8; }
.mz-tree { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
.mz-tree path { fill: none; stroke: var(--mz-edge); stroke-width: 1.5; }
.mz-tree .mz-tree-frame { stroke-width: 1.5; stroke-dasharray: 6 4; }
/* 形: スティックマン（背景なし、人の形の足元に文字）と DB（円柱。胴の中央に文字） */
.mz-shape { display: none; }
.mz-leaf.mz-shape-person { flex-direction: column; justify-content: flex-start; gap: 2px; padding: 0 4px; }
.mz-shape-person > .mz-shape { display: block; flex: none; width: 36px; height: 52px; overflow: visible; }
.mz-size-S.mz-shape-person > .mz-shape { width: 26px; height: 38px; }
.mz-shape-person .mz-figure { fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.mz-leaf.mz-shape-person .mz-text { color: var(--mz-text); text-shadow: none; line-height: 1.25; }
/* 上は上面の楕円（縦の半径 8px、S は 6px）の分、下は底の楕円の手前半分の分をあける */
.mz-leaf.mz-shape-db { padding-top: 18px; padding-bottom: 10px; }
.mz-leaf.mz-size-S.mz-shape-db { padding-top: 14px; padding-bottom: 7px; }
.mz-shape-db > .mz-shape { display: block; position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.mz-shape-db > .mz-text { position: relative; }
/* ひし形（フローチャートの分岐）: 形は SVG で描く。文字は幅の半分で折り返す（内側に収まる四角は縦横の半分。node-kinds.ts の DIAMOND_TEXT） */
.mz-leaf.mz-shape-diamond { padding: 0; background: transparent; overflow: visible; } /* 影を本体の四角で切らない */
.mz-shape-diamond > .mz-shape { display: block; position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.mz-shape-diamond > .mz-text { position: relative; max-width: 50%; }
/* ページの箱（タブ付きの見出し）。上の余白は耳の分（render.ts の renderPage と合わせる） */
.mz-leaf.mz-shape-page { padding-top: 13px; background: transparent; }
.mz-leaf.mz-size-S.mz-shape-page { padding-top: 8px; }
.mz-shape-page > .mz-shape { display: block; position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.mz-shape-page > .mz-text { position: relative; }
/* 付け替えのドラッグ */
.mz-mode-reparent .mz-head { cursor: alias; }
.mz-mode-link .mz-head { cursor: crosshair; }
.mz-mode-remove .mz-head { cursor: pointer; }
/* 削除モードでポインタを乗せたボックス: 一緒に消える範囲（子孫を含む）を赤い枠で示す */
.mz-node.mz-removing > .mz-head, .mz-node.mz-removing .mz-head { outline: 2px solid var(--mz-edge-del); outline-offset: 1px; }
.mz-node.mz-removing { opacity: 0.7; }
.mz-node.mz-lifted { opacity: 0.3; }
/* 画面の座標で置く（図の外のタブの上へ持っていっても、図の端で切れないように） */
.mz-ghost { position: fixed; z-index: 50; opacity: 0.8; pointer-events: none; filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.35)); }
.mz-ghost .mz-head { pointer-events: none; }
.mz-ghost.mz-ghost-no { opacity: 0.35; }
.mz-node.mz-drop > .mz-head {
  outline: 3px solid var(--mz-select); outline-offset: 3px;
  box-shadow: 0 0 0 7px color-mix(in srgb, var(--mz-select) 25%, transparent) !important;
}
.mz-world.mz-drop { outline: 3px solid var(--mz-select); outline-offset: -4px; }
.mz-node.mz-dim { opacity: 0.35; }
.mz-node.mz-dragging { z-index: 10; opacity: 0.85; } /* 兄弟に重ねて通すので、下が透けて見えるように */
.mz-node.mz-dragging > .mz-head { cursor: grabbing; outline-color: var(--mz-edge-hi); }
.mz-node.mz-current > .mz-head { outline-color: var(--mz-select); }
.mz-node.mz-linking > .mz-head { outline: 2px dashed var(--mz-select); }
.mz-node.mz-blocked { animation: mz-shake 0.18s; }
@keyframes mz-shake { 25% { translate: -2px 0; } 75% { translate: 2px 0; } }
/* プレビュー（見るだけ）: 押すと選ぶだけ。背景はつかんで見る範囲を動かす。線の区間や端をつまむ印は出さない */
.mz-preview { cursor: grab; }
.mz-preview.mz-panning { cursor: grabbing; }
.mz-preview .mz-head, .mz-preview .mz-label-box > span { cursor: pointer; }
.mz-preview .mz-hit { pointer-events: stroke; cursor: pointer; }
.mz-preview .mz-bend, .mz-preview .mz-end { pointer-events: none; }
.mz-preview .mz-edge.mz-selected .mz-end { display: none; }
`;
