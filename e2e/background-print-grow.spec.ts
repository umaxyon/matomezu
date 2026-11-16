// 背景の印刷「必ず」: 可変ページで、中身の外枠の外にある背景だけの印刷区画も、印刷プレビューに並ぶ（「中身があれば」では並ばない）
import { drawingPage, testBook, withSlide } from "../test/lineup"
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

// 背景の印刷 print を選んだ（書かなければ選ばない）ブック
const bookWith = (print?: "always") =>
  testBook("b1", "図面", [
    withSlide(
      drawingPage("p1", {
        grows: "right-down",
        items: [{ id: "n1", item: "@matomezu/box:shape-nest-box", x: 40, y: 40, props: { caption: "箱" } }],
        ...(print ? { settings: { "@matomezu/base:background-print": print } } : {}),
      }),
      [farEllipse],
    ),
  ])

test.describe("必ず", () => {
  test.use({ books: [bookWith("always")] })
  test("背景だけの印刷区画も印刷プレビューに並び、背景が描かれる", async ({ page }) => {
    await page.goto(BOOK_SCREEN_URL)
    await (await fromMenu(page, "印刷プレビュー")).click()
    await expect(page.locator("[data-sheet]")).toHaveCount(4)
    await expect(page.locator("[data-sheet]").nth(3).locator("svg").first()).toBeVisible() // 右下の区画の背景の楕円
  })
})

test.describe("中身があれば", () => {
  test.use({ books: [bookWith()] })
  test("背景だけの印刷区画は並ばない", async ({ page }) => {
    await page.goto(BOOK_SCREEN_URL)
    await (await fromMenu(page, "印刷プレビュー")).click()
    await expect(page.locator("[data-sheet]")).toHaveCount(1)
  })
})
