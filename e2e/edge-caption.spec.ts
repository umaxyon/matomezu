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

test("線をダブルクリックすると線の編集ダイアログが開き、キャプションを書いて確定できる", async ({ page }) => {
  await openDiagram(page, {
    nodes: [{ id: 1, caption: "A", x: 40, y: 40 }, { id: 2, caption: "B", x: 400, y: 40 }],
    edges: [{ id: "e1", from: 1, to: 2 }],
  });
  const mid = await page.locator('.mz-edge[data-id="e1"] .mz-hit').evaluate(l => {
    const g = l as SVGPolylineElement;
    const svg = g.ownerSVGElement!.getBoundingClientRect();
    const p = g.getPointAtLength(g.getTotalLength() / 2);
    return { x: svg.left + p.x, y: svg.top + p.y };
  });
  await page.mouse.dblclick(mid.x, mid.y);
  await expect(page.locator(".mz-dlg h2")).toHaveText("線の編集");
  await page.locator('.mz-dlg [name="caption"]').fill("承認");
  await page.locator('.mz-dlg [name="caption"]').press("Enter");
  await expect(page.locator('.mz-edge[data-id="e1"] .mz-label')).toHaveText("承認");
  await expect(page.locator("#sidebar .mzp-caption-text")).toHaveText("承認");
});
