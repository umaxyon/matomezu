// 印刷プレビュー: フッタメニューのボタンで開くと、ブックの全ページの印刷区画を並べ、右サイドパネルに設定を出す。間はブックを変えるキー（元に戻す）が効かない。ロック中は変える前に聞く。
// 右サイドパネルを閉じる（Esc）と編集に戻り、読み直しても印刷プレビューのまま開く。印刷区画をダブルクリックすると、そのページの編集に戻る
import { expect, type Page, test } from "./fixtures"
import { panel } from "./helpers/note"
import { addBox, items, onPaper } from "./helpers/paper"
import { fromMenu } from "./helpers/stage-menu"

const preview = (page: Page) => page.locator("[data-print-preview]")
const sheets = (page: Page) => page.locator("[data-sheet]")

// ＋で開くダイアログで、ページを 1 つ足す
async function addPage(page: Page) {
  await page.getByRole("button", { name: "ページを足す" }).click()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("dialog", { name: "新しいページ" })).toBeHidden()
}

async function openPreview(page: Page) {
  await (await fromMenu(page, "印刷プレビュー")).click()
  await expect(preview(page)).toBeVisible()
}

test("印刷プレビューを開くと全ページの印刷区画を並べ、ページのタブを隠す。初めは幅に合わせ、元に戻すは効かず、Esc で閉じると編集に戻る", async ({
  page,
}) => {
  await page.goto("/")
  await addBox(page, 200, 150, "残る箱")
  await addPage(page)
  await expect(page.getByRole("tab")).toHaveCount(2)
  await openPreview(page)
  await expect(sheets(page)).toHaveCount(2)
  await expect(panel(page)).toContainText("印刷プレビュー")
  await expect(page.getByRole("tablist")).toHaveCount(0)
  // 初めは幅に合わせ（右サイドパネルの帯の「幅に合わせる」は押した状態）、1 枚目の紙の幅がステージの幅から余白を除いた幅になる
  await expect(panel(page).getByRole("button", { name: "幅に合わせる" })).toBeDisabled()
  const stage = (await page.locator("[data-stage]").boundingBox())!
  await expect(async () => {
    const first = (await sheets(page).first().boundingBox())!
    expect(Math.abs(first.width - (stage.width - 48))).toBeLessThan(stage.width * 0.01 + 1)
  }).toPass()
  await page.keyboard.press("Control+z")
  await page.keyboard.press("Escape")
  await expect(preview(page)).toHaveCount(0)
  await expect(page.getByRole("tab")).toHaveCount(2)
  await page.getByRole("tab").first().click()
  await expect(items(page)).toHaveText("残る箱")
})

test("並べる向きを横にすると、印刷区画が横に並ぶ。読み直しても印刷プレビューのまま開き、印刷区画のダブルクリックでそのページの編集に戻る", async ({
  page,
}) => {
  await page.goto("/")
  await addPage(page)
  await expect(page.getByRole("tab")).toHaveCount(2)
  await openPreview(page)
  const [a, b] = [sheets(page).nth(0), sheets(page).nth(1)]
  expect((await b.boundingBox())!.y).toBeGreaterThan((await a.boundingBox())!.y)
  await panel(page).getByTitle("横", { exact: true }).click()
  await expect(async () => {
    expect((await b.boundingBox())!.x).toBeGreaterThan((await a.boundingBox())!.x)
  }).toPass()
  await expect(page).toHaveURL(/m0=print-preview/)
  await page.reload()
  await expect(sheets(page)).toHaveCount(2)
  await expect(panel(page)).toContainText("印刷プレビュー")
  await sheets(page).nth(0).dblclick()
  await expect(preview(page)).toHaveCount(0)
  await expect(page.getByRole("tab").first()).toHaveAttribute("aria-selected", "true")
})

test("ロック中のブックで設定を変えると、書き換えてよいかを聞き、よければ変えてロックを掛け直す。やめれば変えない", async ({
  page,
}) => {
  await page.goto("/")
  await openPreview(page)
  const lock = panel(page).getByRole("button", { name: "ブックをロックする" })
  await lock.click()
  const unlock = panel(page).getByRole("button", { name: "ブックのロックを外す" })
  await expect(unlock).toHaveAttribute("aria-pressed", "true")
  const across = panel(page).getByRole("radio", { name: "横", exact: true })
  const ask = page.getByRole("alertdialog", { name: "ロック中ですが書き換えてもいいですか？" })
  await panel(page).getByTitle("横", { exact: true }).click()
  await ask.getByRole("button", { name: "キャンセル" }).click()
  await expect(ask).toBeHidden()
  await expect(across).not.toBeChecked()
  await panel(page).getByTitle("横", { exact: true }).click()
  await ask.getByRole("button", { name: "確定" }).click()
  await expect(across).toBeChecked()
  await expect(unlock).toHaveAttribute("aria-pressed", "true")
})

test("可変ページの何も載っていない印刷区画は、書く画面で薄く暗くし、印刷プレビューには並べない", async ({ page }) => {
  await page.goto("/")
  await addBox(page, 200, 200, "一")
  const empty = await onPaper(page, 900, 600)
  await page.mouse.click(empty.x, empty.y, { button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "ページの設定" }).click()
  const dialog = page.getByRole("dialog", { name: "ページの設定" })
  await dialog.getByRole("switch", { name: "可変ページにする" }).click()
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  // 中身の区画と、右・下の空きで 2×2。箱のある区画のほかの 3 つが暗い
  await expect(page.locator("[data-print-areas]")).toHaveAttribute("data-print-areas", "2x2")
  await expect(page.locator("[data-unprinted]")).toHaveCount(3)
  await openPreview(page)
  await expect(sheets(page)).toHaveCount(1)
})
