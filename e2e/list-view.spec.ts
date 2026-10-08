// 子の見せ方「リスト」を実際のブラウザで確かめる（docs/LIST-plan.md）
import { expect, test } from "@playwright/test";
import type { Diagram } from "../web/src/types";
import { openDiagram, rect, violations } from "./helpers";

const data = (): Diagram => ({
  world: { width: 1000 },
  nodes: [
    { id: 1, caption: "関係の形 → 使う表現", x: 40, y: 40, childView: "list" },
    { id: 2, caption: "階層 → 内包かツリー", parent: 1, size: "S" },
    { id: 3, caption: "順序 → 同じ階層に並べて矢印でつなぐ", parent: 1, shape: "db" },
    { id: 4, caption: "量が多い → ページに分けるか、非表示で畳む", parent: 1 },
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
  await expect(page.locator('.mz-node[data-id="5"]')).toBeHidden();
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
