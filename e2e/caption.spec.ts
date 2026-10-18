// キャプションと本文の編集ダイアログ（edit-dialog.ts）を実際のブラウザで確かめる
import { expect, test } from "@playwright/test";
import { openDiagram, openBoxDialog, openSide } from "./helpers";

test.beforeEach(async ({ page }) => {
  // B はダイアログ（真ん中に出る）に隠れない左端に置く（後ろの箱を押してもダイアログの外を押したことになるように）
  await openDiagram(page, { nodes: [{ id: 1, caption: "A", x: 300, y: 40 }, { id: 2, caption: "B", x: 12, y: 40 }] });
});

const caption = (page: import("@playwright/test").Page, id: number) => page.locator(`.mz-node[data-id="${id}"] > .mz-head .mz-text`);

test("箱をダブルクリックすると編集ダイアログが開き、後ろの図は触れない（外を押すとキャンセル）。Ctrl+Enter でキャプションと本文を確定する", async ({ page }) => {
  await caption(page, 1).dblclick();
  const dlg = page.locator(".mz-dlg");
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('[name="caption"]')).toBeFocused();
  // オーバーレイが図を覆っているので、後ろの箱は押せない（選択が変わらない）。外を押すとキャンセルで閉じる
  const b = (await page.locator('.mz-node[data-id="2"] > .mz-head').boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.locator(".mz-dlg-overlay")).toHaveCount(0);
  await expect(page.locator('.mz-node[data-id="2"]')).not.toHaveClass(/mz-current/);
  await caption(page, 1).dblclick();
  await expect(dlg).toBeVisible();
  await dlg.locator('[name="caption"]').fill("ログイン画面");
  await dlg.locator('[name="body"]').fill("メールアドレスで入る。\n失敗が続いたらロックする。");
  await page.keyboard.press("Control+Enter");
  await expect(page.locator(".mz-dlg-overlay")).toHaveCount(0);
  await expect(caption(page, 1)).toHaveText("ログイン画面");
  await expect(page.locator('.mz-node[data-id="1"] .mz-body')).toHaveText("メールアドレスで入る。\n失敗が続いたらロックする。");
  // 1 回の Undo で、キャプションも本文も戻る
  await page.keyboard.press("Control+z");
  await expect(caption(page, 1)).toHaveText("A");
  await expect(page.locator('.mz-node[data-id="1"] .mz-body')).toBeHidden();
});

test("Esc で閉じると何も変えない", async ({ page }) => {
  await openBoxDialog(page, 1);
  await page.locator('.mz-dlg [name="caption"]').fill("書きかけ");
  await page.keyboard.press("Escape");
  await expect(page.locator(".mz-dlg-overlay")).toHaveCount(0);
  await expect(caption(page, 1)).toHaveText("A");
});

test("キャプションを空にすると空の箱になる（id を出さない）。一覧では「id_(空)」と出す", async ({ page }) => {
  await openBoxDialog(page, 1);
  await page.locator('.mz-dlg [name="caption"]').fill("");
  await page.locator('.mz-dlg [name="caption"]').press("Enter");
  await expect(caption(page, 1)).toHaveText("");
  await openSide(page);
  await expect(page.locator('.mzp-row[data-select="1"] .mzp-row-cap')).toHaveText("1_(空)");
});
