// コピー・貼り付け（D23）: Ctrl+C で選んだ箱を写し、Ctrl+V で貼る。ワールドを選んでいればポインタの位置、箱を選んでいればその中
import { expect, test } from "@playwright/test";
import { openDiagram } from "./helpers";

const head = (page: import("@playwright/test").Page, id: number | string) => page.locator(`.mz-node[data-id="${id}"] > .mz-head`);

test("箱を選んで Ctrl+C、背景を押してポインタを置いて Ctrl+V で、その位置に写しを貼る。箱を選んで Ctrl+V なら、その箱の中に入る", async ({ page }) => {
  await openDiagram(page, { nodes: [{ id: 1, caption: "写す箱", x: 40, y: 40 }, { id: 2, caption: "入れ物", x: 400, y: 40 }], edges: [] } as never);
  await head(page, 1).click({ position: { x: 10, y: 8 } });
  await page.keyboard.press("Control+c");
  // 背景を押してワールドを選び、ポインタを置いて貼る
  const world = (await page.locator("#stage .mz-world").boundingBox())!;
  await page.mouse.click(world.x + 300, world.y + 400);
  await page.mouse.move(world.x + 320, world.y + 420);
  await page.keyboard.press("Control+v");
  await expect(page.locator("#stage .mz-node")).toHaveCount(3);
  const pasted = page.locator("#stage .mz-node:not([data-id='1']):not([data-id='2'])");
  const b = (await pasted.boundingBox())!;
  expect(Math.abs(b.x - (world.x + 320 - 16))).toBeLessThanOrEqual(2);
  expect(Math.abs(b.y - (world.y + 420 - 12))).toBeLessThanOrEqual(2);
  await expect(pasted.locator(":scope > .mz-head")).toContainText("写す箱");
  // 入れ物を選んで貼ると、その中に入る
  await head(page, 2).click({ position: { x: 10, y: 8 } });
  await page.keyboard.press("Control+v");
  await expect(page.locator('.mz-node[data-id="2"] .mz-node')).toHaveCount(1);
  // Ctrl を離したら選択モードに戻っている
  await expect(page.locator("#mode-move")).toHaveAttribute("aria-pressed", "true");
});
