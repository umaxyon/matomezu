// 色を選ぶポップアップ（color-picker.ts）を実際のブラウザで確かめる
import { expect, test } from "@playwright/test";
import { openDiagram, violations } from "./helpers";

test.afterEach(async ({ page }) => {
  expect(await violations(page)).toEqual([]);
});

const colorOf = (page: import("@playwright/test").Page) =>
  page.locator('.mz-node[data-id="1"] > .mz-head').evaluate(h => (h as HTMLElement).style.background);

test("四角をドラッグして離すと色が決まり、見本で名前の色、Esc で閉じる", async ({ page }) => {
  await openDiagram(page, { nodes: [{ id: 1, caption: "色", x: 40, y: 40 }] });
  await page.locator('.mz-node[data-id="1"] > .mz-head').click();
  await page.click("[data-color-open]");
  const sv = page.locator(".mz-cp-sv");
  await expect(sv).toBeVisible();
  const box = (await sv.boundingBox())!;
  // 右上（濃さ最大・明るさ最大）までドラッグ。動かしている間は図を変えない
  await page.mouse.move(box.x + 10, box.y + box.height - 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + 1, { steps: 6 });
  expect(await colorOf(page)).toBe("rgb(255, 255, 255)");
  await page.mouse.up();
  expect(await colorOf(page)).not.toBe("rgb(255, 255, 255)");
  await expect(page.locator(".mz-cp-value")).toHaveValue(/^#[0-9a-f]{6}$/);
  // 見本を押すと名前の色。値の欄も名前になる
  await page.click('.mz-cp [data-name="danger"]');
  await expect(page.locator(".mz-cp-value")).toHaveValue("danger");
  expect(await page.evaluate(() => (document.querySelector(".mzp-color-btn") as HTMLElement).textContent?.trim())).toBe("");
  await page.keyboard.press("Escape");
  await expect(page.locator(".mz-cp")).toHaveCount(0);
});
