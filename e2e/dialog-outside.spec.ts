// ダイアログの外（幕）を押すとキャンセル（Esc と同じ）。中で押し始めて外で離したときは閉じない
import { expect, test } from "@playwright/test";
import { openBoxDialog, openDiagram } from "./helpers";

test("ダイアログの外を押すとキャンセルし、書き換えない。中から外へドラッグしても閉じない", async ({ page }) => {
  await openDiagram(page, { nodes: [{ id: 1, caption: "元の名前", x: 40, y: 40 }], edges: [] } as never);
  const overlay = page.locator(".mz-dlg-overlay");
  await openBoxDialog(page, 1);
  const caption = overlay.locator('[name="caption"]');
  await caption.fill("書き換えた名前");
  // 中の欄で押して、外で離す（文字を選ぶつもりのドラッグ）
  const box = (await caption.boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(5, 5, { steps: 4 });
  await page.mouse.up();
  await expect(overlay).toHaveCount(1);
  // 外を押す
  await page.mouse.click(5, 5);
  await expect(overlay).toHaveCount(0);
  await expect(page.locator('.mz-node[data-id="1"] > .mz-head')).toContainText("元の名前");
});
