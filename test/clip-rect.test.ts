// 要素の見えている部分（clip-rect.ts。D36・D37）。happy-dom には配置の計算が無いので、位置と大きさは要素ごとに差し替える
import { afterEach, expect, test } from "bun:test";
import { visibleRect } from "../web/src/clip-rect";

afterEach(() => { document.body.innerHTML = ""; });

// 画面の座標の四角を持たせる。scroll を渡せば、中身の大きさ（scrollWidth・scrollHeight）と見えている大きさ（clientWidth・clientHeight）も
function place(el: HTMLElement, left: number, top: number, w: number, h: number, scroll?: { sw: number; sh: number }) {
  el.getBoundingClientRect = () => ({ left, top, right: left + w, bottom: top + h, width: w, height: h, x: left, y: top, toJSON() {} }) as DOMRect;
  const def = (k: string, v: number) => Object.defineProperty(el, k, { configurable: true, get: () => v });
  def("clientWidth", w); def("clientHeight", h);
  def("scrollWidth", scroll?.sw ?? w); def("scrollHeight", scroll?.sh ?? h);
}

// stop（ワールド）> list（スクロールするリスト）> row（行）
function tree(listOverflow = "auto") {
  const stop = document.createElement("div");
  const list = document.createElement("div");
  // happy-dom は overflow の一括指定を overflowX・overflowY に分けないので、両方を書く
  list.style.overflowX = listOverflow; list.style.overflowY = listOverflow;
  const row = document.createElement("div");
  list.appendChild(row);
  stop.appendChild(list);
  document.body.appendChild(stop);
  return { stop, list, row };
}

test("スクロールしない入れ物の中なら、要素の四角をそのまま返す", () => {
  const { stop, list, row } = tree();
  place(list, 0, 0, 100, 100); // 中身が収まっている（scrollHeight = clientHeight）
  place(row, 10, 80, 50, 40);  // 入れ物の下へはみ出しているが、入れ物はスクロールしないので切らない
  expect(visibleRect(row, stop)).toEqual({ left: 10, top: 80, right: 60, bottom: 120, hidden: false });
});

test("overflow が visible の入れ物は、中身があふれていても切らない", () => {
  const { stop, list, row } = tree("visible");
  place(list, 0, 0, 100, 100, { sw: 100, sh: 300 });
  place(row, 10, 80, 50, 40);
  expect(visibleRect(row, stop).bottom).toBe(120);
});

test("スクロールするリストの中で一部だけ見えている行は、リストの枠で切る", () => {
  const { stop, list, row } = tree();
  place(list, 0, 0, 100, 100, { sw: 100, sh: 300 });
  place(row, 10, 80, 50, 40);
  expect(visibleRect(row, stop)).toEqual({ left: 10, top: 80, right: 60, bottom: 100, hidden: false });
});

test("スクロールして見えなくなった行は hidden で、リストの中の行がある側の端に寄せた高さ 1 の四角を返す", () => {
  const { stop, list, row } = tree();
  place(list, 0, 0, 100, 100, { sw: 100, sh: 300 });
  place(row, 10, 150, 50, 40); // リストの下の外
  expect(visibleRect(row, stop)).toEqual({ left: 10, top: 99, right: 60, bottom: 100, hidden: true });
  place(row, 10, -80, 50, 40); // リストの上の外
  expect(visibleRect(row, stop)).toEqual({ left: 10, top: 0, right: 60, bottom: 1, hidden: true });
});

test("横にスクロールして見えなくなった行は、左右の端に寄せ、幅はリストの右の端を越えない", () => {
  const { stop, list, row } = tree();
  place(list, 0, 0, 100, 100, { sw: 400, sh: 100 });
  place(row, 150, 10, 50, 20); // 右の外
  const r = visibleRect(row, stop);
  expect(r.hidden).toBe(true);
  expect([r.left, r.right]).toEqual([100, 100]);
});

test("stop より外の入れ物では切らない（ワールドより外の枠はたどらない）", () => {
  const outer = document.createElement("div");
  outer.style.overflowX = outer.style.overflowY = "auto";
  const { stop, list, row } = tree();
  outer.appendChild(stop);
  document.body.appendChild(outer);
  place(outer, 0, 0, 20, 20, { sw: 500, sh: 500 }); // 切れば見えなくなる
  place(list, 0, 0, 100, 100);
  place(row, 10, 30, 50, 40);
  expect(visibleRect(row, stop)).toEqual({ left: 10, top: 30, right: 60, bottom: 70, hidden: false });
});

test("入れ子のスクロールは、内側と外側の両方で切る", () => {
  const { stop, list, row } = tree();
  const inner = document.createElement("div");
  inner.style.overflowX = inner.style.overflowY = "auto";
  list.appendChild(inner);
  inner.appendChild(row);
  place(list, 0, 0, 100, 100, { sw: 100, sh: 300 });
  place(inner, 0, 50, 80, 200, { sw: 80, sh: 400 });
  place(row, 10, 90, 100, 40);
  expect(visibleRect(row, stop)).toEqual({ left: 10, top: 90, right: 80, bottom: 100, hidden: false });
});
