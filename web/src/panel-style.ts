// サイドバー（panel.ts）の見た目

export const STYLE_ID = "matomezu-panel-style";
export const PANEL_CSS = `
.mzp {
  --mzp-text: #e4e4e7;
  --mzp-muted: rgba(228, 228, 231, 0.6);
  --mzp-line: rgba(255, 255, 255, 0.08);
  --mzp-control: #3a3a3f;
  --mzp-control-hover: #4a4a50;
  --mzp-accent: #8b6cf0;
  color: var(--mzp-text);
  font-size: 13px;
  line-height: 1.5;
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) .mzp {
    --mzp-text: #1b1b1f;
    --mzp-muted: rgba(27, 27, 31, 0.6);
    --mzp-line: rgba(0, 0, 0, 0.1);
    --mzp-control: #ececf0;
    --mzp-control-hover: #dedee4;
    --mzp-accent: #6d4bd8;
  }
}
.mzp-head { display: flex; align-items: center; gap: 8px; padding: 14px 16px 10px; }
.mzp-swatch {
  width: 14px; height: 14px; border-radius: 4px; flex: none;
  box-shadow: inset 0 0 0 1px var(--mzp-line);
}
.mzp-title { font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mzp-kind {
  margin-left: auto; flex: none; font-size: 11px; padding: 1px 8px; border-radius: 999px;
  background: var(--mzp-control); color: var(--mzp-muted);
}
.mzp-section { padding: 10px 16px 12px; border-top: 1px solid var(--mzp-line); }
.mzp-section h3 {
  margin: 0 0 8px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
  color: var(--mzp-muted);
}
.mzp-dl { display: grid; grid-template-columns: 72px 1fr; gap: 4px 8px; margin: 0; }
.mzp-dl dt { color: var(--mzp-muted); }
.mzp-dl dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.mzp-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.mzp-chip {
  font: inherit; font-size: 12px; color: inherit; cursor: pointer;
  background: var(--mzp-control); border: 0; border-radius: 4px; padding: 1px 8px;
}
.mzp-chip:hover { background: var(--mzp-control-hover); }
.mzp-chip:disabled { opacity: 0.45; cursor: not-allowed; background: var(--mzp-control); }
.mzp-hint + .mzp-field { margin-top: 10px; }
.mzp-color-btn { display: flex; align-items: center; gap: 8px; text-align: left; cursor: pointer; min-height: 30px; }
.mzp-color-btn .mzp-swatch { width: 16px; height: 16px; border-radius: 4px; }
.mzp-palette .mzp-chip[aria-pressed="true"] { outline: 2px solid var(--mzp-accent); outline-offset: 1px; }
.mzp-none { color: var(--mzp-muted); }
.mzp-check, .mzp-radio { display: flex; align-items: center; gap: 8px; padding: 3px 0; cursor: pointer; }
.mzp-radio.mzp-disabled { opacity: 0.45; cursor: not-allowed; }
.mzp-note { font-size: 11px; color: var(--mzp-muted); margin: 2px 0 0 24px; }
.mzp-field { display: grid; grid-template-columns: 72px 1fr; align-items: center; gap: 8px; margin-bottom: 8px; }
.mzp-field > span { color: var(--mzp-muted); }
.mzp-input {
  width: 100%; min-width: 0; box-sizing: border-box; font: inherit; color: inherit;
  background: var(--mzp-control); border: 1px solid var(--mzp-line); border-radius: 6px; padding: 5px 8px;
}
.mzp-input:focus { outline: 2px solid var(--mzp-accent); outline-offset: -1px; }
.mzp-color { display: flex; gap: 6px; min-width: 0; }
.mzp-picker {
  width: 32px; height: 30px; flex: none; padding: 2px; cursor: pointer;
  background: var(--mzp-control); border: 1px solid var(--mzp-line); border-radius: 6px;
}
.mzp-presets { display: flex; flex-wrap: wrap; gap: 6px; margin-left: 80px; }
.mzp-preset {
  width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--mzp-line);
}
.mzp-preset[aria-pressed="true"] { outline: 2px solid var(--mzp-accent); outline-offset: 2px; }
.mzp-seg { display: flex; border-radius: 6px; overflow: hidden; background: var(--mzp-control); }
.mzp-seg label { flex: 1; text-align: center; padding: 4px 2px; cursor: pointer; white-space: nowrap; font-size: 12px; }
.mzp-seg label:hover { background: var(--mzp-control-hover); }
.mzp-seg input { position: absolute; opacity: 0; pointer-events: none; }
.mzp-seg label:has(input:checked) { background: var(--mzp-accent); color: #fff; }
.mzp-seg label:has(input:focus-visible) { outline: 2px solid var(--mzp-accent); outline-offset: -2px; }
.mzp-hint { font-size: 11px; color: var(--mzp-muted); margin: 6px 0 0; }
.mzp-subhead { font-size: 11px; color: var(--mzp-muted); margin: 10px 0 4px; }
.mzp-search {
  position: sticky; top: 0; z-index: 1; padding: 8px 12px; background: inherit; border-bottom: 1px solid var(--mzp-line);
}
.mzp-search input { width: 100%; }
.mzp-row[hidden] { display: none; }
.mzp-tabs {
  position: sticky; top: 0; z-index: 1; display: flex; gap: 4px; padding: 8px 12px 0;
  background: inherit; border-bottom: 1px solid var(--mzp-line);
}
.mzp-tab {
  font: inherit; font-size: 12px; color: var(--mzp-muted); cursor: pointer;
  background: none; border: 0; border-bottom: 2px solid transparent; padding: 6px 10px; margin-bottom: -1px;
}
.mzp-tab:hover { color: var(--mzp-text); background: none; }
.mzp-tab[aria-selected="true"] { color: var(--mzp-text); border-bottom-color: var(--mzp-accent); font-weight: 600; }
.mzp-pane[hidden] { display: none; }
.mzp-pane > .mzp-section:first-child { border-top: 0; }
.mzp-fold > summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 6px; }
.mzp-fold > summary::-webkit-details-marker { display: none; }
.mzp-fold > summary::before {
  content: "▶"; font-size: 8px; line-height: 1; color: var(--mzp-muted); transition: transform 0.15s;
}
.mzp-fold[open] > summary::before { transform: rotate(90deg); }
.mzp-fold > summary h3 { margin: 0; }
.mzp-fold[open] > summary { margin-bottom: 8px; }
.mzp-fold > summary:hover h3 { color: var(--mzp-text); }
.mzp-list { list-style: none; margin: 0; padding: 0; }
.mzp-subfold { margin: 0 0 10px 4px; }
.mzp-subfold > summary h3 { font-size: 12px; }
.mzp-here { margin-left: 6px; font-size: 11px; color: var(--mzp-hint); font-weight: normal; }
.mzp-elsewhere { cursor: default; }
.mzp-seg label.mzp-disabled { opacity: 0.35; cursor: not-allowed; }
.mzp-danger { color: #fff; background: #dc2626; border-color: transparent; }
.mzp-danger:hover { background: #b91c1c; }
.mzp-row {
  display: flex; align-items: center; gap: 8px; padding: 3px 4px 3px 6px; border-radius: 6px; min-width: 0;
}
.mzp-row:hover { background: var(--mzp-control); }
.mzp-row[data-select] { cursor: pointer; }
.mzp-row[draggable="true"] { cursor: grab; }
.mzp-row .mzp-swatch { width: 10px; height: 10px; border-radius: 3px; }
.mzp-row-text { display: flex; flex-direction: column; min-width: 0; flex: 1; line-height: 1.3; }
.mzp-row-cap { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mzp-row-parent { font-size: 11px; color: var(--mzp-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mzp-removed .mzp-row-cap { color: var(--mzp-muted); text-decoration: line-through; }
.mzp-del {
  flex: none; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 4px; cursor: pointer;
  font: inherit; font-size: 15px; line-height: 22px; color: var(--mzp-muted); background: none;
  visibility: hidden;
}
.mzp-row:hover .mzp-del, .mzp-del:focus-visible { visibility: visible; }
.mzp-del:hover { color: #fff; background: #dc2626; }
`;
