// 新しいブックを作る e2e の補助
import type { Page } from "@playwright/test"
import { fromMenu } from "./stage-menu"

// 画面を分け、ブックを開いていない右のステージの「新しいブック」で、名前 title のブックを作り（ブックは名前だけ）、
// 左のステージを閉じて右のステージを全体にし、ページタブの＋のメニューでタイプ type（ページのタイプの名前）を選んで開いた新しいページのダイアログを返す
export async function newBook(page: Page, title: string, type: string) {
  await (await fromMenu(page, "画面を分割")).click()
  await page.getByRole("region", { name: "ステージ" }).nth(1).getByRole("button", { name: "新しいブック" }).click()
  const dialog = page.getByRole("dialog", { name: "新しいブック" })
  await page.keyboard.type(title)
  await dialog.getByRole("button", { name: "作成" }).click()
  await page.getByRole("button", { name: "ステージを閉じる" }).first().click()
  await page.getByRole("button", { name: "ページを足す" }).click()
  await page.getByRole("menu", { name: "ページを足す" }).getByRole("menuitem", { name: type }).click()
  return page.getByRole("dialog", { name: "新しいページ" })
}
