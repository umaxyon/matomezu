// スライドのアイテムの重なり順（右クリックのメニューとキー）・複数選択・線の端点
import { pagesBook } from "../test/lineup"
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
    pagesBook({
      type: "@matomezu/slide-book:slide",
      id: "b1",
      title: "スライド",
      pages: [
        {
          id: "p1",
          title: "1",
          paper: "@matomezu/base:ratio-16x9",
          orientation: "landscape",
          slide: [ellipse("e1", 100), ellipse("e2", 400), ellipse("e3", 700)],
        },
      ],
    }),
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

test("右クリックのメニューで重なり順を変えられ、選んだ物を消すのもここから", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  expect(await order(page)).toEqual(["e1", "e2", "e3"])
  const p = await at(page, 130, 300)
  await page.mouse.click(p.x, p.y, { button: "right" })
  await page.getByRole("menuitem", { name: "最前面へ" }).click()
  await expect.poll(() => order(page)).toEqual(["e2", "e3", "e1"])
  await page.mouse.click(p.x, p.y, { button: "right" })
  await page.getByRole("menuitem", { name: "消す" }).click()
  await expect.poll(() => order(page)).toEqual(["e2", "e3"])
})

test("キーで重なり順を変えられ、元に戻せる", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const p = await at(page, 130, 300)
  await page.mouse.click(p.x, p.y)
  await page.keyboard.press("Control+Alt+]")
  await expect.poll(() => order(page)).toEqual(["e2", "e1", "e3"])
  await page.keyboard.press("Control+z")
  await expect.poll(() => order(page)).toEqual(["e1", "e2", "e3"])
})

const topOf = async (page: Page, id: string) => (await page.locator(`[data-item="${id}"]`).boundingBox())!.y

test("ドラッグ枠と Shift+クリックで複数を選び、全体の枠の縁やアイテムで一緒に動かし、重なり順も全部に効き（元に戻すは 1 回）、Delete で全部消せる", async ({
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
  // 全体の枠の縁をつかんでも、選んだ物が一緒に動く
  const edge = (await page.locator('[data-group-edge="top"]').boundingBox())!
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2)
  await page.mouse.down()
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2 + 60 * grab.z, { steps: 6 })
  await page.mouse.up()
  expect((await topOf(page, "e1")) - before[0]!).toBeGreaterThan(30)
  await page.keyboard.press("Control+z")
  await expect.poll(async () => [await topOf(page, "e1"), await topOf(page, "e2")]).toEqual([before[0], before[1]])
  // 重なり順は選んだ物どうしの前後を保って全部に効き、元に戻すは 1 回
  await page.keyboard.press("Control+Alt+Shift+]")
  await expect.poll(() => order(page)).toEqual(["e3", "e1", "e2"])
  await page.keyboard.press("Control+z")
  await expect.poll(() => order(page)).toEqual(["e1", "e2", "e3"])
  // 複数を選んでいて、動かさずに離すと、押した物だけを選ぶ
  const only = await at(page, 130, 300)
  await page.mouse.click(only.x, only.y)
  await expect(page.locator("[data-group-edge]")).toHaveCount(0)
  await expect(page.locator("[data-grip]")).toHaveCount(8)
  // Shift+クリックで足す・外す
  const third = await at(page, 850, 300)
  await page.keyboard.down("Shift")
  await page.mouse.click(third.x, third.y)
  await page.keyboard.up("Shift")
  await expect(page.locator("[data-group-edge]")).toHaveCount(4)
  await page.keyboard.down("Shift")
  await page.mouse.click(only.x, only.y)
  await page.keyboard.up("Shift")
  await page.keyboard.press("Delete")
  await expect.poll(() => order(page)).toEqual(["e1", "e2"]) // e1 を足して外したので、選んでいた e3 だけが消える
})

test.describe("線の端点", () => {
  const line = (id: string, item: string, props: object) => ({
    id,
    x: 200,
    y: 200,
    item,
    w: 300,
    h: 150,
    props,
  })
  test.use({
    books: [
      pagesBook({
        type: "@matomezu/slide-book:slide",
        id: "b1",
        title: "スライド",
        pages: [
          {
            id: "p1",
            title: "1",
            paper: "@matomezu/base:ratio-16x9",
            orientation: "landscape",
            slide: [
              line("l1", "@matomezu/slide:slide-line", { width: 4, color: "#286983" }),
              {
                ...line("f1", "@matomezu/slide:slide-free-line", {
                  points: [
                    { x: 0, y: 1 },
                    { x: 0.5, y: 0 },
                    { x: 1, y: 1 },
                  ],
                  width: 4,
                }),
                x: 700,
              },
            ],
          },
        ],
      }),
    ],
  })

  async function drag(page: Page, handle: string, to: [number, number], shift = false) {
    const h = (await page.locator(handle).boundingBox())!
    const z = (await paper(page).boundingBox())!.width / WIDE_WIDTH
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
    if (shift) await page.keyboard.down("Shift")
    await page.mouse.down()
    await page.mouse.move(h.x + h.width / 2 + to[0] * z, h.y + h.height / 2 + to[1] * z, { steps: 6 })
    await page.mouse.up()
    if (shift) await page.keyboard.up("Shift")
  }

  test("直線は両端、自由な線は全部の点に丸いつまみが出て、ドラッグで点を動かせる。元に戻すは 1 回", async ({
    page,
  }) => {
    await page.goto(BOOK_SCREEN_URL)
    const p = await at(page, 300, 275)
    await page.mouse.click(p.x, p.y)
    await expect(page.locator("[data-point]")).toHaveCount(2)
    await expect(page.locator("[data-grip]")).toHaveCount(0) // 枠の大きさのつまみは出ない
    const before = (await page.locator('[data-item="l1"]').boundingBox())!
    await drag(page, '[data-point="1"]', [100, 120])
    const after = (await page.locator('[data-item="l1"]').boundingBox())!
    expect(after.width).toBeGreaterThan(before.width + 30)
    expect(after.height).toBeGreaterThan(before.height + 30)
    await page.keyboard.press("Control+z")
    await expect
      .poll(async () => Math.round((await page.locator('[data-item="l1"]').boundingBox())!.width))
      .toBe(Math.round(before.width))
    const f = await at(page, 850, 275)
    await page.mouse.click(f.x, f.y)
    await expect(page.locator("[data-point]")).toHaveCount(3)
    await expect(page.locator("[data-grip]")).toHaveCount(0)
    const free = (await page.locator('[data-item="f1"]').boundingBox())!
    await drag(page, '[data-point="1"]', [0, -90]) // 真ん中の点を上へ
    const grown = (await page.locator('[data-item="f1"]').boundingBox())!
    expect(grown.height).toBeGreaterThan(free.height + 40)
    expect(Math.abs(grown.y + grown.height - (free.y + free.height))).toBeLessThan(2) // 下の端の点は動かない
  })

  test("Shift を押して動かすと、となりの点から 45 度ずつの向きに丸まる（水平にもなる）", async ({ page }) => {
    await page.goto(BOOK_SCREEN_URL)
    const p = await at(page, 300, 275)
    await page.mouse.click(p.x, p.y)
    await drag(page, '[data-point="1"]', [200, 8], true) // ほぼ真横へ
    const box = (await page.locator('[data-item="l1"]').boundingBox())!
    const z = (await paper(page).boundingBox())!.width / WIDE_WIDTH
    expect(box.height / z).toBeLessThan(12) // 水平なので、枠の高さは下限
  })
})
