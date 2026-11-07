// マークダウンのブック（@matomezu/markdown）: 紙を置かず、ソースとプレビューのペインを左右に並べて開く。上の行のボタンで並べ方を変え、右クリックでページの設定を開く
import { expect, type Page, test } from "./fixtures"
import { newBook } from "./helpers/master"
import { openGeneral, settingsDialog } from "./helpers/settings"
import { fromMenu } from "./helpers/stage-menu"

// マスターでマークダウンのブックを作り、ページを 1 つ作る
async function markdownBook(page: Page) {
  await page.goto("/")
  const add = await newBook(page, "メモ", "マークダウン")
  await expect(add.getByText("可変ページ")).toHaveCount(0) // いつも可変ページなので選ばせない
  await add.getByRole("button", { name: "作成" }).click()
}

const pane = (page: Page, name: string) => page.getByRole("region", { name })

test("紙を置かずに、ソースとプレビューを左右に並べて開く。上の行のボタンで、ソースだけ・プレビューだけ・上下に並べるに変える（押したボタンは押した見た目）", async ({
  page,
}) => {
  await markdownBook(page)
  const stage = page.locator("[data-stage]").first()
  await expect(stage).toHaveAttribute("data-paper", "false")
  await expect(pane(page, "ソース")).toBeVisible()
  await expect(pane(page, "プレビュー")).toBeVisible()
  const source = (await pane(page, "ソース").boundingBox())!
  const preview = (await pane(page, "プレビュー").boundingBox())!
  expect(preview.x).toBeGreaterThan(source.x) // 左右
  // 紙（A4）より狭いペインでは、紙の幅のまま縮めて収める（横にはみ出さない）
  const article = (await pane(page, "プレビュー").locator("article").boundingBox())!
  expect(article.width).toBeLessThanOrEqual(preview.width)
  const button = (name: string) => page.getByRole("toolbar", { name: "ペイン" }).getByRole("button", { name })
  await expect(button("左右に並べる")).toHaveAttribute("aria-pressed", "true")

  await button("プレビューだけ").click()
  await expect(pane(page, "ソース")).toHaveCount(0)
  await expect(pane(page, "プレビュー")).toBeVisible()
  await expect(button("プレビューだけ")).toHaveAttribute("aria-pressed", "true")
  await expect(button("左右に並べる")).toHaveAttribute("aria-pressed", "false")
  await button("ソースだけ").click()
  await expect(pane(page, "ソース")).toBeVisible()
  await expect(pane(page, "プレビュー")).toHaveCount(0)

  await button("上下に並べる").click()
  const top = (await pane(page, "ソース").boundingBox())!
  const bottom = (await pane(page, "プレビュー").boundingBox())!
  expect(bottom.y).toBeGreaterThan(top.y) // 上下
})

test("並べ方のボタンは上の行の左端に並び、画面を分割して出たステージの閉じるボタン（右上）と重ならない", async ({
  page,
}) => {
  await markdownBook(page)
  await (await fromMenu(page, "画面を分割")).click()
  const stage = page.locator("[data-stage]").first()
  const bar = (await stage.getByRole("toolbar", { name: "ペイン" }).boundingBox())!
  const close = (await page.getByRole("button", { name: "ステージを閉じる" }).first().boundingBox())!
  const left = (await stage.boundingBox())!.x
  expect(bar.x - left).toBeLessThan(20)
  expect(bar.x + bar.width).toBeLessThan(close.x)
})

test("プレビューのペインの右クリックで、ページの設定を開いてページの名前を変えられる", async ({ page }) => {
  await markdownBook(page)
  await pane(page, "プレビュー").click({ button: "right", position: { x: 60, y: 120 } })
  await page.getByRole("menu").getByRole("menuitem", { name: "ページの設定" }).click()
  const dialog = page.getByRole("dialog", { name: "ページの設定" })
  await dialog.getByLabel("ページの名前").fill("1 章")
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("tab", { name: "1 章" })).toBeVisible()
})

test("ソースのペインに書くと描いた文書が変わる（読むのは Web Worker）。Tab キーは Tab 文字を書き、続けて書いた物を Mod+Z で元に戻し、Mod+Shift+Z でやり直す", async ({
  page,
}) => {
  await markdownBook(page)
  const field = () => pane(page, "ソース").getByRole("textbox")
  await field().click()
  await page.keyboard.type("# 見出し")
  await expect(pane(page, "プレビュー").getByRole("heading", { name: "見出し" })).toBeVisible()
  // 書いたあとの原文は、画面とは別の処理の流れ（Web Worker）で読む
  expect(page.workers().map(w => new URL(w.url()).pathname)).toContain("/markdown-parse-worker.js")
  await page.keyboard.press("Enter")
  await page.keyboard.press("Tab")
  await page.keyboard.type("本文")
  await expect(field()).toHaveValue("# 見出し\n\t本文")
  await page.keyboard.press("ControlOrMeta+z")
  await expect(field()).toHaveValue("")
  await page.keyboard.press("ControlOrMeta+Shift+z")
  await expect(field()).toHaveValue("# 見出し\n\t本文")
})

test("ソースのエディタは既定で行番号を出し、設定画面の「マークダウン」でカーソルのある行の下線と空白の印を入れられる（印は字を足さず、テキストFormの字の並びとずれない）", async ({
  page,
}) => {
  await page.goto("/")
  await openGeneral(page)
  await settingsDialog(page).getByRole("tab", { name: "マークダウン" }).click()
  const markdown = settingsDialog(page).getByRole("tabpanel", { name: "マークダウン" })
  await expect(markdown.getByRole("switch", { name: "行番号を出す" })).toBeChecked()
  await markdown.getByRole("switch", { name: "カーソルのある行に下線を引く" }).click()
  await markdown.getByRole("switch", { name: "空白と Tab を見せる" }).click()
  await expect(markdown.getByRole("switch", { name: "空白と Tab を見せる" })).toBeChecked()
  await page.keyboard.press("Escape")
  await markdownBook(page)
  const source = pane(page, "ソース")
  const field = source.getByRole("textbox")
  await field.click()
  const long = "長い行".repeat(40)
  await page.keyboard.type(`# 見出し\n- 項目 　末尾\n\tcode\n${long}`)
  await expect(source.locator("[data-line-numbers='true']")).toHaveCount(1)
  await expect(source.locator("[data-line]")).toHaveCount(4)
  // 書く所は 4 行目（折り返した長い行）
  await expect(source.locator("[data-current]")).toHaveAttribute("data-line", "4")
  await page.keyboard.press("ControlOrMeta+Home")
  await expect(source.locator("[data-current]")).toHaveAttribute("data-line", "1")
  await expect(source.locator("[data-blank='space']")).toHaveCount(3) // 「# 」「- 」「項目 」
  await expect(source.locator("[data-blank='wide']")).toHaveCount(1)
  await expect(source.locator("[data-blank='tab']")).toHaveCount(1)
  await expect(field).toHaveValue(`# 見出し\n- 項目 　末尾\n\tcode\n${long}`)
  // 写しとテキストFormの字の並びが同じなら、テキストFormの中身は写しの高さに収まる（はみ出さない）
  const overflow = await field.evaluate(el => el.scrollHeight - el.clientHeight)
  expect(overflow).toBeLessThanOrEqual(1)
  await source.screenshot({ path: "e2e/.results/markdown-source-look.png" })
})

test("描いた文書は、段落の中の改行 1 つを既定で改行にし、設定画面の「マークダウン」で空白（GFM のとおり）に変えられる", async ({
  page,
}) => {
  await markdownBook(page)
  await pane(page, "ソース").getByRole("textbox").click()
  await page.keyboard.type("一行目\n二行目")
  const paragraph = pane(page, "プレビュー").locator("p")
  await expect(paragraph).toContainText("二行目")
  // 段落が何行に描かれているか（字の四角の上端が何通りあるか。ペインを縮めて描いても変わらない）
  const lines = () =>
    paragraph.evaluate(el => {
      const range = document.createRange()
      range.selectNodeContents(el)
      return new Set([...range.getClientRects()].filter(r => r.width > 0).map(r => Math.round(r.top))).size
    })
  await expect.poll(lines).toBe(2)
  // フッタメニューから設定画面を開き、マークダウンを開いたまま変える
  await (await fromMenu(page, "設定を開く")).click()
  await settingsDialog(page).getByRole("tab", { name: "マークダウン" }).click()
  const select = settingsDialog(page).getByLabel("段落の中の改行")
  await expect(select).toHaveValue("line-break")
  await select.selectOption({ label: "空白にする（GFM方式）" })
  await page.keyboard.press("Escape")
  await expect.poll(lines).toBe(1)
})
