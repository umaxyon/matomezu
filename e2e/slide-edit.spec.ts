// スライドのアイテムの重なり順（右クリックのメニューとキー）・複数選択・線の端点
import { BOOK_SCREEN_URL, expect, type Page, test } from "./fixtures"
import { onPaper, paper } from "./helpers/paper"

const ellipse = (id: string, x: number) => ({
  id,
  x,
  y: 200,
  item: "@matomezu/slide:slide-ellipse",
  w: 300,
  h: 200,
  props: { fill: "#f6c177", stroke: "#286983", width: 3 },
})

test.use({
  books: [
    {
      type: "@matomezu/slide-book:slide",
      id: "b1",
      title: "スライド",
      project: "default",
      pages: [
        {
          id: "p1",
          title: "1",
          paper: "@matomezu/base:ratio-16x9",
          orientation: "landscape",
          slide: [ellipse("e1", 100), ellipse("e2", 400), ellipse("e3", 700)],
        },
      ],
    },
  ],
})

const WIDE_WIDTH = 1280

// 紙の上の点（1280 幅の px）の画面の座標
async function at(page: Page, x: number, y: number) {
  const origin = await onPaper(page, 0, 0)
  const z = (await paper(page).boundingBox())!.width / WIDE_WIDTH
  return { x: origin.x + x * z, y: origin.y + y * z, z }
}

const order = (page: Page) => page.locator("[data-item]").evaluateAll(els => els.map(e => e.getAttribute("data-item")))

test("右クリックのメニューで重なり順を変えられる。選んだ物を消すのもここから", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  expect(await order(page)).toEqual(["e1", "e2", "e3"])
  const p = await at(page, 130, 300)
  await page.mouse.click(p.x, p.y, { button: "right" })
  await page.getByRole("menuitem", { name: "最前面へ" }).click()
  expect(await order(page)).toEqual(["e2", "e3", "e1"])
  await page.mouse.click(p.x, p.y, { button: "right" })
  await page.getByRole("menuitem", { name: "最背面へ" }).click()
  expect(await order(page)).toEqual(["e1", "e2", "e3"])
  await page.mouse.click(p.x, p.y, { button: "right" })
  await page.getByRole("menuitem", { name: "1 つ前へ" }).click()
  expect(await order(page)).toEqual(["e2", "e1", "e3"])
  await page.mouse.click(p.x, p.y, { button: "right" })
  await page.getByRole("menuitem", { name: "1 つ後ろへ" }).click()
  expect(await order(page)).toEqual(["e1", "e2", "e3"])
  await page.mouse.click(p.x, p.y, { button: "right" })
  await page.getByRole("menuitem", { name: "消す" }).click()
  expect(await order(page)).toEqual(["e2", "e3"])
})

test("キーで重なり順を変えられ、元に戻せる", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const p = await at(page, 130, 300)
  await page.mouse.click(p.x, p.y)
  await page.keyboard.press("Control+]")
  expect(await order(page)).toEqual(["e2", "e1", "e3"])
  await page.keyboard.press("Control+Shift+}")
  expect(await order(page)).toEqual(["e2", "e3", "e1"])
  await page.keyboard.press("Control+[")
  expect(await order(page)).toEqual(["e2", "e1", "e3"])
  await page.keyboard.press("Control+Shift+{")
  expect(await order(page)).toEqual(["e1", "e2", "e3"])
  await page.keyboard.press("Control+z")
  await expect.poll(() => order(page)).toEqual(["e2", "e1", "e3"])
})
