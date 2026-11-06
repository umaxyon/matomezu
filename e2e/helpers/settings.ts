// 設定画面: ホームに戻ってマスターの「設定を開く」で開いたダイアログと、その「全体」の欄
import type { Page } from "@playwright/test"
import { fromMenu } from "./stage-menu"

export const settingsDialog = (page: Page) => page.getByRole("dialog", { name: "設定" })

// ホームに戻ってマスターから設定画面を開き、「全体」の欄を返す
export async function openGeneral(page: Page) {
  await (await fromMenu(page, "ホーム")).click()
  await page.getByRole("region", { name: "マスター" }).getByRole("button", { name: "設定を開く" }).click()
  return settingsDialog(page).getByRole("tabpanel", { name: "全体" })
}
