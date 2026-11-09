// スライドのブックのページ一覧（ステージの左の縦の列）: サムネイルを並べ、押して開く・ドラッグで並べ替え・右クリックで ここに追加・複製・削除（確認つき）。ページタブは出ない
import { BOOK_SCREEN_URL, expect, test } from "./fixtures"

const page3 = (id: string, title: string) => ({
  id,
  title,
  paper: "@matomezu/base:ratio-16x9",
  orientation: "landscape",
  slide: [
    {
      id: `${id}-t`,
      x: 80,
      y: 60,
      item: "@matomezu/slide:slide-text",
      w: 500,
      h: 80,
      props: { text: `${title}の文字`, fontSize: 48 },
    },
  ],
})

test.use({
  books: [
    {
      type: "@matomezu/slide-book:slide",
      id: "b1",
      title: "スライド",
      project: "default",
      pages: [page3("p1", "一枚目"), page3("p2", "二枚目"), page3("p3", "三枚目")],
    },
  ],
})

test("ページ一覧はサムネイルを縦に並べ、ページタブは出ない。押したページが開く", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const list = page.locator("[data-page-list]")
  await expect(list).toBeVisible()
  await expect(page.getByRole("tab")).toHaveCount(0)
  const pages = list.locator("[data-page]")
  await expect(pages).toHaveCount(3)
  await expect(pages.nth(0).locator("button")).toHaveAttribute("aria-current", "page")
  await expect(pages.nth(1)).toContainText("二枚目の文字") // サムネイルに中身が描かれる
  await pages.nth(1).locator("button").click()
  await expect(pages.nth(1).locator("button")).toHaveAttribute("aria-current", "page")
  await expect(page.locator('[data-item="p2-t"]').first()).toBeVisible()
})

test("サムネイルをドラッグして並べ替える", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const pages = page.locator("[data-page-list] [data-page]")
  await expect(pages).toHaveCount(3)
  const from = (await pages.nth(0).boundingBox())!
  const to = (await pages.nth(2).boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height - 2, { steps: 8 })
  await page.mouse.up()
  await expect(pages.nth(2).locator("button")).toHaveAttribute("aria-label", "一枚目")
  await expect(pages.nth(0).locator("button")).toHaveAttribute("aria-label", "二枚目")
})

test("右クリックで、ここに追加・複製・削除ができる（削除は確認つき）", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const pages = page.locator("[data-page-list] [data-page]")
  await pages.nth(0).locator("button").click({ button: "right" })
  await page.getByRole("menuitem", { name: "ここに追加" }).click()
  await expect(pages).toHaveCount(4)
  await expect(pages.nth(1).locator("button")).toHaveAttribute("aria-label", /ページ/)
  await pages.nth(0).locator("button").click({ button: "right" })
  await page.getByRole("menuitem", { name: "複製" }).click()
  await expect(pages).toHaveCount(5)
  await expect(pages.nth(1)).toContainText("一枚目の文字")
  await pages.nth(1).locator("button").click({ button: "right" })
  await page.getByRole("menuitem", { name: "削除…" }).click()
  const dialog = page.getByRole("dialog", { name: "ページを削除" })
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "削除" }).click()
  await expect(pages).toHaveCount(4)
})
