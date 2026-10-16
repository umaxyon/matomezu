export const GRAPH_STYLE_ID = "matomezu-graph-style";

// 線の色（--mz-edge）は、半透明の色を背景（--mz-bg）と混ぜた不透明な色にする。半透明のままだと、線が重なった区間だけ
// 2 回塗られて濃く見え、別の意味に見えるため（2026-10-03 ユーザーの指摘）。--mz-bg は画面の背景（index.html の --bg）か、ワールドの背景色
export const GRAPH_CSS = `/* i18n-ok（CSS のコメント） */
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
/* スクロールバーは出さない（D32。2026-10-15 ユーザー）。見る範囲は手のひら・ホイール・ミニマップで動かす。
   スクロールできる範囲は、編集領域（ワールド）の外側に上下左右とも余白の分だけ（graph.ts の DEFAULTS.margin） */
.mz-stage { scrollbar-width: none; }
.mz-stage::-webkit-scrollbar { display: none; }

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
.mz-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; } /* left・top は周りの余白か、紙が小さければ真ん中に来る量（layout.ts の sizeCanvas。D32） */
.mz-canvas { position: absolute; left: 0; top: 0; pointer-events: none; }
/* 紙（D33）: 白（暗い画面では少し明るい灰色）に、縁の細い線と薄い影。ページに背景色があればその色（render.ts が style の background に書く）。紙の外は点の格子 */
.mz-stage { --mz-paper: #2a2a30; --mz-paper-line: rgba(255, 255, 255, 0.14); }
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) .mz-stage { --mz-paper: #ffffff; --mz-paper-line: rgba(0, 0, 0, 0.12); }
}
.mz-world.mz-paper { background-color: var(--mz-paper); box-shadow: 0 0 0 1px var(--mz-paper-line), 0 6px 24px rgba(0, 0, 0, 0.18); } /* スクロールできる広さを決める見えない入れ物（layout.ts の sizeCanvas） */
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
/* 端の形の線で描く部分（白抜き・開いた矢じり・ER 図の印。heads.ts）。線と同じ色と太さ */
.mz-arrow-line { fill: none; stroke: var(--mz-edge); stroke-width: 1.5; stroke-linejoin: round; pointer-events: none; }
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
/* 線を選べるのは選択モード（"move"）だけ。それ以外では線はクリックを受けず、下のボックスや背景に届く */
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
.mz-edge.mz-hi .mz-arrow-line { stroke: var(--mz-edge-hi); }
.mz-edge.mz-dim .mz-line, .mz-edge.mz-dim .mz-arrow, .mz-edge.mz-dim .mz-arrow-line { opacity: 0.25; }
/* ポインタを乗せた線は、矢印も一緒に強調する（選んでいる線は選択の色のまま） */
.mz-mode-move .mz-edge:not(.mz-selected):hover .mz-line { stroke: var(--mz-edge-hi); }
.mz-mode-move .mz-edge:not(.mz-selected):hover .mz-arrow { fill: var(--mz-edge-hi); }
.mz-mode-move .mz-edge:not(.mz-selected):hover .mz-arrow-line { stroke: var(--mz-edge-hi); }
.mz-edge.mz-selected .mz-line { stroke: var(--mz-select); stroke-width: 3; opacity: 1; }
.mz-edge.mz-selected .mz-arrow { fill: var(--mz-select); opacity: 1; }
.mz-edge.mz-selected .mz-arrow-line { stroke: var(--mz-select); stroke-width: 2; opacity: 1; }
.mz-node { position: absolute; pointer-events: none; transition: opacity 0.15s; }
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
  /* 箱の中の余白（標準）に、テーマの補正値（render.ts が付ける --mz-out-y / --mz-out-x。theme.ts の outset）を足す */
  padding: calc(4px + var(--mz-out-y, 0px)) calc(8px + var(--mz-out-x, 0px)); text-align: center;
  font-size: 14px; font-weight: 600; line-height: 1.3;
  overflow: hidden;
}
.mz-leaf.mz-size-S { font-size: 12px; padding: calc(2px + var(--mz-out-y, 0px)) calc(6px + var(--mz-out-x, 0px)); border-radius: min(var(--mz-radius, 6px), 6px); }
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
/* キャプションと本文の仕切り（子の無い箱も内包する箱も同じ線。内包する箱は見出しの下から始めるので、上の間は取らない） */
.mz-has-body > .mz-body { padding-top: 4px; border-top: 1px solid color-mix(in srgb, currentColor 25%, transparent); }
.mz-leaf.mz-has-body > .mz-body { margin-top: 4px; }
.mz-has-body.mz-body-norule > .mz-body { border-top-color: transparent; }
/* 本文の最大行数（行数は render.ts が -webkit-line-clamp に入れる） */
.mz-body.mz-body-clamp { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; }
.mz-group > .mz-body { color: var(--mz-text); box-sizing: border-box; }
/* 本文の幅のつまみ。選んでいる箱だけ、右の縁に出す（位置は render.ts。内包する箱は本文の右の縁） */
.mz-body-grip { display: none; position: absolute; right: -3px; top: 0; bottom: 0; width: 7px; cursor: ew-resize; pointer-events: auto; z-index: 1; }
.mz-body-grip::after { content: ""; position: absolute; left: 2px; top: 50%; width: 3px; height: 22px; max-height: 100%; transform: translateY(-50%); border-radius: 2px; background: var(--mz-select); }
.mz-mode-move .mz-node.mz-current > .mz-head > .mz-body-grip:not([hidden]) { display: block; }
.mz-preview .mz-body-grip { display: none !important; }
/* リストの幅のつまみ（docs/SIZE-plan.md の 10 章）。選んでいるリストだけ、右の縁の高さいっぱいに出す */
/* スクロールするリスト（D33。listHeight）: 見出しの下の入れ物だけがスクロールする。細いスクロールバーを出す */
.mz-list-kids { position: absolute; left: 0; right: 0; overflow-x: hidden; overflow-y: auto; scrollbar-width: thin; }
.mz-list-space { position: absolute; left: 0; top: 0; width: 1px; pointer-events: none; }
.mz-height-grip { display: none; position: absolute; left: 0; right: 0; bottom: -4px; height: 8px; cursor: ns-resize; pointer-events: auto; z-index: 2; }
.mz-height-grip::after { content: ""; position: absolute; top: 2px; left: 50%; height: 4px; width: 32px; max-width: 100%; transform: translateX(-50%); border-radius: 2px; background: var(--mz-select); }
.mz-mode-move .mz-node.mz-current > .mz-head > .mz-height-grip:not([hidden]) { display: block; }
.mz-preview .mz-height-grip { display: none !important; }
.mz-width-grip { display: none; position: absolute; right: -4px; top: 0; bottom: 0; width: 8px; cursor: ew-resize; pointer-events: auto; z-index: 1; }
.mz-width-grip::after { content: ""; position: absolute; left: 2px; top: 50%; width: 4px; height: 32px; max-height: 100%; transform: translateY(-50%); border-radius: 2px; background: var(--mz-select); }
.mz-mode-move .mz-node.mz-current > .mz-head > .mz-width-grip:not([hidden]) { display: block; }
.mz-preview .mz-width-grip { display: none !important; }
.mz-more { position: absolute; right: 5px; bottom: 3px; font-size: 9px; line-height: 1; opacity: 0.8; }
/* リンクの箱（link-box.ts。ほかのページへの窓）。数値は render.ts が --mz-link-handle / --mz-link-win-w / --mz-link-win-h / --mz-link-gap で渡す。
   部品（持ち手の帯・窓）は display: contents の入れ物に入れ、文字（.mz-text / .mz-body）と同じ格子に並べる。測るときは入れ物を隠す（measure.ts）。
   窓枠（window）: 上から帯・文字・本文・窓。横に分ける（side）: 左の帯、文字の列、右の窓 */
.mz-leaf.mz-link { display: grid; padding: var(--mz-out-y, 0px) var(--mz-out-x, 0px); text-align: left; align-items: start; }
.mz-link-parts { display: contents; } /* 部品の親は display: contents の入れ物なので、.mz-head の子セレクタ（>）では引けない。子孫で引く */
.mz-link-parts[hidden] { display: none; }
.mz-link > .mz-text { grid-area: text; margin: 8px 8px 0; } /* 文字の余白は 8px、窓の余白（--mz-link-gap）は狭く（2026-10-12 ユーザー） */
.mz-link > .mz-body { grid-area: body; margin: 0 8px; }
.mz-leaf.mz-link.mz-has-body > .mz-body { margin-top: 4px; }
.mz-link.mz-link-empty > .mz-text { display: none; }
.mz-link-bar { grid-area: bar; cursor: grab; background: color-mix(in srgb, currentColor 10%, transparent); border-bottom: 1px solid color-mix(in srgb, currentColor 25%, transparent);
  display: flex; align-items: center; justify-content: flex-end; padding: 0 8px; box-sizing: border-box; }
/* 持ち手の印（3 つの点）。窓枠は帯の左、横に分けるは帯の真ん中に縦に */
.mz-link-bar::before { content: ""; flex: none; width: 22px; height: 6px; margin-right: auto;
  background: radial-gradient(circle, color-mix(in srgb, currentColor 35%, transparent) 2.2px, transparent 2.7px) 0 0 / 8px 6px repeat-x; }
/* ブックリンク（book。D29）: 持ち手の帯を斜めの縞にして、ページリンクと見分ける。色は文字の色から作るので、テーマに左右されない */
.mz-link-book .mz-link-bar { background: repeating-linear-gradient(135deg, color-mix(in srgb, currentColor 24%, transparent) 0 3px, color-mix(in srgb, currentColor 8%, transparent) 3px 7px); }
.mz-link-badge { font-size: 10px; font-weight: 500; line-height: 1; padding: 2px 6px; border-radius: 999px; border: 1px solid color-mix(in srgb, currentColor 35%, transparent); opacity: 0.85; white-space: nowrap; }
.mz-link-win { grid-area: win; position: relative; box-sizing: border-box; margin: var(--mz-link-gap); height: var(--mz-link-win-h); cursor: pointer;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 30%, transparent); border-radius: 4px; background: color-mix(in srgb, var(--mz-bg) 55%, transparent); overflow: hidden; }
.mz-link-win:hover { box-shadow: inset 0 0 0 1px var(--mz-select); }
/* 窓の中の縮図（preview-art.ts。ミニマップと同じ描き方）。色は箱の文字の色から作る */
.mz-link-art { display: block; width: 100%; height: 100%; --mm-edge: color-mix(in srgb, currentColor 45%, transparent); --mm-box: color-mix(in srgb, currentColor 22%, transparent); }
.mz-link-art .mm-box, .mz-link-art .mm-bg { stroke: none; }
.mz-link-art .mm-group { fill: none; stroke-width: 1; }
.mz-link-art .mm-edge { fill: none; stroke: var(--mm-edge); stroke-width: 1; vector-effect: non-scaling-stroke; }
.mz-link-go { position: absolute; right: 4px; bottom: 4px; font-size: 10px; font-weight: 500; line-height: 1; padding: 3px 5px; border-radius: 4px; background: var(--mz-select); color: #fff; opacity: 0; transition: opacity 0.15s; }
.mz-link-win:hover .mz-link-go { opacity: 1; }
/* 行の高さは中身で決める（帯の高さは帯の要素に持たせる。測るときは帯と窓を隠すので、決めた高さの行が残ると文字の高さに数えてしまう） */
.mz-link-window { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto auto auto; grid-template-areas: "bar" "text" "body" "win"; }
.mz-link-window .mz-link-bar { height: var(--mz-link-handle); }
.mz-link-window.mz-link-empty > .mz-text { display: none; }
.mz-link-side { grid-template-columns: var(--mz-link-handle) minmax(0, 1fr) calc(var(--mz-link-win-w) + 2 * var(--mz-link-gap)); grid-template-rows: auto 1fr; grid-template-areas: "bar text win" "bar body win"; }
.mz-link-side .mz-link-bar { width: var(--mz-link-handle); align-self: stretch; padding: 0; border-bottom: 0; border-right: 1px solid color-mix(in srgb, currentColor 25%, transparent); justify-content: center; }
.mz-link-side .mz-link-bar::before { width: 6px; height: 22px; margin: 0; background-size: 6px 8px; background-repeat: repeat-y; }
.mz-link-side .mz-link-bar .mz-link-badge { display: none; }
.mz-link-side .mz-link-win { width: var(--mz-link-win-w); align-self: start; }
.mz-link-side.mz-link-empty { grid-template-columns: var(--mz-link-handle) calc(var(--mz-link-win-w) + 2 * var(--mz-link-gap)); grid-template-areas: "bar win"; }
.mz-link-side > .mz-text { margin: 8px 8px 0; }
.mz-link-side > .mz-body { margin: 0 8px 8px; }
/* 縮図を左に出す（リストの previewSide。D13）: 窓と文字の列を入れ替え、持ち手は右端へ（縮図の左端を、持ち手の無い行とそろえる。2026-10-14 ユーザー） */
.mz-link-side.mz-link-left { grid-template-columns: calc(var(--mz-link-win-w) + 2 * var(--mz-link-gap)) minmax(0, 1fr) var(--mz-link-handle); grid-template-areas: "win text bar" "win body bar"; }
.mz-link-side.mz-link-left.mz-link-empty { grid-template-columns: calc(var(--mz-link-win-w) + 2 * var(--mz-link-gap)) var(--mz-link-handle); grid-template-areas: "win bar"; }
.mz-link-side.mz-link-left .mz-link-bar { border-right: 0; border-left: 1px solid color-mix(in srgb, currentColor 25%, transparent); }
/* リストの中の縮図は、行が高くなったら上下の真ん中に置く。文字も、普通の行と同じく上下の真ん中に寄せる（リストの高さで行が伸びるため。D13） */
.mz-link-side.mz-link-mid { grid-template-rows: 1fr auto auto 1fr; grid-template-areas: "bar . win" "bar text win" "bar body win" "bar . win"; }
.mz-link-side.mz-link-mid.mz-link-left { grid-template-areas: "win . bar" "win text bar" "win body bar" "win . bar"; }
.mz-link-side.mz-link-mid.mz-link-empty { grid-template-rows: 1fr; grid-template-areas: "bar win"; }
.mz-link-side.mz-link-mid.mz-link-left.mz-link-empty { grid-template-areas: "win bar"; }
.mz-link-side.mz-link-mid:not(.mz-has-body) > .mz-text { margin-bottom: 8px; }
.mz-link-side.mz-link-mid .mz-link-win { align-self: center; }
/* 縮図を出さないリストの中の窓（D13）: 縮図の代わりに、押すと開くアイコン（外へ出る矢印）。線の色は文字と同じ */
.mz-link-icon .mz-link-win { box-shadow: none; border: 0; background: none; border-radius: 4px; }
.mz-link-icon .mz-link-win:hover { background: color-mix(in srgb, currentColor 12%, transparent); box-shadow: none; }
.mz-link-icon .mz-link-art, .mz-link-icon .mz-link-go { display: none; }
.mz-link-icon .mz-link-win::before { content: ""; position: absolute; inset: 2px; background: currentColor; opacity: 0.75;
  -webkit-mask: var(--mz-open-icon) center / contain no-repeat; mask: var(--mz-open-icon) center / contain no-repeat;
  --mz-open-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'/%3E%3C/svg%3E"); }
/* リストの子の中身の縮図（D13）: 持ち手は無く、押しても開かない（中身が見えるだけ） */
.mz-link-row .mz-link-bar { display: none; }
.mz-link-row .mz-link-win, .mz-preview .mz-link-row .mz-link-win { cursor: inherit; }
.mz-link-row .mz-link-win:hover { box-shadow: none; }
.mz-link-row .mz-link-go { display: none; }
.mz-preview .mz-link-win { cursor: pointer; }
.mz-tree { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
.mz-tree path { fill: none; stroke: var(--mz-edge); stroke-width: 1.5; }
.mz-tree .mz-tree-frame { stroke-width: 1.5; stroke-dasharray: 6 4; }
/* 絵の形（スティックマン・DB・サーバー・パソコンなど）: 背景なしで、決まった大きさの絵の足元に文字。
   絵は shape-art.ts、大きさは形の表（shapes.ts の art）を render.ts が --mz-art-w / --mz-art-h で渡す */
.mz-shape { display: none; }
.mz-leaf.mz-icon { flex-direction: column; justify-content: flex-start; gap: 2px; padding: 0 4px; }
.mz-icon > .mz-shape { display: block; flex: none; width: var(--mz-art-w); height: var(--mz-art-h); overflow: visible; }
.mz-icon .mz-shape path, .mz-icon .mz-shape rect { stroke-linejoin: round; }
.mz-icon .mz-shape .mz-art-line { stroke-linecap: round; }
.mz-icon .mz-art-dot { stroke: none; }
.mz-leaf.mz-icon .mz-text { color: var(--mz-text); text-shadow: none; line-height: 1.25; }
.mz-shape-person .mz-figure { fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
/* ひし形（フローチャートの分岐）: 形は SVG で描く。文字は幅の半分で折り返す（内側に収まる四角は縦横の半分。node-kinds.ts の DIAMOND_TEXT） */
.mz-leaf.mz-shape-diamond { padding: 0; background: transparent; overflow: visible; } /* 影を本体の四角で切らない */
.mz-shape-diamond > .mz-shape { display: block; position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.mz-shape-diamond > .mz-text { position: relative; max-width: calc(var(--mz-text-ratio, 1) * 100%); } /* 割合は形の表（shapes.ts の fit） */
/* 円・角丸・六角形・平行四辺形・台形（docs/PATTERN-plan.md の 3.7 章）: 輪郭は SVG で描く（render.ts の renderOutline）。
   円の文字は内側に収まる四角（直径の 1/√2）の中で折り返す（node-kinds.ts の円）。角丸は両端の半円の分、斜めの辺を持つ形は
   斜めの辺の食い込み（形の表 shapes.ts の slant。render.ts が --mz-slant で渡す）の分を、文字の左右の余白に足す */
.mz-leaf.mz-shape-circle, .mz-leaf.mz-shape-stadium, .mz-leaf.mz-shape-hexagon, .mz-leaf.mz-shape-parallelogram, .mz-leaf.mz-shape-parallelogramAlt, .mz-leaf.mz-shape-trapezoid, .mz-leaf.mz-shape-trapezoidAlt {
  background: transparent; overflow: visible; border-radius: 0;
}
.mz-leaf.mz-shape-circle { padding: 0; }
.mz-leaf.mz-shape-stadium { padding-inline: calc(8px + var(--mz-out-x, 0px) + 12px); }
.mz-leaf.mz-shape-hexagon, .mz-leaf.mz-shape-parallelogram, .mz-leaf.mz-shape-parallelogramAlt, .mz-leaf.mz-shape-trapezoid, .mz-leaf.mz-shape-trapezoidAlt { padding-inline: calc(8px + var(--mz-out-x, 0px) + var(--mz-slant, 0px)); }
.mz-leaf.mz-size-S.mz-shape-hexagon, .mz-leaf.mz-size-S.mz-shape-parallelogram, .mz-leaf.mz-size-S.mz-shape-parallelogramAlt, .mz-leaf.mz-size-S.mz-shape-trapezoid, .mz-leaf.mz-size-S.mz-shape-trapezoidAlt { padding-inline: calc(6px + var(--mz-out-x, 0px) + var(--mz-slant, 0px)); }
.mz-shape-circle > .mz-shape, .mz-shape-stadium > .mz-shape, .mz-shape-hexagon > .mz-shape, .mz-shape-parallelogram > .mz-shape, .mz-shape-parallelogramAlt > .mz-shape, .mz-shape-trapezoid > .mz-shape, .mz-shape-trapezoidAlt > .mz-shape {
  display: block; position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible;
}
.mz-shape-circle > .mz-text, .mz-shape-stadium > .mz-text, .mz-shape-hexagon > .mz-text, .mz-shape-parallelogram > .mz-text, .mz-shape-parallelogramAlt > .mz-text, .mz-shape-trapezoid > .mz-text, .mz-shape-trapezoidAlt > .mz-text { position: relative; }
.mz-shape-circle > .mz-text { max-width: calc(var(--mz-text-ratio, 1) * 100%); } /* 割合は形の表（shapes.ts の fit） */
/* ページの箱（タブ付きの見出し）。上の余白は耳の分（render.ts の renderPage と合わせる） */
/* クラスの箱（docs/CLASS-plan.md）。高さは classbox.ts の CLASS_HEAD・CLASS_ROW・CLASS_PAD と合わせる。文字は小さめで折り返さない */
.mz-class[hidden] { display: none; }
.mz-leaf.mz-shape-class { display: block; padding: 0; text-align: left; font-size: 11px; font-weight: 400; line-height: 16px; }
.mz-shape-class > .mz-text {
  height: 24px; line-height: 24px; padding: 0 8px; font-size: 12px; font-weight: 700; text-align: center;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.mz-class-abstract > .mz-text { font-style: italic; }
.mz-class-sec { border-top: 1px solid color-mix(in srgb, currentColor 35%, transparent); padding: 3px 0; }
.mz-class-row { height: 16px; padding: 0 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mz-class-row.mz-static { text-decoration: underline; }
.mz-class-row.mz-abstract { font-style: italic; }
/* 付け替えのドラッグ */
.mz-mode-reparent .mz-head { cursor: alias; }
.mz-mode-remove .mz-head { cursor: pointer; }
/* 削除モードでポインタを乗せたボックス: 一緒に消える範囲（子孫を含む）を赤い枠で示す */
.mz-node.mz-removing > .mz-head, .mz-node.mz-removing .mz-head { outline: 2px solid var(--mz-edge-del); outline-offset: 1px; }
.mz-node.mz-removing { opacity: 0.7; }
.mz-node.mz-lifted { opacity: 0.3; }
/* 画面の座標で置く（図の外のタブの上へ持っていっても、図の端で切れないように） */
.mz-ghost { position: fixed; z-index: 50; opacity: 0.8; pointer-events: none; filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.35)); }
.mz-ghost .mz-head { pointer-events: none; }
.mz-ghost.mz-ghost-no { opacity: 0.35; }
/* 追加モード: ポインタに付く新しい箱の影と、リストの子と子の間に差し込む線（docs/ADD-plan.md） */
.mz-mode-add, .mz-mode-add .mz-head { cursor: copy; }
.mz-add-ghost {
  position: fixed; z-index: 50; width: 120px; height: 64px; box-sizing: border-box; pointer-events: none;
  border: 2px dashed var(--mz-select); border-radius: 6px; background: color-mix(in srgb, var(--mz-select) 18%, transparent);
}
.mz-add-ghost.mz-ghost-no { opacity: 0.35; }
/* 道具入れの道具から入ったときは、足す形の絵を影の真ん中に出す（shape-icons.ts） */
.mz-add-ghost-icon { position: absolute; inset: 0; margin: auto; width: 36px; height: 36px; fill: none; stroke: var(--mz-select); stroke-width: 1.6; stroke-linejoin: round; }
.mz-add-ghost-icon.mz-art-icon * { vector-effect: non-scaling-stroke; stroke-width: 1.4px; }
.mz-add-ghost-icon .mz-art-dot { fill: var(--mz-select); stroke: none; }
/* AI が箱を示すフォーカス枠（D37。point-frame.ts）: 箱の外側に重ねる 2 色の枠（どの背景でも溶けないよう、テーマの focus の色と白の縁）。
   出たときに数回ふくらんで止まる */
.mz-point {
  position: absolute; z-index: 6; box-sizing: border-box; pointer-events: none; border-radius: 8px;
  box-shadow: 0 0 0 3px var(--mz-point), 0 0 0 5px #ffffff;
  animation: mz-point-pulse 0.7s ease-in-out 3;
}
@keyframes mz-point-pulse {
  50% { box-shadow: 0 0 0 5px var(--mz-point), 0 0 0 7px #ffffff, 0 0 18px 8px color-mix(in srgb, var(--mz-point) 55%, transparent); }
}
/* AI の問いの吹き出しと印（D36。ask-bubbles.ts）。色はテーマの ask（--mz-ask）、地は紙の色 */
.mz-ask-layer { position: absolute; left: 0; top: 0; width: 0; height: 0; z-index: 7; }
.mz-ask-bubble {
  position: absolute; box-sizing: border-box; width: max-content; max-width: calc(10em + 40px); padding: 7px 26px 8px 9px;
  background: var(--mz-paper); color: inherit; border: 1.5px solid var(--mz-ask); border-radius: 10px;
  font-size: 13px; font-weight: 400; line-height: 1.45; text-align: left; box-shadow: 0 4px 14px rgba(20, 40, 90, 0.18); cursor: default;
}
.mz-ask-bubble.mz-ask-only { padding-right: 26px; }
.mz-ask-text { margin: 0; overflow-wrap: anywhere; }
.mz-ask-btns { display: flex; gap: 6px; margin-top: 6px; }
.mz-ask-only .mz-ask-btns { margin-top: 0; }
.mz-ask-btn { font: inherit; font-size: 12px; padding: 3px 10px; border-radius: 6px; border: 1px solid var(--mz-ask); color: inherit; white-space: nowrap; cursor: pointer;
  background: color-mix(in srgb, var(--mz-ask) 12%, var(--mz-paper)); }
.mz-ask-btn.mz-ask-primary { background: var(--mz-ask); color: #fff; }
.mz-ask-ctl { position: absolute; top: 3px; right: 4px; width: 18px; height: 18px; padding: 0; border: 0; background: transparent; color: inherit; opacity: 0.55; font-size: 14px; line-height: 18px; cursor: pointer; }
.mz-ask-ctl:hover { opacity: 1; }
.mz-ask-id { position: absolute; top: -9px; left: -9px; width: 18px; height: 18px; border-radius: 50%; background: var(--mz-ask); color: #fff; font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 2px var(--mz-paper); }
.mz-ask-tail { position: absolute; width: 10px; height: 10px; background: var(--mz-paper); border: 1.5px solid var(--mz-ask); transform: rotate(45deg); }
.mz-ask-bubble[data-side="right"] .mz-ask-tail { left: -6.5px; top: 12px; border-right: 0; border-top: 0; }
.mz-ask-bubble[data-side="left"] .mz-ask-tail { right: -6.5px; top: 12px; border-left: 0; border-bottom: 0; }
.mz-ask-bubble[data-side="bottom"] .mz-ask-tail { top: -6.5px; left: 16px; border-right: 0; border-bottom: 0; }
.mz-ask-bubble[data-side="top"] .mz-ask-tail { bottom: -6.5px; left: 16px; border-left: 0; border-top: 0; }
.mz-ask-mark {
  position: absolute; width: 16px; height: 16px; padding: 0; border: 0; border-radius: 50%; background: var(--mz-ask); color: #fff;
  font: 700 10px/16px system-ui, sans-serif; text-align: center; box-shadow: 0 0 0 2px var(--mz-paper); cursor: pointer;
}
.mz-ask-mark::after { content: ""; position: absolute; inset: -4px; border-radius: 50%; border: 2px solid var(--mz-ask); opacity: 0; animation: mz-ask-ping 1.6s ease-out infinite; }
@keyframes mz-ask-ping { 0% { transform: scale(0.6); opacity: 0.9; } 100% { transform: scale(1.6); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .mz-ask-mark::after { animation: none; opacity: 0.5; } .mz-point { animation: none; } }
.mz-ask-bubble.mz-ask-flash, .mz-ask-mark.mz-ask-flash { --mz-point: var(--mz-ask); animation: mz-point-pulse 0.7s ease-in-out 2; }
.mz-add-line { position: fixed; z-index: 51; height: 3px; border-radius: 2px; pointer-events: none; background: var(--mz-select); }
.mz-node.mz-drop > .mz-head {
  outline: 3px solid var(--mz-select); outline-offset: 3px;
  box-shadow: 0 0 0 7px color-mix(in srgb, var(--mz-select) 25%, transparent) !important;
}
.mz-world.mz-drop { outline: 3px solid var(--mz-select); outline-offset: -4px; }
.mz-node.mz-dim { opacity: 0.35; }
.mz-node.mz-dragging { z-index: 10; opacity: 0.85; } /* 兄弟に重ねて通すので、下が透けて見えるように */
.mz-node.mz-dragging > .mz-head { cursor: grabbing; outline-color: var(--mz-edge-hi); }
.mz-node.mz-current > .mz-head { outline-color: var(--mz-select); }
/* 線を引く〇（docs/EDGE-TOOL-plan.md）。選択モードで、ポインタを乗せた箱の四辺に出す。押せる範囲は見た目より広く、辺まで届かせる */
.mz-port { position: fixed; z-index: 52; width: 20px; height: 20px; margin: -10px 0 0 -10px; cursor: crosshair; pointer-events: auto; }
.mz-port[hidden], .mz-stage:not(.mz-mode-move) .mz-port, .mz-preview .mz-port { display: none; }
.mz-port::after {
  content: ""; position: absolute; left: 5px; top: 5px; width: 10px; height: 10px; box-sizing: border-box; border-radius: 50%;
  border: 2px solid var(--mz-select); background: var(--mz-bg, #fff);
}
.mz-port:hover::after, .mz-port.mz-port-on::after { background: var(--mz-select); }
.mz-link-preview { position: fixed; inset: 0; width: 100%; height: 100%; z-index: 51; pointer-events: none; overflow: visible; }
.mz-link-preview line { stroke: var(--mz-select); stroke-width: 2; stroke-dasharray: 6 4; }
.mz-node.mz-link-target > .mz-head { outline: 3px solid var(--mz-select); outline-offset: 3px; }
.mz-node.mz-blocked { animation: mz-shake 0.18s; }
@keyframes mz-shake { 25% { translate: -2px 0; } 75% { translate: 2px 0; } }
/* プレビュー（見るだけ）: 押すと選ぶだけ。背景はつかんで見る範囲を動かす。線の区間や端をつまむ印は出さない */
.mz-preview { cursor: grab; }
/* 手のひら（D32）: どこでもつかめる（箱や線の上の指のカーソルも上書きする） */
.mz-mode-pan, .mz-mode-pan * { cursor: grab !important; }
.mz-mode-pan.mz-panning, .mz-mode-pan.mz-panning * { cursor: grabbing !important; }
.mz-mode-pan .mz-toolbox, .mz-mode-pan .mz-toolbox * { cursor: pointer !important; }
.mz-preview.mz-panning { cursor: grabbing; }
.mz-preview .mz-head, .mz-preview .mz-label-box > span { cursor: pointer; }
.mz-preview .mz-hit { pointer-events: stroke; cursor: pointer; }
.mz-preview .mz-bend, .mz-preview .mz-end { pointer-events: none; }
.mz-preview .mz-edge.mz-selected .mz-end { display: none; }
`;
