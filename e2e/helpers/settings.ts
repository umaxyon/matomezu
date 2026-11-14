// 設定画面: フッタメニューの「設定を開く」で開いたダイアログと、その「全体」の中身
import { expect, type Page } from "@playwright/test"
import { fromMenu, menuOf } from "./stage-menu"

export const settingsDialog = (page: Page) => page.getByRole("dialog", { name: "設定" })

// フッタメニューから設定画面を開き、「全体」の中身（tabpanel）を返す
export async function openGeneral(page: Page) {
  await (await fromMenu(page, "設定を開く")).click()
  return settingsDialog(page).getByRole("tabpanel", { name: "全体" })
}

// 設定画面の「プラグイン」で、追加プラグイン（id）を有効にする（足したときは無効で、有効にするまで画面に置かない）。有効にして設定画面を閉じる
export async function enablePlugins(page: Page, ...ids: string[]) {
  await (await fromMenu(page, "設定を開く")).click()
  const dialog = settingsDialog(page)
  await dialog.getByRole("tab", { name: "プラグイン" }).click()
  for (const id of ids) await dialog.getByRole("checkbox", { name: id }).check()
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await page.mouse.move(0, 0)
  await expect(menuOf(page.locator('button[aria-haspopup="menu"]').first())).toBeHidden() // 設定を開いたフッタメニュー（マウスを乗せて開く）が閉じるまで待つ
}
