// 設定画面: フッタメニューの「設定を開く」で開いたダイアログと、その「全体」の中身
import type { Page } from "@playwright/test"
import { fromMenu } from "./stage-menu"

export const settingsDialog = (page: Page) => page.getByRole("dialog", { name: "設定" })

// フッタメニューから設定画面を開き、「全体」の中身（tabpanel）を返す
export async function openGeneral(page: Page) {
  await (await fromMenu(page, "設定を開く")).click()
  return settingsDialog(page).getByRole("tabpanel", { name: "全体" })
}
