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

const topOf = async (page: Page, id: string) => (await page.locator(`[data-item="${id}"]`).boundingBox())!.y

test("範囲ドラッグと Shift+クリックで複数を選び、全体の枠で一緒に動かし（元に戻すは 1 回）、Delete で全部消せる", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  const from = await at(page, 50, 150)
  const to = await at(page, 650, 450)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await page.mouse.up()
  await expect(page.locator("[data-group-edge]")).toHaveCount(4)
  await expect(page.locator("[data-grip]")).toHaveCount(0) // 大きさ・回すつまみは出ない
  await expect(page.locator("[data-bar]")).toBeVisible()
  const before = [await topOf(page, "e1"), await topOf(page, "e2"), await topOf(page, "e3")]
  const grab = await at(page, 150, 300)
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  await page.mouse.move(grab.x, grab.y + 60 * grab.z, { steps: 6 })
  await page.mouse.up()
  expect((await topOf(page, "e1")) - before[0]!).toBeGreaterThan(30)
  expect((await topOf(page, "e2")) - before[1]!).toBeGreaterThan(30)
  expect(await topOf(page, "e3")).toBeCloseTo(before[2]!, 0)
  await page.keyboard.press("Control+z") // 2 つとも、1 回で戻る
  await expect.poll(async () => [await topOf(page, "e1"), await topOf(page, "e2")]).toEqual([before[0], before[1]])
  // Shift+クリックで足す・外す
  const third = await at(page, 850, 300)
  await page.keyboard.down("Shift")
  await page.mouse.click(third.x, third.y)
  await page.keyboard.up("Shift")
  await expect(page.locator("[data-group-edge]")).toHaveCount(4)
  const first = await at(page, 130, 300)
  await page.keyboard.down("Shift")
  await page.mouse.click(first.x, first.y)
  await page.keyboard.up("Shift")
  await page.keyboard.press("Delete")
  expect(await order(page)).toEqual(["e1"]) // 選んでいた e2・e3 が消え、外した e1 が残る
})

test("複数を選んで重なり順を変えると、選んだ物どうしの前後を保つ", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const from = await at(page, 50, 150)
  const to = await at(page, 650, 450)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await page.mouse.up()
  await page.keyboard.press("Control+Shift+{") // 最背面へ（e1・e2 はもともと e3 より後ろ）
  expect(await order(page)).toEqual(["e1", "e2", "e3"])
  await page.keyboard.press("Control+Shift+}") // 最前面へ
  expect(await order(page)).toEqual(["e3", "e1", "e2"])
})
