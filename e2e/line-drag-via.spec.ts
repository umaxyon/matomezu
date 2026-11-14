// 線の手直し（途中の区間を動かした折れ目）は、つなぐ両端の形をまとめてドラッグしている最中も、形と一緒に平行に動く
import { BOOK_SCREEN_URL, expect, test } from "./fixtures"
import { addBox, onPaper } from "./helpers/paper"

test("手直しした線は、形を全部選んでドラッグしている間も形を保って平行に動く", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  await addBox(page, 100, 150)
  await addBox(page, 500, 350)
  const empty = await onPaper(page, 900, 600)
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
  // 線を選び、途中の縦の区間を右へ動かして手直しする
  const l = (await line.boundingBox())!
  await page.mouse.click(l.x + l.width / 2, l.y + l.height / 2)
  const bend = page.locator("line[data-axis]").first()
  await expect(bend).toBeAttached()
  const b = (await bend.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2, { steps: 5 })
  await page.mouse.up()
  const points = async () => (await line.locator("polyline").first().getAttribute("points"))!
  const parsed = (text: string) =>
    text
      .trim()
      .split(/\s+/)
      .map(p => p.split(",").map(Number) as [number, number])
  const before = parsed(await points())
  // 形を 2 つとも選んでドラッグする（選択の道具で、全体を囲む）
  const from = await onPaper(page, 40, 100)
  const to = await onPaper(page, 900, 600)
  await page.mouse.click(...(Object.values(await onPaper(page, 900, 700)) as [number, number]))
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 5 })
  await page.mouse.up()
  await expect(page.locator('[data-item][data-shape][data-selected="true"]')).toHaveCount(2)
  const a = (await boxes.nth(0).boundingBox())!
  await page.mouse.move(a.x + 20, a.y + 20)
  await page.mouse.down()
  await page.mouse.move(a.x + 20 + 120, a.y + 20, { steps: 6 })
  // 離す前（ドラッグ中）の線の形が、動いた量だけ平行にずれている
  const during = parsed(await points())
  const dx = during[0]![0] - before[0]![0]
  expect(Math.abs(dx)).toBeGreaterThan(50)
  expect(during.length).toBe(before.length)
  for (const [i, p] of during.entries()) {
    expect(p[0]).toBeCloseTo(before[i]![0] + dx, 0)
    expect(p[1]).toBeCloseTo(before[i]![1], 0)
  }
  await page.mouse.up()
})
