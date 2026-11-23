// 設定画面: コントロールセンターの「全体設定」で開いたダイアログと、その「全体」の中身
import { expect, type Locator, type Page } from "@playwright/test"
import { fromMenu, menuOf, menuTrigger } from "./stage-menu"

export const settingsDialog = (page: Page) => page.getByRole("dialog", { name: "設定" })

// locator のうち、inert の中に無い物（押せる所に出ているスクリーンの物）
const live = (locator: Locator) => locator.locator("xpath=self::*[not(ancestor-or-self::*[@inert])]")

// コントロールセンターの「全体設定」で設定画面を開く（ブックスクリーンにいれば、フッタメニューの巣箱でコントロールセンターへ移ってから）。
// 画面が描かれるまで待ってから、どちらにいるかを見る（読み直した直後は、コントロールセンターでも歯車がまだ無い）。
// 後ろに退いたスクリーンと、滑り出ている間のスクリーンは inert で描かれたままなので、その中の歯車と名前のボタンは数えない
export async function openSettings(page: Page) {
  const gear = live(page.getByRole("button", { name: "全体設定" }))
  await expect(gear.or(live(menuTrigger(page))).first()).toBeAttached()
  if (!(await gear.isVisible())) await (await fromMenu(page, "コントロールセンター")).click()
  await gear.click()
}

// 設定画面を閉じたあと、コントロールセンターからブックスクリーンへ戻る（ブラウザの戻る）
export async function backToBook(page: Page) {
  await expect(settingsDialog(page)).toBeHidden()
  await page.goBack()
  await expect(page.getByRole("heading", { name: "コントロールセンター" })).toBeHidden()
}

// 設定画面を開き、「全体」の中身（tabpanel）を返す
export async function openGeneral(page: Page) {
  await openSettings(page)
  return settingsDialog(page).getByRole("tabpanel", { name: "全体" })
}

// 設定画面の「プラグイン」で、追加プラグイン（id）を有効にする（足したときは無効で、有効にするまで画面に置かない）。有効にして設定画面を閉じる
export async function enablePlugins(page: Page, ...ids: string[]) {
  await openSettings(page)
  const dialog = settingsDialog(page)
  await dialog.getByRole("tab", { name: "プラグイン" }).click()
  // 有効にすると、ホストがエンジンを組み直し、画面は読み直される（読み直しが済むまで待つ）
  await page.evaluate(() => Object.assign(window, { notReloaded: true }))
  for (const id of ids) {
    await dialog.getByRole("checkbox", { name: id }).check()
    await page.waitForFunction(() => !("notReloaded" in window))
    await page.evaluate(() => Object.assign(window, { notReloaded: true }))
    await openSettings(page)
    await dialog.getByRole("tab", { name: "プラグイン" }).click()
  }
  await page.keyboard.press("Escape")
  await backToBook(page)
  await page.mouse.move(0, 0)
  await expect(menuOf(page.locator('button[aria-haspopup="menu"]').first())).toBeHidden() // コントロールセンターへ移ったフッタメニュー（マウスを乗せて開く）が閉じるまで待つ
}
