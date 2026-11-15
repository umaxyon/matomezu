// 背景の印刷「必ず」: 可変ページで、中身の外枠の外にある背景だけの印刷区画も、印刷プレビューに並ぶ（「中身があれば」では並ばない）
import { pagesBook } from "../test/lineup"
import { BOOK_SCREEN_URL, expect, test } from "./fixtures"
import { fromMenu } from "./helpers/stage-menu"

const farEllipse = {
  id: "far",
  x: 1500,
  y: 1000,
  item: "@matomezu/slide:slide-ellipse",
  w: 300,
  h: 200,
  props: { fill: "#f6c177", stroke: "#286983", width: 3 },
}

const bookWith = (settings: Readonly<Record<string, unknown>>) =>
  pagesBook({
    type: "@matomezu/drawing:drawing",
    id: "b1",
    title: "図面",
    settings,
    pages: [
      {
        id: "p1",
        title: "ページ 1",
        paper: "@matomezu/base:a4",
        orientation: "landscape",
        grows: "right-down",
        items: [{ id: "n1", item: "@matomezu/box:shape-nest-box", x: 40, y: 40, props: { caption: "箱" } }],
        slide: [farEllipse],
      },
    ],
  })

test.describe("必ず", () => {
  test.use({ books: [bookWith({ "@matomezu/base:background-print": "always" })] })
  test("背景だけの印刷区画も印刷プレビューに並び、背景が描かれる", async ({ page }) => {
    await page.goto(BOOK_SCREEN_URL)
    await (await fromMenu(page, "印刷プレビュー")).click()
    await expect(page.locator("[data-sheet]")).toHaveCount(4)
    await expect(page.locator("[data-sheet]").nth(3).locator("svg").first()).toBeVisible() // 右下の区画の背景の楕円
  })
})

test.describe("中身があれば", () => {
  test.use({ books: [bookWith({})] })
  test("背景だけの印刷区画は並ばない", async ({ page }) => {
    await page.goto(BOOK_SCREEN_URL)
    await (await fromMenu(page, "印刷プレビュー")).click()
    await expect(page.locator("[data-sheet]")).toHaveCount(1)
  })
})
