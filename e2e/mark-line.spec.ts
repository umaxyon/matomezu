import { expect, type Page, test } from "./fixtures"
import { addBox, items, onPaper, zoomOf } from "./helpers/paper"

// 始の箱の port の〇から、終の箱へ線を引く
async function connect(page: Page, to: { x: number; y: number }, port: "r" | "b" = "r") {
  await addBox(page, 150, 150, "始")
  await addBox(page, to.x, to.y, "終")
  const empty = await onPaper(page, 600, 520)
  await page.mouse.click(empty.x, empty.y)
  const start = items(page).filter({ hasText: "始" })
  const end = items(page).filter({ hasText: "終" })
  const s = (await start.boundingBox())!
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2)
  const r = (await start.locator(`[data-port="${port}"]`).boundingBox())!
  const e = (await end.boundingBox())!
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
  await page.mouse.down()
  await page.mouse.move(port === "r" ? e.x + 10 : e.x + e.width / 2, port === "r" ? e.y + e.height / 2 : e.y + 10, {
    steps: 5,
  })
  await page.mouse.up()
  const line = page.locator("[data-item]:not([data-shape])")
  await expect(line).toHaveCount(1)
  return line
}

async function markLine(page: Page, line: ReturnType<typeof page.locator>, kind: string) {
  // 線の最初の区間の真ん中を右クリックする
  const pts = (await line.locator("polyline").first().getAttribute("points"))!
    .split(" ")
    .map(p => p.split(",").map(Number))
  const paperBox = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  const zoom = await zoomOf(page)
  const at = {
    x: paperBox.x + ((pts[0]![0]! + pts[1]![0]!) / 2) * zoom,
    y: paperBox.y + ((pts[0]![1]! + pts[1]![1]!) / 2) * zoom,
  }
  await page.mouse.click(at.x, at.y, { button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに示す" }).click()
  const picker = page.getByRole("group", { name: "マークを付ける" })
  await picker.getByRole("button", { name: kind }).click()
  await expect(picker).toHaveCount(0)
}

test("横向きの直線に付けた鳥は、線の上に立つ（動きを減らす設定では線の真ん中）", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  const line = await connect(page, { x: 550, y: 150 })
  await markLine(page, line, "ツナギドリ")
  const bird = page.getByRole("button", { name: "ツナギドリ" })
  await expect(bird).toHaveCount(1)
  const stroke = (await line.locator("polyline").first().boundingBox())!
  const w = (await bird.boundingBox())!
  expect(Math.abs(w.y + w.height - (stroke.y + stroke.height / 2))).toBeLessThan(6)
  expect(Math.abs(w.x + w.width / 2 - (stroke.x + stroke.width / 2))).toBeLessThan(40)
})

test("折れ線に付けた鳥は、一番長い横の区間の上に立つ", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  const line = await connect(page, { x: 550, y: 330 })
  await markLine(page, line, "スズメ")
  const bird = page.getByRole("button", { name: "スズメ" })
  await expect(bird).toHaveCount(1)
  const stroke = (await line.locator("polyline").first().boundingBox())!
  const w = (await bird.boundingBox())!
  const foot = w.y + w.height
  const onHorizontal = Math.abs(foot - stroke.y) < 8 || Math.abs(foot - (stroke.y + stroke.height)) < 8
  expect(onHorizontal).toBe(true)
})

test("縦の直線に付けた鳥は、線の真ん中の周りを回る", async ({ page }) => {
  await page.goto("/")
  const line = await connect(page, { x: 150, y: 400 }, "b")
  await markLine(page, line, "インコ")
  const bird = page.getByRole("button", { name: "インコ" })
  await expect(bird).toHaveCount(1)
  const stroke = (await line.locator("polyline").first().boundingBox())!
  const centre = { x: stroke.x + stroke.width / 2, y: stroke.y + stroke.height / 2 }
  // 飛んでくる間（2 秒ほど）は軌道の外にいる。降りたあとの周回を見る
  await expect
    .poll(
      async () => {
        const b = await bird.boundingBox()
        return b ? Math.hypot(b.x + b.width / 2 - centre.x, b.y + b.height / 2 - centre.y) : Number.POSITIVE_INFINITY
      },
      { timeout: 8000 },
    )
    .toBeLessThan(120)
  // 降りたあとの 2.5 秒を、描画のたびに測る
  const seen = await bird.evaluate(
    el =>
      new Promise<{ x: number; y: number }[]>(resolve => {
        const out: { x: number; y: number }[] = []
        const start = performance.now()
        const tick = () => {
          const r = el.getBoundingClientRect()
          out.push({ x: r.x + r.width / 2, y: r.y + r.height / 2 })
          if (performance.now() - start < 2500) requestAnimationFrame(tick)
          else resolve(out)
        }
        tick()
      }),
  )
  expect(seen.length).toBeGreaterThan(10)
  const xs = seen.map(p => p.x)
  expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(40)
  for (const p of seen) expect(Math.hypot(p.x - centre.x, p.y - centre.y)).toBeLessThan(120)
})
