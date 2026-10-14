// 子の見せ方「リスト」を実際のブラウザで確かめる（docs/LIST-plan.md）
import { expect, test } from "@playwright/test";
import type { Diagram } from "../web/src/types";
import { choose, openDiagram, rect, violations } from "./helpers";

const data = (): Diagram => ({
  world: { width: 1000 },
  nodes: [
    { id: 1, caption: "関係の形 → 使う表現", x: 40, y: 40, childView: "list" },
    { id: 2, caption: "階層 → 内包かツリー", parent: 1, size: "S" },
    { id: 3, caption: "順序 → 同じ階層に並べて矢印でつなぐ", parent: 1, shape: "db" },
    { id: 4, caption: "量が多い → ページに分けるか、非表示で畳む", parent: 1, childView: "hidden" },
    { id: 5, caption: "孫", parent: 4 },
  ],
});

test.beforeEach(async ({ page }) => { await openDiagram(page, data()); });
test.afterEach(async ({ page }) => { expect(await violations(page)).toEqual([]); });

test("子が同じ幅で縦に並び、親の幅いっぱいに広がる", async ({ page }) => {
  const [p, a, b, c] = await Promise.all([rect(page, 1), rect(page, 2), rect(page, 3), rect(page, 4)]);
  expect(new Set([a.w, b.w, c.w]).size).toBe(1);
  expect(a.x).toBe(12);
  expect(a.w + 24).toBe(p.w);
  expect(a.y < b.y && b.y < c.y).toBe(true);
  await expect(page.locator('.mz-node[data-id="5"]')).toBeHidden(); // 4 は子を非表示にしている
});

test("リストの子を内包にすると、孫は描かずに中身の縮図を右に出し、全員がその幅にそろう。縮図の位置を「出さない」にすると低い行と ▼ になる（D13）", async ({ page }) => {
  await choose(page, 4, "view", "nest");
  const win = page.locator('.mz-node[data-id="4"] > .mz-head .mz-link-win');
  await expect(win).toBeVisible();
  await expect(win.locator(".mm-box")).toHaveCount(1); // 画面の外で並べた中身（孫 1 つ）
  await expect(page.locator('.mz-node[data-id="5"]')).toBeHidden();
  const head = (await page.locator('.mz-node[data-id="4"] > .mz-head').boundingBox())!, w = (await win.boundingBox())!;
  expect(w.x + w.width).toBeGreaterThan(head.x + head.width - 12); // 右に出す
  let [p, a, c] = await Promise.all([rect(page, 1), rect(page, 2), rect(page, 4)]);
  expect(a.w).toBe(c.w);
  expect(c.w + 24).toBe(p.w);
  // 左にすると、縮図は左に寄る
  await choose(page, 1, "previewSide", "left");
  const h2 = (await page.locator('.mz-node[data-id="4"] > .mz-head').boundingBox())!, w2 = (await win.boundingBox())!;
  expect(await page.locator('.mz-node[data-id="4"] > .mz-head').getAttribute("class")).toContain("mz-link-left");
  expect(w2.x).toBeLessThan(h2.x + 12);
  // 出さないにすると、縮図の無い低い行になり、子がいることは ▼ で示す（孫は出さない。リストは一覧性を優先する）
  const tall = (await page.locator('.mz-node[data-id="4"] > .mz-head').boundingBox())!.height;
  await choose(page, 1, "previewSide", "none");
  await expect(win).toBeHidden();
  await expect(page.locator('.mz-node[data-id="5"]')).toBeHidden();
  await expect(page.locator('.mz-node[data-id="4"] > .mz-head .mz-more')).toBeVisible();
  expect((await page.locator('.mz-node[data-id="4"] > .mz-head').boundingBox())!.height).toBeLessThan(tall);
  [p, a, c] = await Promise.all([rect(page, 1), rect(page, 2), rect(page, 4)]);
  expect(a.w).toBe(c.w);
  expect(c.w + 24).toBe(p.w);
});

test("ドラッグで並べ替えられる", async ({ page }) => {
  const head = page.locator('.mz-node[data-id="2"] > .mz-head');
  const box = (await head.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 30, box.y + 20 + 160, { steps: 32 });
  await page.mouse.up();
  const order = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.mz-node[data-id="1"] > .mz-node')]
      .sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top)).map(n => n.dataset.id));
  expect(order).toEqual(["3", "4", "2"]);
  expect((await rect(page, 1)).x).toBe(40);
});

test("見出しが子より長ければ、見出しが切れない幅になる", async ({ page }) => {
  await openDiagram(page, {
    world: { width: 1000 },
    nodes: [
      { id: 1, caption: "2. 編集力（言い直し: 構造ありき・自動配置）", x: 40, y: 40, childView: "list" },
      { id: 2, caption: "線のキャプション", parent: 1 },
    ],
  });
  const cut = await page.locator('.mz-node[data-id="1"] > .mz-head > .mz-caption')
    .evaluate(el => el.scrollWidth > el.clientWidth);
  expect(cut).toBe(false);
});
