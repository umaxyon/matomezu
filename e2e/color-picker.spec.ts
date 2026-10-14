// 色を選ぶポップアップ（color-picker.ts）を実際のブラウザで確かめる
import { expect, test } from "@playwright/test";
import { openDiagram, violations } from "./helpers";

test.afterEach(async ({ page }) => {
  expect(await violations(page)).toEqual([]);
});

const colorOf = (page: import("@playwright/test").Page) =>
  page.locator('.mz-node[data-id="1"] > .mz-head').evaluate(h => (h as HTMLElement).style.background);

// 色は編集ダイアログで選ぶ（サイドバーには出さない。2026-10-13 D26）。図に書くのはダイアログの確定のとき
test("四角をドラッグして離すと色が決まり、見本で名前の色、Esc で閉じる。確定で図に付く", async ({ page }) => {
  await openDiagram(page, { nodes: [{ id: 1, caption: "色", x: 40, y: 40 }] });
  await page.locator('.mz-node[data-id="1"] > .mz-head').click();
  await page.keyboard.press("Enter");
  const dlg = page.locator(".mz-dlg-overlay > .mz-dlg");
  await dlg.locator("[data-color-open]").click();
  const sv = page.locator(".mz-cp-sv");
  await expect(sv).toBeVisible();
  const box = (await sv.boundingBox())!;
  // 右上（濃さ最大・明るさ最大）までドラッグ。離すと値の欄に色が入る（図は確定まで変えない）
  const before = await colorOf(page);
  await page.mouse.move(box.x + 10, box.y + box.height - 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + 1, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator(".mz-cp-value")).toHaveValue(/^#[0-9a-f]{6}$/);
  expect(await colorOf(page)).toBe(before);
  // 見本を押すと名前の色。値の欄も名前になる
  await page.click('.mz-cp [data-name="danger"]');
  await expect(page.locator(".mz-cp-value")).toHaveValue("danger");
  // Esc はポップアップだけ閉じ、ダイアログは残る
  await page.keyboard.press("Escape");
  await expect(page.locator(".mz-cp")).toHaveCount(0);
  await expect(dlg).toBeVisible();
  await dlg.locator("[data-ok]").click();
  expect(await colorOf(page)).not.toBe(before);
});
