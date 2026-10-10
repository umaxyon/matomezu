// サイドバーでのキャプションの入力を、実際のブラウザで確かめる（フォーカスの移り方と確定の順番は happy-dom では再現できない）
import { expect, test } from "@playwright/test";
import { openDiagram, select } from "./helpers";

test.beforeEach(async ({ page }) => {
  await openDiagram(page, { nodes: [{ id: 1, caption: "A", x: 40, y: 40 }, { id: 2, caption: "B", x: 300, y: 40 }] });
});

const caption = (page: import("@playwright/test").Page, id: number) => page.locator(`.mz-node[data-id="${id}"] > .mz-head .mz-text`);

test("Enter を押さずにほかの箱や何も無い所をクリックしても、打っていた箱に確定する（ほかの箱には入らない）", async ({ page }) => {
  await select(page, 1);
  const input = page.locator('#sidebar [data-edit="caption"]');
  await input.fill("A2");
  await caption(page, 2).click();
  await expect(caption(page, 1)).toHaveText("A2");
  await expect(caption(page, 2)).toHaveText("B");
  await expect(input).toHaveValue("B"); // サイドバーは B の情報
  await input.fill("B2");
  await page.locator(".mz-world").click({ position: { x: 600, y: 400 } });
  await expect(caption(page, 2)).toHaveText("B2");
  await expect(caption(page, 1)).toHaveText("A2");
});

test("キャプションを空にすると空の箱になる（id を出さない）。一覧では「id_(空)」と出す", async ({ page }) => {
  await select(page, 1);
  const input = page.locator('#sidebar [data-edit="caption"]');
  await input.fill("");
  await input.press("Enter");
  await expect(caption(page, 1)).toHaveText("");
  await expect(input).toHaveValue("");
  await page.locator('#sidebar [data-tab="list"]').click();
  await expect(page.locator('.mzp-row[data-select="1"] .mzp-row-cap')).toHaveText("1_(空)");
});
