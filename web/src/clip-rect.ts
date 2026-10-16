// 要素の見えている部分（D36・D37）: 祖先のスクロールする入れ物（リストのスクロールなど）で切り取った範囲。
// 図の上の層（フォーカス枠・吹き出し）が、リストの中でスクロールして見えなくなった行を追ってリストの外へ飛ばないように使う。
// 画面の座標で返す。見えていなければ、入れ物の中に寄せた（端に押し付けた）位置で hidden: true

export interface ClipRect { left: number; top: number; right: number; bottom: number; hidden: boolean }

// 入れ物が中身を切るか（overflow が visible でない）。毎フレーム何度も読むので覚えておく（overflow は描き直しで変わらない）
const clips = new WeakMap<Element, boolean>();
function clipsContent(p: Element): boolean {
  let v = clips.get(p);
  if (v == null) {
    const s = getComputedStyle(p);
    v = s.overflowX !== "visible" || s.overflowY !== "visible";
    clips.set(p, v);
  }
  return v;
}

export function visibleRect(el: Element, stop: Element): ClipRect {
  const r = el.getBoundingClientRect();
  let { left, top, right, bottom } = r;
  for (let p = el.parentElement; p && p !== stop; p = p.parentElement) {
    if (!clipsContent(p) || (p.scrollHeight <= p.clientHeight && p.scrollWidth <= p.clientWidth)) continue; // スクロールしない入れ物は切らない
    const c = p.getBoundingClientRect();
    left = Math.max(left, c.left); top = Math.max(top, c.top);
    right = Math.min(right, c.right); bottom = Math.min(bottom, c.bottom);
    if (right <= left || bottom <= top) {
      // 見えていない: 入れ物の中の、要素がある側の端に寄せる
      const x = Math.min(Math.max(r.left, c.left), c.right), y = Math.min(Math.max(r.top, c.top), c.bottom - 1);
      return { left: x, top: y, right: Math.min(c.right, x + r.width), bottom: y + 1, hidden: true };
    }
  }
  return { left, top, right, bottom, hidden: false };
}
