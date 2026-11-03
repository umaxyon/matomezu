// 図面の複数選択（D84）: Mod+クリックで選択に足す・外し、選択の道具で何も無い所からドラッグした四角で選ぶ。選んだ物はまとめて消え、まとめて動く
import { expect, type Page, test } from "@playwright/test"
import { footerMenuTool } from "./footer-menu"

const items = (page: Page) => page.locator("[data-item]")

// 紙の左上から (x, y) の画面の座標
async function onPaper(page: Page, x: number, y: number) {
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  return { x: paper.x + x, y: paper.y + y }
}

// 紙の (x, y) に箱を置く
async function addBox(page: Page, x: number, y: number) {
  await (await footerMenuTool(page, "箱")).click()
  const at = await onPaper(page, x, y)
  await page.mouse.click(at.x, at.y)
  const dialog = page.getByRole("dialog", { name: "ボックスの追加" })
  await dialog.getByRole("button", { name: "追加" }).click()
  await expect(dialog).toBeHidden()
}

async function threeBoxes(page: Page) {
  await page.goto("/")
  for (const x of [100, 300, 500]) await addBox(page, x, 150)
  await expect(items(page)).toHaveCount(3)
}

// Ctrl を押したまま (x, y) を押す
async function ctrlClick(page: Page, at: { x: number; y: number }) {
  await page.keyboard.down("Control")
  await page.mouse.click(at.x, at.y)
  await page.keyboard.up("Control")
}

const center = async (page: Page, i: number) => {
  const b = (await items(page).nth(i).boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

test("Ctrl+クリックで箱を選択に足し、もう一度で外す。選んだ物の 1 つを押して離すとその 1 つになり、Delete で選んだ物をまとめて消す", async ({
  page,
}) => {
  await threeBoxes(page)
  const [a, b, c] = [await center(page, 0), await center(page, 1), await center(page, 2)]
  await page.mouse.click(a.x, a.y)
  await ctrlClick(page, c)
  await ctrlClick(page, b)
  await expect(page.locator('[data-item][data-selected="true"]')).toHaveCount(3)
  await ctrlClick(page, b)
  await expect(items(page).nth(1)).toHaveAttribute("data-selected", "false")
  // 複数を選んでいる間は、大きさを変えるつまみを出さない
  await expect(page.locator("[data-grip]")).toHaveCount(0)
  await page.mouse.click(a.x, a.y)
  await expect(page.locator('[data-item][data-selected="true"]')).toHaveCount(1)
  await ctrlClick(page, c)
  await page.keyboard.press("Delete")
  await expect(items(page)).toHaveCount(1)
})

test("選択の道具で何も無い所からドラッグすると四角が出て、かかった箱が選ばれる。選んだ箱はまとめて動く。Ctrl を押した範囲のドラッグは選択に足す", async ({
  page,
}) => {
  await threeBoxes(page)
  const [a, b] = [(await items(page).nth(0).boundingBox())!, (await items(page).nth(1).boundingBox())!]
  const from = await onPaper(page, 60, 100)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(b.x + 10, b.y + 10, { steps: 5 })
  await expect(page.locator("[data-sweep]")).toBeVisible()
  await page.mouse.up()
  await expect(page.locator("[data-sweep]")).toHaveCount(0)
  await expect(items(page).nth(0)).toHaveAttribute("data-selected", "true")
  await expect(items(page).nth(1)).toHaveAttribute("data-selected", "true")
  await expect(items(page).nth(2)).toHaveAttribute("data-selected", "false")
  await page.mouse.move(a.x + 20, a.y + 20)
  await page.mouse.down()
  await page.mouse.move(a.x + 20, a.y + 140, { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => Math.round((await items(page).nth(0).boundingBox())!.y - a.y)).toBe(120)
  expect(Math.round((await items(page).nth(1).boundingBox())!.y - b.y)).toBe(120)
  // Ctrl を押した範囲のドラッグは、前の選択に足す
  const c = (await items(page).nth(2).boundingBox())!
  await page.mouse.click(c.x + 10, c.y + 10)
  const around = await onPaper(page, 60, 220)
  await page.keyboard.down("Control")
  await page.mouse.move(around.x, around.y)
  await page.mouse.down()
  await page.mouse.move(a.x + 10, a.y + 130, { steps: 5 })
  await page.mouse.up()
  await page.keyboard.up("Control")
  await expect(page.locator('[data-item][data-selected="true"]')).toHaveCount(2)
  await expect(items(page).nth(0)).toHaveAttribute("data-selected", "true")
  await expect(items(page).nth(2)).toHaveAttribute("data-selected", "true")
})

test("線も Ctrl+クリックで選択に足し、もう一度で外す", async ({ page }) => {
  await page.goto("/")
  for (const x of [100, 500]) await addBox(page, x, 150)
  const empty = await onPaper(page, 600, 500)
  await page.mouse.click(empty.x, empty.y)
  const boxes = page.locator("[data-item][data-shape]")
  const s = (await boxes.nth(0).boundingBox())!
  const e = (await boxes.nth(1).boundingBox())!
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2)
  const r = (await boxes.nth(0).locator('[data-port="r"]').boundingBox())!
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
  await page.mouse.down()
  await page.mouse.move(e.x + 10, e.y + e.height / 2, { steps: 5 })
  await page.mouse.up()
  const line = page.locator("[data-item]:not([data-shape])")
  await expect(line).toHaveCount(1)
  await page.mouse.click(s.x + 10, s.y + 10)
  const l = (await line.boundingBox())!
  await ctrlClick(page, { x: l.x + l.width / 2, y: l.y + l.height / 2 })
  await expect(line).toHaveAttribute("data-selected", "true")
  await expect(boxes.nth(0)).toHaveAttribute("data-selected", "true")
  await ctrlClick(page, { x: l.x + l.width / 2, y: l.y + l.height / 2 })
  await expect(line).not.toHaveAttribute("data-selected", "true")
  await expect(boxes.nth(0)).toHaveAttribute("data-selected", "true")
})
