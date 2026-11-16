// ツリーとディレクトリ構成図の背景の印刷: ブックの設定に「背景の印刷」が出て、「必ず」にすると背景だけの印刷区画も印刷プレビューに並ぶ
import { DIR, TREE, testBook, testPage, withSlide } from "../test/lineup"
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

const SETTING = "@matomezu/base:background-print"

// 背景の印刷 print を選んだ（書かなければ選ばない）ブック
const treeBook = (print?: "always") =>
  testBook("t1", "木", [
    withSlide(
      testPage(TREE, "p1", {
        grows: "right-down",
        root: { id: "root", caption: "根", children: [] },
        ...(print ? { settings: { [SETTING]: print } } : {}),
      }),
      [farEllipse],
    ),
  ])

const dirBook = (print?: "always") =>
  testBook("d1", "構成", [
    withSlide(
      testPage(DIR, "p1", {
        orientation: "portrait",
        grows: "down",
        root: { id: "root", kind: "folder", name: "proj", children: [] },
        ...(print ? { settings: { [SETTING]: print } } : {}),
      }),
      [{ ...farEllipse, x: 200, y: 1500 }],
    ),
  ])

for (const [name, make] of [
  ["ツリー", treeBook],
  ["ディレクトリ構成図", dirBook],
] as const) {
  test.describe(`${name}: 必ず`, () => {
    test.use({ books: [make("always")] })
    test("背景だけの印刷区画も印刷プレビューに並ぶ", async ({ page }) => {
      await page.goto(BOOK_SCREEN_URL)
      await (await fromMenu(page, "印刷プレビュー")).click()
      expect(await page.locator("[data-sheet]").count()).toBeGreaterThan(1)
    })
  })

  test.describe(`${name}: 中身があれば`, () => {
    test.use({ books: [make()] })
    test("背景だけの印刷区画は並ばない", async ({ page }) => {
      await page.goto(BOOK_SCREEN_URL)
      await (await fromMenu(page, "印刷プレビュー")).click()
      await expect(page.locator("[data-sheet]")).toHaveCount(1)
    })
  })
}
