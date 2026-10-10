// ひし形（フローチャートの分岐の形）を実際のブラウザで確かめる
import { expect, test } from "@playwright/test";
import { dragBy, openDiagram, violations } from "./helpers";

test.afterEach(async ({ page }) => {
  expect(await violations(page)).toEqual([]);
});

// 線を選ぶ（最初の区間の真ん中を押す。折れ線の外枠の真ん中は、線の上とは限らないため）
async function selectLine(page: import("@playwright/test").Page, id: string) {
  const [p, q] = await page.locator(`.mz-edge[data-id="${id}"] .mz-line`).evaluate(l =>
    (l.getAttribute("points") ?? "").trim().split(/\s+/).slice(0, 2).map(v => v.split(",").map(Number)));
  const world = (await page.locator(".mz-world").boundingBox())!;
  await page.mouse.click(world.x + (p![0]! + q![0]!) / 2, world.y + (p![1]! + q![1]!) / 2);
}

test("文字はひし形の内側に収まり、線は頂点につながる", async ({ page }) => {
  await openDiagram(page, {
    nodes: [
      { id: 1, caption: "在庫は十分にあるか確認する", shape: "diamond", x: 40, y: 40 },
      { id: 2, caption: "はい", x: 500, y: 60 },
    ],
    edges: [{ from: 1, to: 2 }],
  });
  const r = await page.locator('.mz-node[data-id="1"] > .mz-head').evaluate(h => {
    const hr = h.getBoundingClientRect();
    const tr = h.querySelector(".mz-text")!.getBoundingClientRect();
    const cx = hr.left + hr.width / 2, cy = hr.top + hr.height / 2;
    // 文字の四隅が、ひし形の中（|dx|/(w/2) + |dy|/(h/2) <= 1）に入るか
    const inside = [[tr.left, tr.top], [tr.right, tr.top], [tr.left, tr.bottom], [tr.right, tr.bottom]]
      .every(([x, y]) => Math.abs(x! - cx) / (hr.width / 2) + Math.abs(y! - cy) / (hr.height / 2) <= 1.001);
    return { inside, hw: hr.width, hh: hr.height, left: hr.left, top: hr.top };
  });
  expect(r.inside).toBe(true);
  // 線の始点は、ひし形の右の頂点（本体の右端の、上下の真ん中）
  const start = await page.locator(".mz-edge .mz-line").first().evaluate(l => (l.getAttribute("points") ?? "").trim().split(/\s+/)[0]!.split(",").map(Number));
  const head = await page.locator('.mz-node[data-id="1"] > .mz-head').evaluate(h => {
    const s = (h as HTMLElement).style; const n = h.parentElement!.style;
    return { x: parseFloat(n.left) + parseFloat(s.left), y: parseFloat(n.top) + parseFloat(s.top), w: parseFloat(s.width), h: parseFloat(s.height) };
  });
  expect(start).toEqual([head.x + head.w, head.y + head.h / 2]);
});

test("ひし形の側の端をつまんで、別の頂点へ動かせる（折れ線は形を選び直す）", async ({ page }) => {
  await openDiagram(page, {
    world: { route: "elbow" },
    nodes: [
      { id: 1, caption: "トップ画面", x: 300, y: 40 },
      { id: 2, caption: "カートに商品がある？", shape: "diamond", x: 240, y: 220 },
    ],
    edges: [{ id: "e1", from: 1, to: 2 }], // 矢印を付けると、線の端は矢印の分だけ手前で止まるので付けない
  });
  const points = () => page.locator('.mz-edge[data-id="e1"] .mz-line').evaluate(l =>
    (l.getAttribute("points") ?? "").trim().split(/\s+/).map(q => q.split(",").map(Number)));
  const head = await page.locator('.mz-node[data-id="2"] > .mz-head').evaluate(h => {
    const s = (h as HTMLElement).style; const n = h.parentElement!.style;
    return { x: parseFloat(n.left) + parseFloat(s.left), y: parseFloat(n.top) + parseFloat(s.top), w: parseFloat(s.width), h: parseFloat(s.height) };
  });
  // 最初は上の頂点に入る
  expect((await points()).at(-1)).toEqual([head.x + head.w / 2, head.y]);
  // 線を選んで、終点の丸をひし形の左の頂点の近くへドラッグする
  await selectLine(page, "e1");
  const end = page.locator('.mz-edge[data-id="e1"] .mz-end[data-end="enter"]');
  const eb = (await end.boundingBox())!;
  const stage = (await page.locator(".mz-world").boundingBox())!;
  await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
  await page.mouse.down();
  await page.mouse.move(stage.x + head.x + 6, stage.y + head.y + head.h / 2 + 4, { steps: 8 });
  await page.mouse.up();
  const after = await points();
  expect(after.at(-1)).toEqual([head.x, head.y + head.h / 2]); // 左の頂点に、左から入る
  expect(after.length).toBeGreaterThan(2);
});

test("ひし形の端を下の頂点へ動かしたあと、途中の区間や相手の端を動かしても、下の頂点のまま突き抜けない", async ({ page }) => {
  await openDiagram(page, {
    world: { route: "elbow" },
    nodes: [
      { id: 1, caption: "トップ画面", x: 300, y: 40 },
      { id: 2, caption: "カートに商品がある？", shape: "diamond", x: 240, y: 220 },
    ],
    edges: [{ id: "e1", from: 1, to: 2 }],
  });
  const line = page.locator('.mz-edge[data-id="e1"] .mz-line');
  const points = () => line.evaluate(l => (l.getAttribute("points") ?? "").trim().split(/\s+/).map(q => q.split(",").map(Number)));
  const rectOf = (id: number) => page.locator(`.mz-node[data-id="${id}"] > .mz-head`).evaluate(h => {
    const s = (h as HTMLElement).style; const n = h.parentElement!.style;
    return { x: parseFloat(n.left) + parseFloat(s.left), y: parseFloat(n.top) + parseFloat(s.top), w: parseFloat(s.width), h: parseFloat(s.height) };
  });
  const d = await rectOf(2);
  const bottom = [d.x + d.w / 2, d.y + d.h];
  const world = (await page.locator(".mz-world").boundingBox())!;
  const drag = async (sel: string, x: number, y: number) => {
    const b = (await page.locator(sel).first().boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(world.x + x, world.y + y, { steps: 8 });
    await page.mouse.up();
  };
  // 縦の区間が、ひし形の内側を通らないか（端の点そのものは除く）
  const through = (pts: number[][]) => pts.slice(1).some(([qx, qy], i) => {
    const [px, py] = pts[i]!;
    const mx = (px! + qx!) / 2, my = (py! + qy!) / 2;
    return mx > d.x + 1 && mx < d.x + d.w - 1 && my > d.y + 1 && my < d.y + d.h - 1;
  });
  await selectLine(page, "e1");
  await drag('.mz-edge[data-id="e1"] .mz-end[data-end="enter"]', bottom[0]! + 4, bottom[1]! - 4);
  expect((await points()).at(-1)).toEqual(bottom);
  expect(through(await points())).toBe(false);
  // 途中の区間（縦の区間）を左へ動かす
  const bends = page.locator('.mz-edge[data-id="e1"] .mz-bend');
  expect(await bends.count()).toBeGreaterThan(0); // 下の頂点へ回り込む形なので、動かせる区間がある
  const before0 = await points();
  const b = (await bends.first().boundingBox())!;
  const vertical = b.height > b.width;
  await drag('.mz-edge[data-id="e1"] .mz-bend', b.x - world.x + b.width / 2 + (vertical ? -30 : 0), b.y - world.y + b.height / 2 + (vertical ? 0 : 20));
  expect(await points()).not.toEqual(before0);
  expect((await points()).at(-1)).toEqual(bottom);
  expect(through(await points())).toBe(false);
  // 相手（トップ画面）の側の端をずらす
  const t = await rectOf(1);
  const before = (await points())[0]!;
  await drag('.mz-edge[data-id="e1"] .mz-end[data-end="exit"]', before[0]! - 30, before[1]!);
  const after = await points();
  expect(after[0]).not.toEqual(before);
  expect(after.at(-1)).toEqual(bottom);
  expect(through(after)).toBe(false);
  expect(t.w).toBeGreaterThan(0);
});

test("向きを左右に直した線でも、ひし形の端を下の頂点へ動かせる（相手の向きは保ったまま回り込む）", async ({ page }) => {
  await openDiagram(page, {
    world: { route: "elbow" },
    nodes: [
      { id: 1, caption: "トップ画面", x: 300, y: 40 },
      { id: 2, caption: "カートに商品がある？", shape: "diamond", x: 240, y: 220 },
    ],
    edges: [{ id: "e1", from: 1, to: 2, exit: "horizontal", enter: "horizontal", via: [200] }],
  });
  const points = () => page.locator('.mz-edge[data-id="e1"] .mz-line').evaluate(l =>
    (l.getAttribute("points") ?? "").trim().split(/\s+/).map(q => q.split(",").map(Number)));
  const d = await page.locator('.mz-node[data-id="2"] > .mz-head').evaluate(h => {
    const s = (h as HTMLElement).style; const n = h.parentElement!.style;
    return { x: parseFloat(n.left) + parseFloat(s.left), y: parseFloat(n.top) + parseFloat(s.top), w: parseFloat(s.width), h: parseFloat(s.height) };
  });
  const world = (await page.locator(".mz-world").boundingBox())!;
  const [p0, p1] = await points();
  await page.mouse.click(world.x + (p0![0]! + p1![0]!) / 2, world.y + p0![1]!); // 線の上を押して選ぶ
  const end = (await page.locator('.mz-edge[data-id="e1"] .mz-end[data-end="enter"]').boundingBox())!;
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2);
  await page.mouse.down();
  await page.mouse.move(world.x + d.x + d.w / 2 + 3, world.y + d.y + d.h - 3, { steps: 10 });
  await page.mouse.up();
  expect((await points()).at(-1)).toEqual([d.x + d.w / 2, d.y + d.h]);
});

test("始点を左右にして右から出た線は、終点を上の頂点へ動かしても右から出たまま", async ({ page }) => {
  await openDiagram(page, {
    world: { route: "elbow" },
    nodes: [
      { id: 1, caption: "トップ画面", x: 300, y: 40 },
      { id: 2, caption: "カートに商品がある？", shape: "diamond", x: 100, y: 220 },
    ],
    edges: [{ id: "e1", from: 1, to: 2 }],
  });
  const points = () => page.locator('.mz-edge[data-id="e1"] .mz-line').evaluate(l =>
    (l.getAttribute("points") ?? "").trim().split(/\s+/).map(q => q.split(",").map(Number)));
  const rect = (id: number) => page.locator(`.mz-node[data-id="${id}"] > .mz-head`).evaluate(h => {
    const s = (h as HTMLElement).style; const n = h.parentElement!.style;
    return { x: parseFloat(n.left) + parseFloat(s.left), y: parseFloat(n.top) + parseFloat(s.top), w: parseFloat(s.width), h: parseFloat(s.height) };
  });
  const world = (await page.locator(".mz-world").boundingBox())!;
  const select = async () => {
    const p = await points();
    await page.mouse.click(world.x + (p[0]![0]! + p[1]![0]!) / 2, world.y + (p[0]![1]! + p[1]![1]!) / 2);
  };
  await select();
  await page.locator('#sidebar label:has(input[name="mzp-exit"][value="horizontal"])').click();
  const t = await rect(1), d = await rect(2);
  const start = (await points())[0]!;
  expect([t.x, t.x + t.w]).toContain(start[0]); // 左右のどちらかから出る
  const startSide = start[0] === t.x + t.w ? "right" : "left";
  await select();
  const end = (await page.locator('.mz-edge[data-id="e1"] .mz-end[data-end="enter"]').boundingBox())!;
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2);
  await page.mouse.down();
  await page.mouse.move(world.x + d.x + d.w / 2 + 3, world.y + d.y + 3, { steps: 10 });
  await page.mouse.up();
  const after = await points();
  expect(after.at(-1)).toEqual([d.x + d.w / 2, d.y]); // 上の頂点
  expect(after[0]![0]).toBe(startSide === "right" ? t.x + t.w : t.x); // 出る側は変わらない
});

test("折れ線では、ひし形を動かしても相手（普通の箱）の側の端は動かない", async ({ page }) => {
  await openDiagram(page, {
    world: { route: "elbow" },
    nodes: [
      { id: 1, caption: "トップ画面", x: 300, y: 40 },
      { id: 2, caption: "カートに商品がある？", shape: "diamond", x: 200, y: 240 },
    ],
    edges: [{ id: "e1", from: 1, to: 2 }],
  });
  const first = () => page.locator('.mz-edge[data-id="e1"] .mz-line').evaluate(l => (l.getAttribute("points") ?? "").trim().split(/\s+/)[0]);
  const before = await first();
  await dragBy(page, 2, 60, 0);
  expect(await first()).toBe(before);
  await dragBy(page, 2, -120, 0);
  expect(await first()).toBe(before);
});

test("ひし形を動かしても、指定の無い線は前の辺（下の頂点 → 相手の上）を保ち、端を動かすより折れ目を増やす", async ({ page }) => {
  await openDiagram(page, {
    world: { route: "elbow" },
    nodes: [
      { id: 1, caption: "カートに商品がある？", shape: "diamond", x: 200, y: 40 },
      { id: 2, caption: "商品一覧", x: 290, y: 300 },
    ],
    edges: [{ id: "e1", from: 1, to: 2 }],
  });
  const points = () => page.locator('.mz-edge[data-id="e1"] .mz-line').evaluate(l =>
    (l.getAttribute("points") ?? "").trim().split(/\s+/).map(q => q.split(",").map(Number)));
  const rect = (id: number) => page.locator(`.mz-node[data-id="${id}"] > .mz-head`).evaluate(h => {
    const s = (h as HTMLElement).style; const n = h.parentElement!.style;
    return { x: parseFloat(n.left) + parseFloat(s.left), y: parseFloat(n.top) + parseFloat(s.top), w: parseFloat(s.width), h: parseFloat(s.height) };
  });
  const box = await rect(2);
  // 最初は下の頂点から、商品一覧の上へ
  let d = await rect(1);
  expect((await points())[0]).toEqual([d.x + d.w / 2, d.y + d.h]);
  expect((await points()).at(-1)![1]).toBe(box.y);
  // ひし形を左へ動かす
  await dragBy(page, 1, -150, 0);
  d = await rect(1);
  const after = await points();
  expect(after[0]).toEqual([d.x + d.w / 2, d.y + d.h]); // 下の頂点のまま
  expect(after.at(-1)![1]).toBe(box.y);                 // 商品一覧の上のまま
  expect(after.length).toBeGreaterThan(2);               // 折れて結ぶ
});

test("ひし形を上へドラッグして入れ替わったら、重なりが解けた時点で相手の上 → ひし形の下へ付け替える（前の辺に縛られない）", async ({ page }) => {
  await openDiagram(page, {
    world: { route: "elbow" },
    nodes: [
      { id: 1, caption: "トップ画面", x: 150, y: 40 },
      { id: 2, caption: "カートに商品がある？", shape: "diamond", x: 60, y: 160 },
    ],
    edges: [{ id: "e1", from: 1, to: 2 }],
  });
  const points = async () => (await page.locator('.mz-edge[data-id="e1"] .mz-line').getAttribute("points"))!
    .split(" ").map(p => p.split(",").map(Number));
  const top = (id: number) => page.locator(`.mz-node[data-id="${id}"]`).evaluate(n => parseFloat((n as HTMLElement).style.top));
  const h = (await page.locator('.mz-node[data-id="2"] > .mz-head').boundingBox())!;
  const [x, y] = [h.x + h.width / 2, h.y + h.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let dy = -10; dy >= -130; dy -= 10) await page.mouse.move(x, y + dy);
  const boxTop = await top(1);
  expect(boxTop).toBeGreaterThan(40); // 入れ替わってトップ画面が下へ
  const pts = await points();
  const d = (await page.locator('.mz-node[data-id="2"]').boundingBox())!;
  const stage = (await page.locator(".mz-world").boundingBox())!;
  expect(pts[0]![1]).toBe(boxTop);                                  // トップ画面の上から
  expect(pts.at(-1)![1]).toBeCloseTo(d.y - stage.y + d.height, 0); // ひし形の下へ
  expect(pts.every(p => p[1]! <= boxTop)).toBe(true);              // 下を回る遠回りをしない
  await page.mouse.up();
  expect(await violations(page)).toEqual([]);
});
