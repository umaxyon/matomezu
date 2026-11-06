// マークダウンのブック（@matomezu/markdown）: 紙を置かず、ソースとプレビューのペインを左右に並べて開く。上の行のボタンで並べ方を変え、右クリックでページの設定を開く
import { expect, type Page, test } from "./fixtures"
import { newBook } from "./helpers/master"

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
