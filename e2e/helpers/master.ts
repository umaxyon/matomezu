// マスターで新しいブックを作る e2e の補助
import type { Page } from "@playwright/test"
import { fromMenu } from "./stage-menu"

// マスターの「新しいブック」で、名前 title・タイプ type（ブックのタイプの選択肢の名前）のブックを作り、
// 「ページを作る」で開いた新しいページのダイアログを返す
export async function newBook(page: Page, title: string, type: string) {
  await (await fromMenu(page, "ホーム")).click()
  await page.getByRole("button", { name: "新しいブック" }).click()
  const dialog = page.getByRole("dialog", { name: "新しいブック" })
  await page.keyboard.type(title)
  await dialog.getByLabel("ブックのタイプ").selectOption({ label: type })
  await dialog.getByRole("button", { name: "作成" }).click()
  await page.getByRole("button", { name: "ページを作る" }).click()
  return page.getByRole("dialog", { name: "新しいページ" })
}
