// マークダウンのブック（@matomezu/markdown）: 紙を置かず、ソースとプレビューのペインを左右に並べて開く。ペインのタブの右クリックで分割を閉じ・並べ直す
import { expect, type Page, test } from "./fixtures"

async function fromMenu(page: Page, name: string) {
  const trigger = page.locator('button[aria-haspopup="menu"]').first()
  await trigger.hover()
  return trigger.locator("xpath=../following-sibling::div[1]").getByRole("button", { name })
}

// マスターでマークダウンのブックを作り、ページを 1 つ作る
async function markdownBook(page: Page) {
  await page.goto("/")
  await (await fromMenu(page, "ホーム")).click()
  await page.getByRole("button", { name: "新しいブック" }).click()
  const dialog = page.getByRole("dialog", { name: "新しいブック" })
  await page.keyboard.type("メモ")
  await dialog.getByLabel("ブックのタイプ").selectOption({ label: "マークダウン" })
  await dialog.getByRole("button", { name: "作成" }).click()
  await page.getByRole("button", { name: "ページを作る" }).click()
  const add = page.getByRole("dialog", { name: "新しいページ" })
  await expect(add.getByText("可変ページ")).toHaveCount(0) // いつも可変ページなので選ばせない
  await add.getByRole("button", { name: "作成" }).click()
}

const pane = (page: Page, name: string) => page.getByRole("region", { name })

test("紙を置かずに、ソースとプレビューを左右に並べて開く。タブの右クリックで分割を閉じるとタブで切り替え、横分割で上下に並べる", async ({
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

  await pane(page, "ソース").getByRole("tab", { name: "ソース" }).click({ button: "right" })
  await page.getByRole("menuitem", { name: "分割を閉じる" }).click()
  await expect(pane(page, "ソース")).toHaveCount(0)
  await expect(pane(page, "プレビュー")).toBeVisible()
  await page.getByRole("tab", { name: "ソース" }).click()
  await expect(pane(page, "ソース")).toBeVisible()
  await expect(pane(page, "プレビュー")).toHaveCount(0)

  await page.getByRole("tab", { name: "プレビュー" }).click({ button: "right" })
  await page.getByRole("menuitem", { name: "横分割" }).click()
  const top = (await pane(page, "ソース").boundingBox())!
  const bottom = (await pane(page, "プレビュー").boundingBox())!
  expect(bottom.y).toBeGreaterThan(top.y) // 上下
})
