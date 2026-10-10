// 箱の〇から線を引く操作を実際のブラウザで確かめる（docs/EDGE-TOOL-plan.md）
import { expect, test } from "@playwright/test";
import { openDiagram, violations } from "./helpers";

const data = () => ({
  nodes: [
    { id: 1, caption: "A", x: 40, y: 60 },
    { id: 2, caption: "B", x: 360, y: 60 },
    { id: 3, caption: "グループ", x: 40, y: 260 },
    { id: 4, caption: "子", parent: 3 },
  ],
});

test.afterEach(async ({ page }) => {
  expect(await violations(page)).toEqual([]);
});

const head = (page: import("@playwright/test").Page, id: number) => page.locator(`.mz-node[data-id="${id}"] > .mz-head`);
const port = (page: import("@playwright/test").Page, side: string) => page.locator(`.mz-port[data-side="${side}"]`);
const center = async (l: import("@playwright/test").Locator) => {
  const b = (await l.boundingBox())!;
  return [b.x + b.width / 2, b.y + b.height / 2] as const;
};

// 箱の画面の上の枠
const screenRect = async (page: import("@playwright/test").Page, id: number) => {
  const b = (await head(page, id).boundingBox())!;
  return { x: b.x, y: b.y, w: b.width, h: b.height };
};

// 〇を押して、(x, y) まで動かして離す
async function dragPort(page: import("@playwright/test").Page, side: string, x: number, y: number) {
  const [px, py] = await center(port(page, side));
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.up();
}

test("ポインタを乗せると四辺に〇が出て、〇から引ける相手までドラッグすると線を引く。選んだ箱には〇を出さない", async ({ page }) => {
  await openDiagram(page, data());
  await head(page, 1).hover();
  await expect(page.locator(".mz-port:visible")).toHaveCount(4);
  const a = await screenRect(page, 1);
  const [rx, ry] = await center(port(page, "r"));
  expect(rx).toBeGreaterThan(a.x + a.w); // 右の〇は右の辺の外
  expect(Math.abs(ry - (a.y + a.h / 2))).toBeLessThanOrEqual(1);

  const [bx, by] = await center(head(page, 2));
  await dragPort(page, "r", bx, by);
  await expect(page.locator(".mz-edge")).toHaveCount(1);
  await expect(page.locator(".mz-link-preview")).toHaveCount(0);
  await expect(page.locator(".mz-edge .mz-arrow")).not.toHaveAttribute("d", ""); // 終点に矢印を付けておく

  // 選んだ箱には出さない（右の縁の本文の幅のつまみと重ならないように）
  await head(page, 2).click();
  await page.mouse.move(1, 1);
  await head(page, 2).hover();
  await expect(page.locator(".mz-port:visible")).toHaveCount(0);
});

// 線（id）の点の並び（画面の座標）
const screenPoints = (page: import("@playwright/test").Page, id = "e1") =>
  page.locator(`.mz-edge[data-id="${id}"] .mz-hit`).evaluate(l => {
    const el = l as SVGPolylineElement, m = el.getScreenCTM()!;
    return el.getAttribute("points")!.trim().split(/\s+/).map(s => s.split(",").map(Number)).map(([x, y]) => [m.a * x! + m.e, m.d * y! + m.f]);
  });

test("引いた線の端は、引き始めた〇の辺の真ん中と、離した所に一番近いふちの点に固定する", async ({ page }) => {
  await openDiagram(page, { nodes: [{ id: 1, caption: "A", x: 40, y: 60 }, { id: 2, caption: "B", x: 360, y: 220 }] });
  await head(page, 1).hover();
  const a = await screenRect(page, 1), b = await screenRect(page, 2);
  // 下の〇から、B の左の辺の少し内側へ
  await dragPort(page, "b", b.x + 4, b.y + b.h / 2 + 6);
  await expect(page.locator(".mz-edge")).toHaveCount(1);
  const pts = await screenPoints(page);
  const [s, t] = [pts[0]!, pts.at(-1)!];
  expect(Math.abs(s[0]! - (a.x + a.w / 2))).toBeLessThanOrEqual(1.5); // A の下の辺の真ん中から
  expect(Math.abs(s[1]! - (a.y + a.h))).toBeLessThanOrEqual(1.5);
  expect(Math.abs(t[0]! - b.x)).toBeLessThanOrEqual(1.5);             // B の左の辺の、離した高さへ
  expect(Math.abs(t[1]! - (b.y + b.h / 2 + 6))).toBeLessThanOrEqual(1.5);
  // 箱を動かしても、端は同じ辺のまま
  await page.mouse.move(b.x + b.w / 2, b.y + b.h / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.w / 2 + 40, b.y + b.h / 2 + 30, { steps: 5 });
  await page.mouse.up();
  const b2 = await screenRect(page, 2);
  const t2 = (await screenPoints(page)).at(-1)!;
  expect(Math.abs(t2[0]! - b2.x)).toBeLessThanOrEqual(1.5);
});

test("何も無い所や、階層の違う箱で離すと引かない。相手の子の上で離すと、その相手に引く", async ({ page }) => {
  await openDiagram(page, data());
  await head(page, 1).hover();
  const a = await screenRect(page, 1);
  await dragPort(page, "r", a.x + a.w + 150, a.y + 160); // 何も無い所
  await expect(page.locator(".mz-edge")).toHaveCount(0);

  // グループの中の子の上で離すと、グループ（1 と同じ階層）に引く
  await head(page, 1).hover();
  const [cx, cy] = await center(head(page, 4));
  await dragPort(page, "b", cx, cy);
  await expect(page.locator(".mz-edge")).toHaveCount(1);
  // 子からは、階層の違う 1 へは引けない
  await head(page, 4).hover();
  const [ax, ay] = await center(head(page, 1));
  await dragPort(page, "t", ax, ay);
  await expect(page.locator(".mz-edge")).toHaveCount(1);
});

test("同じ箱に戻して離すと自分に戻る線。離した所に近い角が空いていれば、その角に描く", async ({ page }) => {
  await openDiagram(page, data());
  await head(page, 2).hover();
  const b = await screenRect(page, 2);
  await dragPort(page, "b", b.x + 8, b.y + b.h - 8); // 左下の角の近く
  await expect(page.locator(".mz-edge")).toHaveCount(1);
  const pts = await page.locator(".mz-edge .mz-hit").first().evaluate(l => {
    const el = l as SVGPolylineElement, m = el.getScreenCTM()!;
    return el.getAttribute("points")!.split(" ").map(s => s.split(",").map(Number)).map(([x, y]) => [m.a * x! + m.e, m.d * y! + m.f]);
  });
  // 輪は左下の角の外（箱の左より左、下より下を通る）
  expect(Math.min(...pts.map(p => p[0]!))).toBeLessThan(b.x);
  expect(Math.max(...pts.map(p => p[1]!))).toBeGreaterThan(b.y + b.h);
  expect(Math.max(...pts.map(p => p[0]!))).toBeLessThan(b.x + b.w / 2);
});

test("ツールバーに線モードのボタンは無い", async ({ page }) => {
  await openDiagram(page, data());
  await expect(page.locator('[data-mode="link"]')).toHaveCount(0);
});
