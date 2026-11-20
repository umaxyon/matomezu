import { BOOK_SCREEN_URL, expect, type Page, test } from "../fixtures"
import { openSettings, settingsDialog } from "../helpers/settings"

// 読めない物のフォルダ: 追加プラグインを無効にすると、そのタイプのページが読めない物のフォルダへ移る。無効にした窓は先に確かめ、ほかの窓は読み直したあとに知らせる

const flow = {
  id: "flow-1",
  title: "フロー",
  lineup: [
    {
      kind: "page",
      id: "flow-p1",
      type: "ex2:flow",
      title: "P",
      paper: "@matomezu/base:a4",
      orientation: "landscape",
      items: [],
    },
  ],
}
test.use({ books: [flow] })

const markReload = (page: Page) => page.evaluate(() => Object.assign(window, { notReloaded: true }))
const reloaded = (page: Page) => page.waitForFunction(() => !("notReloaded" in window))
const notice = (page: Page) => page.getByRole("alertdialog")

// 設定の「プラグイン」で ex2 のスイッチを押す
async function toggleEx2(page: Page) {
  await openSettings(page)
  await settingsDialog(page).getByRole("tab", { name: "プラグイン" }).click()
  await settingsDialog(page).getByRole("checkbox", { name: /ex2/ }).click()
}

test("無効にする窓は移る物を確かめてから無効にし、ほかの窓は読み直したあと知らせのダイアログを出し、［見る］で読めない物のフォルダを開く。有効に戻すと、戻った知らせは［閉じる］だけ", async ({
  page,
  newPage,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  const other = await newPage()
  await other.goto(BOOK_SCREEN_URL)
  await expect(other.locator("[data-ex2-diamond], [data-stage]").first()).toBeAttached()

  await toggleEx2(page)
  const ask = notice(page)
  await expect(ask.getByText("プラグインを無効にしますか？")).toBeVisible()
  await expect(ask.getByText("ページ 1 枚")).toBeVisible()
  await expect(ask.getByText("・ブック「フロー」 1 枚")).toBeVisible()
  await markReload(page)
  await markReload(other)
  await ask.getByRole("button", { name: "無効にする" }).click()
  await reloaded(page)
  await reloaded(other)

  // 自分で無効にした窓には知らせを出さず、書庫のツリーの下に ⚠ の行だけ
  await expect(notice(page)).toHaveCount(0)
  // ほかの窓は知らせ、［見る］で書庫の読めない物のフォルダを開く
  const told = notice(other)
  await expect(told.getByText("読めない物が 1 件移りました")).toBeVisible()
  await expect(told.getByText(/^プラグインが無効です: .+　1 件$/)).toBeVisible()
  await expect(told.getByRole("button", { name: "閉じる" })).toBeFocused()
  await told.getByRole("button", { name: "見る" }).click()
  const list = other.getByRole("list", { name: "読めない物" })
  await expect(list.getByRole("button")).toHaveCount(1)
  await expect(list.getByRole("button").first()).toContainText("P")
  await expect(list.getByRole("button").first()).toContainText("フロー")
  // 矢印キーは右の枠の共用の枠で、読めない物の行も選ぶ
  await list.getByRole("button").first().focus()
  await other.keyboard.press("ArrowDown")
  await expect(list.getByRole("button").first()).toHaveAttribute("aria-pressed", "true")
  await expect(other.getByRole("button", { name: "⚠ 読めない物 1 件" })).toBeVisible()

  // 有効に戻すと、元の所へ戻る。ほかの窓の知らせは［閉じる］だけ
  await markReload(other)
  await toggleEx2(page)
  await reloaded(other)
  const back = notice(other)
  await expect(back.getByText("読めるようになった物が 1 件戻りました")).toBeVisible()
  await expect(back.getByRole("button", { name: "見る" })).toHaveCount(0)
  await back.getByRole("button", { name: "閉じる" }).click()
  await expect(notice(other)).toHaveCount(0)
  await expect(other.getByRole("button", { name: /⚠ 読めない物/ })).toHaveCount(0)
})
