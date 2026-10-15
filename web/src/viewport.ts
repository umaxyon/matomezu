// 画面の見え方（D32）: 図の枠のスクロールの位置と、ワールドの座標の行き来。
// ワールドは図の枠の中で周りの余白（margin）の分だけずらして置き、倍率（zoom）は transform: scale でかける（graph.ts）。
// なので、スクロールの位置 = 余白 + ワールドの座標 × 倍率。この行き来はここだけに書く（preview.ts・minimap.ts・graph.ts が使う）
//
//   const v = graph.view();                 // { zoom, margin }
//   visibleWorld(stage, v);                 // 見えている範囲（ワールドの座標）
//   scrollWorldTo(stage, v, x, y);          // ワールドの (x, y) が見えている範囲の左上に来るようにスクロールする
//   const a = anchorAt(stage, v, at);       // at（画面の座標。無ければ見えている範囲の真ん中）の下のワールドの点を覚え、
//   keepAnchor(stage, nextView, a);         // 倍率を変えたあと、その点が同じ所に来るようにスクロールする

export interface View {
  zoom: number;   // ワールドにかけている倍率
  margin: number; // 図の周りの余白（px。倍率をかけない）
}

export interface Rect { x: number; y: number; w: number; h: number }

// スクロールの位置（px）とワールドの座標
export const toScroll = (v: View, world: number): number => v.margin + world * v.zoom;
export const fromScroll = (v: View, scroll: number): number => (scroll - v.margin) / v.zoom;

// 見えている範囲（ワールドの座標）
export function visibleWorld(stage: HTMLElement, v: View): Rect {
  return {
    x: fromScroll(v, stage.scrollLeft), y: fromScroll(v, stage.scrollTop),
    w: stage.clientWidth / v.zoom, h: stage.clientHeight / v.zoom,
  };
}

// ワールドの (x, y) が見えている範囲の左上に来るようにスクロールする（はみ出さないようにブラウザが収める）
export function scrollWorldTo(stage: HTMLElement, v: View, x: number, y: number): void {
  stage.scrollTo({ left: toScroll(v, x), top: toScroll(v, y) });
}

// 画面の点 at（無ければ見えている範囲の真ん中）と、その下のワールドの点
export interface Anchor { px: number; py: number; wx: number; wy: number }

export function anchorAt(stage: HTMLElement, v: View, at?: { x: number; y: number }): Anchor {
  const r = stage.getBoundingClientRect();
  const px = at ? at.x - r.left : stage.clientWidth / 2;
  const py = at ? at.y - r.top : stage.clientHeight / 2;
  return { px, py, wx: fromScroll(v, stage.scrollLeft + px), wy: fromScroll(v, stage.scrollTop + py) };
}

// 見え方が v になったあと、覚えたワールドの点が、覚えた画面の点に来るようにスクロールする
export function keepAnchor(stage: HTMLElement, v: View, a: Anchor): void {
  stage.scrollLeft = toScroll(v, a.wx) - a.px;
  stage.scrollTop = toScroll(v, a.wy) - a.py;
}
