// 印刷プレビュー: フッタメニューのボタンで開くと、ブックの全ページの印刷区画を並べ、右サイドパネルに設定を出す。間はブックを変えるキー（元に戻す）が効かない。ロック中は変える前に聞く。
// 右サイドパネルを閉じる（Esc）と編集に戻り、読み直しても印刷プレビューのまま開く。印刷区画をダブルクリックすると、そのページの編集に戻る
import { expect, type Page, test } from "./fixtures"
import { newBook } from "./helpers/master"
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

// 印刷プレビューを開き、右サイドパネルに中身が出るまで待つ
async function openPreview(page: Page) {
  await (await fromMenu(page, "印刷プレビュー")).click()
  await expect(panel(page)).toContainText("印刷プレビュー")
}

test("印刷プレビューを開くと、中身のあるページの印刷区画を並べ（何も載っていないページは並べない）、ページのタブを隠す。初めは幅に合わせ、元に戻すは効かず、Esc で閉じると編集に戻る", async ({
  page,
}) => {
  await page.goto("/")
  await addBox(page, 200, 150, "残る箱")
  await addPage(page)
  await expect(page.getByRole("tab")).toHaveCount(2)
  await openPreview(page)
  await expect(sheets(page)).toHaveCount(1)
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

test("並べる向きを横にすると、印刷区画が横に並ぶ。印刷区画のダブルクリックでそのページの編集に戻る。印刷プレビューは URL に入れず、読み直すと編集の画面", async ({
  page,
}) => {
  await page.goto("/")
  await addBox(page, 200, 150, "一")
  await addPage(page)
  await expect(page.getByRole("tab")).toHaveCount(2)
  await addBox(page, 200, 150, "二")
  await openPreview(page)
  const [a, b] = [sheets(page).nth(0), sheets(page).nth(1)]
  expect((await b.boundingBox())!.y).toBeGreaterThan((await a.boundingBox())!.y)
  await panel(page).getByTitle("横", { exact: true }).click()
  await expect(async () => {
    expect((await b.boundingBox())!.x).toBeGreaterThan((await a.boundingBox())!.x)
  }).toPass()
  await sheets(page).nth(0).dblclick()
  await expect(preview(page)).toHaveCount(0)
  await expect(page.getByRole("tab").first()).toHaveAttribute("aria-selected", "true")
  await openPreview(page)
  await expect(page).not.toHaveURL(/m0=/)
  await page.reload()
  await expect(page.getByRole("tab")).toHaveCount(2)
  await expect(preview(page)).toHaveCount(0)
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
  // 中身の印刷区画と、右・下の空きで 2×2。箱のある印刷区画のほかの 3 つが暗い
  await expect(page.locator("[data-print-areas]")).toHaveAttribute("data-print-areas", "2x2")
  await expect(page.locator("[data-unprinted]")).toHaveCount(3)
  await openPreview(page)
  await expect(sheets(page)).toHaveCount(1)
})

test("印刷プレビューの紙に、ページの形と線を描く（見るだけで、形に編集の印は付けない）", async ({ page }) => {
  await page.goto("/")
  await addBox(page, 200, 200, "左")
  await addBox(page, 600, 200, "右")
  // 左の箱の右の〇から、右の箱へ線を引く
  const empty = await onPaper(page, 600, 500)
  await page.mouse.click(empty.x, empty.y)
  const start = items(page).filter({ hasText: "左" })
  const s = (await start.boundingBox())!
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2)
  const r = (await start.locator('[data-port="r"]').boundingBox())!
  const e = (await items(page).filter({ hasText: "右" }).boundingBox())!
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
  await page.mouse.down()
  await page.mouse.move(e.x + 10, e.y + e.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect(page.locator("[data-item]:not([data-shape])")).toHaveCount(1)
  await openPreview(page)
  const sheet = sheets(page).first()
  await expect(sheet).toContainText("左")
  await expect(sheet).toContainText("右")
  await expect(sheet.locator("polyline")).not.toHaveCount(0)
  // 紙の中の形には、e2e や操作が探す印（data-shape）を付けない
  await expect(sheet.locator("[data-shape]")).toHaveCount(0)
})

test("ツリーとディレクトリ構成図も、印刷プレビューの紙に中身を描く", async ({ page }) => {
  await page.goto("/")
  const tree = await newBook(page, "木", "ツリー")
  await tree.getByLabel("根のキャプション").fill("根っこ")
  await tree.getByRole("button", { name: "作る" }).click()
  await expect(tree).toBeHidden()
  await openPreview(page)
  await expect(sheets(page).first()).toContainText("根っこ")
  await page.keyboard.press("Escape")
  await expect(preview(page)).toHaveCount(0)
  const dir = await newBook(page, "構成", "ディレクトリ構成図")
  await dir.getByLabel("根のフォルダの名前").fill("proj")
  await dir.getByRole("button", { name: "作る" }).click()
  await expect(dir).toBeHidden()
  await openPreview(page)
  await expect(sheets(page).first()).toContainText("proj")
})

test("印刷できるものが何も無いブックでは、紙を並べず、印刷できるものが無いと知らせる", async ({ page }) => {
  await page.goto("/")
  await openPreview(page)
  await expect(sheets(page)).toHaveCount(0)
  await expect(page.getByText("印刷できるものはありません")).toBeVisible()
})

test("可変ページで印刷区画の境目をまたいだ箱があると、印刷プレビューを開かず、直してほしいと知らせてその箱のバッジを並べる", async ({
  page,
}) => {
  await page.goto("/")
  const empty = await onPaper(page, 600, 600)
  await page.mouse.click(empty.x, empty.y, { button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "ページの設定" }).click()
  const dialog = page.getByRole("dialog", { name: "ページの設定" })
  await dialog.getByRole("switch", { name: "可変ページにする" }).click()
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  // 1 つ目の印刷区画の右の端（A4 横は幅 1123）をまたぐ箱
  await addBox(page, 1090, 200, "跨ぐ")
  await openPreview(page)
  await expect(panel(page)).toContainText("印刷区画をまたいだボックスを直してください")
  await expect(panel(page).getByRole("button", { name: "跨ぐ" })).toBeVisible()
  await expect(preview(page)).toHaveCount(0)
  await expect(page.getByRole("tab")).toHaveCount(1) // 印刷プレビューにならず、編集のまま
})

test("マークダウンは、紙の高さでブロックの境目ごとに切って印刷区画に並べる（原文が空なら並べない）", async ({
  page,
}) => {
  await page.goto("/")
  const add = await newBook(page, "メモ", "マークダウン")
  await add.getByRole("button", { name: "作成" }).click()
  await expect(add).toBeHidden()
  await openPreview(page)
  await expect(page.getByText("印刷できるものはありません")).toBeVisible()
  await page.keyboard.press("Escape")
  const field = page.getByRole("region", { name: "ソース" }).getByRole("textbox")
  await field.click()
  // 段落 60 個（A4 縦の 1 枚には入らない）
  await page.keyboard.insertText(Array.from({ length: 60 }, (_, i) => `段落 ${i + 1}`).join("\n\n"))
  await expect(page.getByRole("region", { name: "プレビュー" })).toContainText("段落 60")
  await openPreview(page)
  await expect(async () => expect(await sheets(page).count()).toBeGreaterThan(1)).toPass()
  // 1 枚目は原文の頭から、最後の紙は途中のブロックから始まり、「段落 60」は最後の紙の中に見える（1 枚目の外）
  await expect(sheets(page).first().locator("[data-markdown-from]")).toHaveAttribute("data-markdown-from", "0")
  const lastFrom = Number(await sheets(page).last().locator("[data-markdown-from]").getAttribute("data-markdown-from"))
  expect(lastFrom).toBeGreaterThan(0)
  const inside = async (i: "first" | "last") => {
    const sheet = i === "first" ? sheets(page).first() : sheets(page).last()
    const box = (await sheet.boundingBox())!
    const text = (await sheet.getByText("段落 60", { exact: true }).boundingBox())!
    return text.y >= box.y && text.y + text.height <= box.y + box.height
  }
  expect(await inside("last")).toBe(true)
  expect(await inside("first")).toBe(false)
})

test("マークダウンの長い段落は、紙の高さに入る所で行の途中から次の紙に続ける", async ({ page }) => {
  await page.goto("/")
  const add = await newBook(page, "長文", "マークダウン")
  await add.getByRole("button", { name: "作成" }).click()
  await expect(add).toBeHidden()
  const field = page.getByRole("region", { name: "ソース" }).getByRole("textbox")
  await field.click()
  // 1 つの段落（改行を「  」で終える行を重ねて、A4 縦の 1 枚に入らない高さにする）
  await page.keyboard.insertText(Array.from({ length: 80 }, (_, i) => `行 ${i + 1}  `).join("\n"))
  await expect(page.getByRole("region", { name: "プレビュー" })).toContainText("行 80")
  await openPreview(page)
  await expect(async () => expect(await sheets(page).count()).toBeGreaterThan(1)).toPass()
  // どの紙も同じ段落（原文の頭のブロック）の続きで、最後の行は最後の紙に見える
  await expect(sheets(page).last().locator("[data-markdown-from]")).toHaveAttribute("data-markdown-from", "0")
  // 「行 80」の字そのものの四角（段落の要素は文書の長さだけあるので、字の範囲で測る）が、最後の紙の中にある
  const inside = await sheets(page)
    .last()
    .evaluate(sheet => {
      const walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const at = n.textContent?.indexOf("行 80") ?? -1
        if (at < 0) continue
        const range = document.createRange()
        range.setStart(n, at)
        range.setEnd(n, at + 4)
        const r = range.getBoundingClientRect()
        const box = sheet.getBoundingClientRect()
        return r.top >= box.top && r.bottom <= box.bottom
      }
      return false
    })
  expect(inside).toBe(true)
})
