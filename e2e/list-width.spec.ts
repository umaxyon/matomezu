// リストの幅のつまみを実際のブラウザで確かめる（docs/SIZE-plan.md の 10 章）
import { expect, test } from "@playwright/test";
import { openDiagram, violations } from "./helpers";

test.afterEach(async ({ page }) => {
  expect(await violations(page)).toEqual([]);
});

const LONG = "とても長い説明の項目です。折り返しを確かめます".repeat(6);

test("選んだリストの右の縁のつまみで、L の最大を超えて広げられ、ダブルクリックで元に戻る", async ({ page }) => {
  await openDiagram(page, {
    world: { width: 1400 },
    nodes: [{ id: 1, caption: "一覧", childView: "list", x: 40, y: 40 }, { id: 2, caption: LONG, parent: 1, size: "L" }, { id: 3, caption: "短い", parent: 1 }],
  });
  const list = page.locator('.mz-node[data-id="1"] > .mz-head');
  const grip = page.locator('.mz-node[data-id="1"] > .mz-head > .mz-width-grip');
  await expect(grip).toBeHidden(); // 選ぶまで出さない
  await list.click({ position: { x: 20, y: 10 } });
  await expect(grip).toBeVisible();
  const before = (await list.boundingBox())!;
  const childBefore = (await page.locator('.mz-node[data-id="2"] > .mz-head').boundingBox())!;
  const g = (await grip.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2 + 400, g.y + g.height / 2, { steps: 8 });
  await page.mouse.up();
  const after = (await list.boundingBox())!;
  expect(after.width).toBeGreaterThan(before.width + 350);
  expect(after.width).toBeGreaterThan(400 + 24); // L の最大を超える
  const child = (await page.locator('.mz-node[data-id="2"] > .mz-head').boundingBox())!;
  expect(Math.abs(child.width - (after.width - 24))).toBeLessThanOrEqual(1); // 子もそろう
  expect(child.height).toBeLessThan(childBefore.height); // 広い幅で折り返すので低くなる

  await grip.dblclick();
  const reset = (await list.boundingBox())!;
  expect(Math.abs(reset.width - before.width)).toBeLessThanOrEqual(1);
});
