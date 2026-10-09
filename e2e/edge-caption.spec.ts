// 線のキャプションを実際のブラウザで確かめる（docs/EDGE-CAPTION-plan.md）
import { expect, test } from "@playwright/test";
import { openDiagram } from "./helpers";

test("札をつまんで線の横へずらすと、文字が線から離れる。押してすぐ離すと線を選ぶ", async ({ page }) => {
  await openDiagram(page, {
    world: { width: 1000 },
    nodes: [{ id: 1, caption: "未申請", x: 40, y: 100 }, { id: 2, caption: "申請中", x: 440, y: 100 }],
    edges: [{ id: "e1", from: 1, to: 2, caption: "申請" }],
  });
  const text = page.locator(".mz-edge .mz-label span");
  const box = (await text.boundingBox())!;
  await text.click();
  await expect(page.locator(".mz-edge")).toHaveClass(/mz-selected/);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 30, box.y + box.height / 2 - 25, { steps: 5 });
  await page.mouse.up();
  const after = (await text.boundingBox())!;
  expect(after.x).toBeLessThan(box.x - 20);           // 線に沿って左へ
  expect(after.y + after.height).toBeLessThan(box.y); // 線より上へ離れた
});
