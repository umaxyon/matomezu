// 新しいブックを作る e2e の補助
import { expect, type Locator, type Page } from "@playwright/test"
import { stillBox } from "./motion"
import { fromMenu } from "./stage-menu"

// 画面を分け、下に出た書庫のスクリーンの「ブック新規作成」で、名前 title のブックを作って右のステージに開き（ブックは名前だけ）、
// 左のステージを閉じて右のステージを全体にし、ページタブの＋のメニューでタイプ type（ページのタイプの名前）を選んで開いた新しいページのダイアログを返す
export async function newBook(page: Page, title: string, type: string) {
  await (await fromMenu(page, "画面を分割")).click()
  const dialog = await openNewBookDialog(page)
  await page.keyboard.type(title)
  await dialog.getByRole("button", { name: "作成" }).click()
  await page.getByRole("button", { name: "ステージを閉じる" }).first().click()
  // 下の書庫のスクリーンが右へ出ていき終えてから、ブックスクリーンが伸びる（伸びる前に開いたメニューは、伸びると閉じる）
  await expect(page.getByRole("region", { name: "書庫" })).toHaveCount(0)
  await stillBox(page.getByRole("region", { name: "ステージ" }))
  await page.getByRole("button", { name: "ページを足す" }).click()
  await page.getByRole("menu").getByRole("menuitem", { name: type, exact: true }).click()
  return page.getByRole("dialog", { name: /^新しい/ })
}

// 見えている「ブック新規作成」を押し、新しいブックのダイアログの名前の入力Form に焦点が来るまで待って、ダイアログを返す
// （焦点が来る前にキーを打つと、打った字は名前に入らない）
export async function openNewBookDialog(page: Page) {
  await page.getByRole("button", { name: "ブック新規作成" }).locator("visible=true").click()
  const dialog = page.getByRole("dialog", { name: "新しいブック" })
  await expect(dialog.getByLabel("ブックの名前")).toBeFocused()
  return dialog
}

// scope（画面かステージかタブの列）のページタブの＋を押し、メニューでタイプ type（ページのタイプの名前）を選ぶ
export async function addFromTabs(scope: Page | Locator, type = "図面") {
  await scope.locator('[aria-haspopup="menu"][aria-label="ページを足す"]').click()
  // メニューは画面の根（右クリックのメニューの置き場）に出る
  const root = "page" in scope ? scope.page() : scope
  await root.getByRole("menu").getByRole("menuitem", { name: type, exact: true }).click()
}
