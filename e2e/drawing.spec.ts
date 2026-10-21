import { expect, type Page, test } from "@playwright/test"

const items = (page: Page) => page.locator("[data-item]")

// 紙の左上から (x, y) の画面の座標
async function onPaper(page: Page, x: number, y: number) {
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  return { x: paper.x + x, y: paper.y + y }
}

test("箱のツールを押すとポインタに点線の箱が付き、紙の上で押すとそこに置かれて選ばれ、道具は選択に戻る", async ({
  page,
}) => {
  await page.goto("/")
  await page.getByRole("button", { name: "箱" }).click()
  await expect(page.getByRole("button", { name: "箱" })).toHaveAttribute("aria-pressed", "true")
  const at = await onPaper(page, 200, 150)
  await page.mouse.move(at.x, at.y)
  const ghost = page.locator("[data-fits]")
  await expect(ghost).toHaveAttribute("data-fits", "true")
  // 点線の箱の左上は、ポインタから左へ 16px、上へ 12px
  const g = (await ghost.boundingBox())!
  expect(Math.round(at.x - g.x)).toBe(16)
  expect(Math.round(at.y - g.y)).toBe(12)
  await page.mouse.down()
  await page.mouse.up()
  await expect(items(page)).toHaveCount(1)
  await expect(items(page)).toHaveAttribute("data-selected", "true")
  await expect(ghost).toHaveCount(0)
  await expect(page.getByRole("button", { name: "箱" })).toHaveAttribute("aria-pressed", "false")
  await expect(page.getByRole("button", { name: "選択ツール" })).toBeVisible()
})

test("紙からはみ出す所では点線の箱が薄くなり、押しても置かない。Escape で取り消す", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "箱" }).click()
  const at = await onPaper(page, 5, 5)
  await page.mouse.move(at.x, at.y)
  await expect(page.locator("[data-fits]")).toHaveAttribute("data-fits", "false")
  await page.mouse.down()
  await page.mouse.up()
  await expect(items(page)).toHaveCount(0)
  await page.keyboard.press("Escape")
  await expect(page.locator("[data-fits]")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "箱" })).toHaveAttribute("aria-pressed", "false")
})

test("選択の道具で箱をドラッグすると動き、何も無い所を押すと選択が外れる。ハンドの道具では箱ごと紙がずれる", async ({
  page,
}) => {
  await page.goto("/")
  await page.getByRole("button", { name: "箱" }).click()
  const at = await onPaper(page, 200, 150)
  await page.mouse.click(at.x, at.y)
  const box = items(page)
  const before = (await box.boundingBox())!
  await page.mouse.move(before.x + 20, before.y + 20)
  await page.mouse.down()
  await page.mouse.move(before.x + 120, before.y + 70, { steps: 5 })
  await page.mouse.up()
  const after = (await box.boundingBox())!
  expect(Math.round(after.x - before.x)).toBe(100)
  expect(Math.round(after.y - before.y)).toBe(50)
  const empty = await onPaper(page, 600, 500)
  await page.mouse.click(empty.x, empty.y)
  await expect(box).toHaveAttribute("data-selected", "false")

  await page.getByRole("button", { name: "選択ツール" }).click()
  await page.getByRole("button", { name: "付け替えツール" }).click()
  const paper = page.getByRole("img", { name: "紙" })
  const p0 = (await paper.boundingBox())!
  await page.mouse.move(after.x + 20, after.y + 20)
  await page.mouse.down()
  await page.mouse.move(after.x - 80, after.y - 80, { steps: 5 })
  await page.mouse.up()
  const p1 = (await paper.boundingBox())!
  const moved = (await box.boundingBox())!
  expect(p1.y).toBeLessThan(p0.y)
  expect(Math.round(moved.x - after.x)).toBe(Math.round(p1.x - p0.x))
  expect(Math.round(moved.y - after.y)).toBe(Math.round(p1.y - p0.y))
})
