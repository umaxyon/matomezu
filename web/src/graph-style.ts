export const GRAPH_STYLE_ID = "matomezu-graph-style";

export const GRAPH_CSS = `
.mz-stage {
  --mz-edge: rgba(180, 180, 190, 0.4);
  --mz-edge-hi: rgba(200, 180, 255, 0.9);
  --mz-edge-del: #f87171;
  --mz-text: #e4e4e7;
  --mz-select: #c4b5fd;
  --mz-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  position: relative;
  overflow: auto;
  user-select: none;
  -webkit-user-select: none;
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) .mz-stage {
    --mz-edge: rgba(90, 90, 110, 0.4);
    --mz-edge-hi: rgba(120, 80, 220, 0.9);
    --mz-edge-del: #dc2626;
    --mz-text: #1b1b1f;
    --mz-select: #6d4bd8;
    --mz-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
  }
}
.mz-world { position: absolute; left: 0; top: 0; }
.mz-world.mz-current { outline: 2px dashed var(--mz-select); outline-offset: -3px; }
.mz-world.mz-ov-clip { overflow: hidden; }
.mz-world > svg {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 5; overflow: visible;
}
.mz-line {
  stroke: var(--mz-edge); stroke-width: 1.5;
  transition: stroke 0.15s, stroke-width 0.15s, opacity 0.15s;
}
.mz-hit { stroke: transparent; stroke-width: 12; pointer-events: stroke; cursor: pointer; }
.mz-edge.mz-hi .mz-line { stroke: var(--mz-edge-hi); stroke-width: 2.2; }
.mz-edge.mz-dim .mz-line { opacity: 0.25; }
.mz-edge:hover .mz-line { stroke: var(--mz-edge-del); stroke-width: 2.5; stroke-dasharray: 6 4; opacity: 1; }
.mz-node { position: absolute; pointer-events: none; transition: opacity 0.15s; }
.mz-node.mz-clip { overflow: hidden; }
.mz-head {
  position: absolute;
  box-sizing: border-box;
  border-radius: 8px;
  pointer-events: auto;
  cursor: grab; touch-action: none;
  color: var(--mz-text);
  outline: 2px solid transparent; outline-offset: 3px;
  transition: outline-color 0.15s;
}
.mz-leaf {
  display: flex; align-items: center; justify-content: center;
  padding: 4px 8px; text-align: center;
  font-size: 14px; font-weight: 600; line-height: 1.3;
  overflow: hidden;
}
.mz-leaf.mz-size-S { font-size: 12px; padding: 2px 6px; border-radius: 6px; }
.mz-leaf.mz-light { color: #fff; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35); }
.mz-leaf.mz-dark { color: #1b1b1f; }
.mz-text { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
.mz-leaf.mz-ov-grow .mz-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mz-leaf.mz-ov-clip .mz-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mz-group > .mz-caption {
  position: absolute; left: 0; right: 0; top: 0;
  padding: 0 10px; font-size: 13px; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mz-group.mz-size-S > .mz-caption { font-size: 11px; }
.mz-more { position: absolute; right: 5px; bottom: 3px; font-size: 9px; line-height: 1; opacity: 0.8; }
.mz-tree { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
.mz-tree path { fill: none; stroke: var(--mz-edge); stroke-width: 1.5; }
.mz-tree .mz-tree-frame { stroke-width: 1.5; stroke-dasharray: 6 4; }
/* 形: スティックマン（背景なし、人の形の足元に文字）と DB（円柱。胴の中央に文字） */
.mz-shape { display: none; }
.mz-leaf.mz-shape-person { flex-direction: column; justify-content: flex-start; gap: 2px; padding: 0 4px; }
.mz-shape-person > .mz-shape { display: block; flex: none; width: 36px; height: 52px; overflow: visible; }
.mz-size-M.mz-shape-person > .mz-shape { width: 32px; height: 46px; }
.mz-size-S.mz-shape-person > .mz-shape { width: 26px; height: 38px; }
.mz-shape-person .mz-figure { fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.mz-leaf.mz-shape-person .mz-text { color: var(--mz-text); text-shadow: none; line-height: 1.25; }
/* 上は上面の楕円（縦の半径 8px、S は 6px）の分、下は底の楕円の手前半分の分をあける */
.mz-leaf.mz-shape-db { padding-top: 18px; padding-bottom: 10px; }
.mz-leaf.mz-size-S.mz-shape-db { padding-top: 14px; padding-bottom: 7px; }
.mz-shape-db > .mz-shape { display: block; position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.mz-shape-db > .mz-text { position: relative; }
.mz-node.mz-dim { opacity: 0.35; }
.mz-node.mz-dragging { z-index: 10; }
.mz-node.mz-dragging > .mz-head { cursor: grabbing; outline-color: var(--mz-edge-hi); }
.mz-node.mz-current > .mz-head { outline-color: var(--mz-select); }
.mz-node.mz-linking > .mz-head { outline: 2px dashed var(--mz-select); }
.mz-node.mz-blocked { animation: mz-shake 0.18s; }
@keyframes mz-shake { 25% { translate: -2px 0; } 75% { translate: 2px 0; } }
`;
