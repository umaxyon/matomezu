// 大きさが変わったときの押し込み（layout/squeeze.ts。docs/PAPER-plan.md の 4.6）: 試しに並べずに計算だけで、
// 向きを変えずに押して収まるか（折り返さないか）と、どの箱をどれだけ動かすかを出す
import { expect, test } from "bun:test";
import { type SqBox, type SqOptions, type SqRoot, canSqueeze } from "../web/src/layout/squeeze";
import { PAPERS } from "../web/src/validate";

const PAD = 12;
const A4 = PAPERS["a4-landscape"];
const paper = (kids: SqBox[]): SqRoot => ({ kids, inner: { left: PAD, top: PAD, right: A4.w - PAD, bottom: A4.h - PAD }, fixed: true });
const box = (id: number, x: number, y: number, w: number, h: number, nw?: number, nh?: number): SqBox => ({ id, x, y, w, h, nw, nh });
// 線でつながった組（キャプションなし 32・あり 40）。ほかは 8
const gaps = (linked: [number, number, number][] = []): SqOptions["gapOf"] => (a, b) =>
  linked.find(([p, q]) => (p === a && q === b) || (p === b && q === a))?.[2] ?? 8;
const START: SqOptions["from"] = { x: "start", y: "start" };
const CENTER: SqOptions["from"] = { x: "center", y: "start" };

function fit(root: SqRoot, from = START, gap = gaps()) {
  const r = canSqueeze(root, { from, gapOf: gap });
  if (!r.fits) throw new Error(`入らなかった: ${JSON.stringify(r)}`);
  return (id: number) => r.boxes.get(id)!;
}

test("紙の右端の箱が広がると、左の余裕を使って内側へ押し戻される（右に押し出して断らない）", () => {
  const at = fit(paper([box(1, 12, 100, 120, 64, 128, 72), box(2, A4.w - PAD - 120, 100, 120, 64, 128, 72)]));
  expect(at(2)).toEqual({ x: A4.w - PAD - 128, y: 100, w: 128, h: 72 });
  expect(at(1).x).toBe(12);
});

test("押し込んでも入らない（端から端への列が紙より長い）なら fits: false。向き・列・足りない px を返す", () => {
  const r = canSqueeze(paper([box(1, 12, 100, 360, 64, 364), box(2, 380, 100, 360, 64, 364), box(3, 748, 100, 360, 64, 364)]), { from: START, gapOf: gaps() });
  expect(r).toEqual({ fits: false, axis: "x", chain: [1, 2, 3], short: 12 + 364 * 3 + 8 * 2 - (A4.w - PAD) });
});

test("左上起点: 右へ育つと、同じ段の右の箱だけを右へ押す。下の段の箱は動かさない（折り返さない）", () => {
  const at = fit(paper([box(1, 12, 100, 120, 64, 200), box(2, 140, 100, 120, 64), box(3, 12, 300, 120, 64)]));
  expect(at(1)).toEqual({ x: 12, y: 100, w: 200, h: 64 });
  expect(at(2)).toEqual({ x: 12 + 200 + 8, y: 100, w: 120, h: 64 });
  expect(at(3)).toEqual({ x: 12, y: 300, w: 120, h: 64 });
});

test("中央起点: 真ん中の箱が育つと真ん中を保ち、左右の箱を半分ずつ押す", () => {
  const at = fit(paper([box(1, 100, 100, 100, 40), box(2, 208, 100, 100, 40, 140), box(3, 316, 100, 100, 40)]), CENTER);
  expect(at(2).x + at(2).w / 2).toBe(208 + 50);
  expect(at(1).x).toBe(100 - 20);
  expect(at(3).x).toBe(316 + 20);
  expect(at(2).x - (at(1).x + at(1).w)).toBe(8);
  expect(at(3).x - (at(2).x + at(2).w)).toBe(8);
});

test("線でつながった箱どうしは、間隔の下限（32・キャプションありは 40）まで寄る", () => {
  const at = fit(paper([box(1, 12, 100, 120, 64, 136), box(2, 172, 100, 120, 64)]), START, gaps([[1, 2, 32]]));
  expect(at(2).x).toBe(12 + 136 + 32);
  const cap = fit(paper([box(1, 12, 100, 120, 64, 136), box(2, 172, 100, 120, 64)]), START, gaps([[1, 2, 40]]));
  expect(cap(2).x).toBe(12 + 136 + 40);
});

test("縦に並ぶ箱は、縦にだけ押す", () => {
  const at = fit(paper([box(1, 12, 12, 100, 40, 100, 48), box(2, 12, 60, 100, 40)]));
  expect(at(2)).toEqual({ x: 12, y: 12 + 48 + 8, w: 100, h: 40 });
});

test("斜めに離れた組は、近づいて反対の向きでも重なったときだけ、離れていた向きに押す", () => {
  // 横にも縦にも 8px 離れている。広がると縦の範囲が重なるので、横へ押す（縦にはずらさない）
  const at = fit(paper([box(1, 12, 12, 100, 40, 104, 44), box(2, 120, 60, 100, 40)]));
  expect(at(2)).toEqual({ x: 12 + 104 + 8, y: 60, w: 100, h: 40 });
  // 遠い斜めの箱は動かさない
  const far = fit(paper([box(1, 12, 12, 100, 40, 104, 44), box(2, 300, 300, 100, 40)]));
  expect(far(2)).toEqual({ x: 300, y: 300, w: 100, h: 40 });
});

// グループ（子を自由に置く箱）: 内側の範囲は、左右 12・上は見出しの下の 30・下 12
const group = (id: number, x: number, y: number, w: number, h: number, kids: SqBox[]): SqBox =>
  ({ id, x, y, w, h, kids, inner: { left: 12, top: 30, right: w - 12, bottom: h - 12 } });

test("グループの中に余裕があれば、左の余裕も使って中で詰め、グループは広がらない。足りない向きだけ広がる（左上起点は下へ）", () => {
  const g = group(1, 100, 100, 332, 106, [box(2, 60, 30, 120, 64, 128, 72), box(3, 200, 30, 120, 64, 128, 72)]);
  const at = fit(paper([g]));
  expect(at(3).x).toBe(320 - 128); // 右の壁に当たって内側へ
  expect(at(2).x).toBe(320 - 128 - 8 - 128); // 間を下限まで詰めて、左の余裕を使う
  expect(at(1)).toEqual({ x: 100, y: 100, w: 332, h: 106 + 8 }); // 横は広がらず、縦は余裕が無いので下へ 8
});

test("グループの中で詰めても入らなければ、グループが起点に従って広がり、広がったグループが同じ段の隣を押す", () => {
  const kids = () => [box(3, 12, 30, 176, 58, 200)];
  const start = fit(paper([group(1, 12, 100, 200, 100, kids()), box(2, 220, 100, 100, 40)]));
  expect(start(1)).toEqual({ x: 12, y: 100, w: 224, h: 100 });
  expect(start(2).x).toBe(12 + 224 + 8);
  expect(start(3).x).toBe(12);
  // 中央起点: グループは左右に広がり、中の子はグループの中で真ん中を保つ
  const center = fit(paper([group(1, 300, 100, 200, 100, kids()), box(2, 508, 100, 100, 40)]), CENTER);
  const [g, s, k] = [center(1), center(2), center(3)];
  expect(g.w).toBe(224);
  expect(k.x).toBe(12);
  expect(g.x).toBeLessThan(300);
  expect(s.x - (g.x + g.w)).toBe(8);
});

test("内側のグループが広がった結果、紙からはみ出すなら fits: false（最上位で判定）", () => {
  const right = A4.w - PAD;
  const r = canSqueeze(paper([group(1, right - 200, 100, 200, 100, [box(2, 12, 30, 176, 58, 200)]), box(3, 12, 100, right - 200 - 8 - 12, 40)]), { from: START, gapOf: gaps() });
  expect(r.fits).toBe(false);
  if (!r.fits) {
    expect(r.axis).toBe("x");
    expect(r.chain).toEqual([3, 1]);
    expect(r.short).toBe(24);
  }
});

test("大きさの決まっていない入れ物（紙の無いページ）は広がるので、いつも入る", () => {
  const r = canSqueeze({ ...paper([box(1, 12, 100, 360, 64, 2000)]), fixed: false }, { from: START, gapOf: gaps() });
  expect(r.fits).toBe(true);
});

test("大きさが変わらなければ、どの箱も動かない", () => {
  const kids = [box(1, 12, 12, 100, 40), box(2, 120, 12, 100, 40), group(3, 300, 300, 92, 82, [box(4, 20, 40, 60, 30)])];
  const at = fit(paper(kids));
  expect(at(1)).toEqual({ x: 12, y: 12, w: 100, h: 40 });
  expect(at(2)).toEqual({ x: 120, y: 12, w: 100, h: 40 });
  expect(at(3)).toEqual({ x: 300, y: 300, w: 92, h: 82 });
  expect(at(4)).toEqual({ x: 20, y: 40, w: 60, h: 30 });
});

test("縦横とも中央起点（中央の根から四方へ伸びる並び）: 真ん中の箱が育つと、上下左右の箱を半分ずつ押す", () => {
  const BOTH: SqOptions["from"] = { x: "center", y: "center" };
  const at = fit(paper([box(1, 300, 300, 100, 40, 140, 60), box(2, 192, 300, 100, 40), box(3, 408, 300, 100, 40), box(4, 300, 252, 100, 40), box(5, 300, 348, 100, 40)]), BOTH);
  expect(at(1)).toEqual({ x: 280, y: 290, w: 140, h: 60 });
  expect([at(2).x, at(3).x, at(4).y, at(5).y]).toEqual([192 - 20, 408 + 20, 252 - 10, 348 + 10]);
  expect([at(2).y, at(3).y, at(4).x, at(5).x]).toEqual([300, 300, 300, 300]);
});

test("グループの最小の大きさ（本文の幅など）が今より大きければ、その分だけ起点に従って広がり、同じ段の隣を押す", () => {
  const g = { ...group(1, 12, 100, 200, 100, [box(3, 12, 30, 100, 58)]), minW: 260 };
  const at = fit(paper([g, box(2, 220, 100, 100, 40)]));
  expect(at(1)).toEqual({ x: 12, y: 100, w: 260, h: 100 });
  expect(at(2).x).toBe(12 + 260 + 8);
});

test("押される前にいた位置（home）があれば、そこから押す。相手が縮めば戻り、そこより先へは動かない", () => {
  // 2 は 1 に押されて右にいる（前は x 140）。1 が元の大きさに戻ると、2 は 140 へ戻る
  const back = fit(paper([box(1, 12, 100, 200, 64, 120), { ...box(2, 220, 100, 120, 64), home: { x: 140 } }]));
  expect(back(2).x).toBe(140);
  // 1 がまだ少し大きければ、空いた所まで
  const part = fit(paper([box(1, 12, 100, 200, 64, 160), { ...box(2, 220, 100, 120, 64), home: { x: 140 } }]));
  expect(part(2).x).toBe(12 + 160 + 8);
});

test("グループの大きさは中身から決まる: 中の箱が縮めばグループも縮み、押していた下の箱は戻る", () => {
  // グループ 1 は子 3 が高かったので高い（h 160）。子が 58 に縮むと 100 になり、下の 2（前は y 208）は戻る
  const g = group(1, 12, 100, 200, 160, [box(3, 12, 30, 176, 118, 176, 58)]);
  const at = fit(paper([g, { ...box(2, 12, 268, 100, 40), home: { y: 208 } }]));
  expect(at(1).h).toBe(100);
  expect(at(2).y).toBe(208);
});
