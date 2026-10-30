// ミニマップ（base/minimap）: 下の行に乗ると上がるドロワーのものと、右ボタンの長押しのアイコンから出すもの。
// 見えている範囲の四角をドラッグすると、紙がついて動く
import { expect, type Page, test } from "@playwright/test"

const paper = (page: Page) => page.getByRole("img", { name: "紙" })
const seen = (page: Page, where: "drawer" | "picker") => page.locator(`[data-minimap=${where}] [data-minimap-seen]`)

// 下の行に乗せて、ドロワーを上げる
async function drawer(page: Page) {
  const tabs = (await page.getByRole("tablist").first().boundingBox())!
  await page.mouse.move(tabs.x + tabs.width - 20, tabs.y + tabs.height / 2)
  await expect(page.locator('button[aria-haspopup="menu"]').first()).toHaveAttribute("aria-expanded", "true")
}

// Ctrl+ホイールを 100 回したときの倍率（回した量に合わせて滑らかに変える。base/zoom の wheelZoom）
const WHEEL_100 = 1.16

test("ドロワーの行の左端に拡大縮小、その真上にミニマップが出る。四角をドラッグすると紙が動き、ドロワーから出ても下がらない", async ({
  page,
}) => {
  await page.goto("/")
  await expect(paper(page)).toBeVisible()
  const trigger = page.locator('button[aria-haspopup="menu"]').first()
  await drawer(page)
  const map = page.locator("[data-minimap=drawer]")
  await expect(map.getByRole("img", { name: "ミニマップ" })).toBeVisible()
  // ミニマップは拡大縮小の真上に、同じ幅で付いている
  const zoom = (await page.getByTitle("倍率").first().boundingBox())!
  const m = (await map.boundingBox())!
  expect(zoom.y).toBeGreaterThan(m.y + m.height - 2)
  expect(zoom.x).toBeLessThan(m.x + m.width)
  const before = (await paper(page).boundingBox())!.y
  // 四角をつかんで、ドロワーの外（紙の上）まで動かしても下がらない
  await seen(page, "drawer").hover() // 上がり終えるまで待つ
  const box = (await seen(page, "drawer").boundingBox())!
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 15, { steps: 5 })
  await expect.poll(async () => (await paper(page).boundingBox())!.y).toBeLessThan(before - 20)
  const p = (await paper(page).boundingBox())!
  await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2, { steps: 5 })
  await expect(trigger).toHaveAttribute("aria-expanded", "true")
  await page.mouse.up()
  await page.mouse.move(p.x + p.width / 2, p.y + p.height / 3)
  await expect(trigger).toHaveAttribute("aria-expanded", "false")
})

test("ドロワーの拡大縮小で倍率が変わる", async ({ page }) => {
  await page.goto("/")
  await expect(paper(page)).toBeVisible()
  await drawer(page)
  const level = page.getByTitle("倍率").first()
  await expect(level).toHaveText("100%")
  await page.getByRole("button", { name: "拡大" }).first().click()
  await drawer(page)
  await expect(level).toHaveText("110%")
})

test("右ボタンの長押しのアイコンのミニマップを押すと、アイコンの代わりにその場にミニマップが出る。ドラッグで紙が動き、ミニマップから離れると閉じる", async ({
  page,
}) => {
  await page.goto("/")
  const p = (await paper(page).boundingBox())!
  const at = { x: p.x + 400, y: p.y + 300 }
  await page.mouse.move(at.x, at.y)
  await page.mouse.down({ button: "right" })
  await page.waitForTimeout(350)
  await page.mouse.up({ button: "right" })
  const picker = page.getByRole("toolbar", { name: "ツールの切り替え" })
  await picker.getByRole("button", { name: "ミニマップ" }).click()
  await expect(page.locator("[data-minimap=picker]")).toBeVisible()
  // 道具のアイコンは消え、ミニマップの下の拡大縮小の帯のボタンだけ
  await expect(picker.getByRole("button")).toHaveText(["", "", "", ""])
  await expect(picker.getByRole("button", { name: "ハンドツール" })).toHaveCount(0)
  const before = (await paper(page).boundingBox())!.y
  // ドラッグしている間は、ミニマップの外へ出ても閉じない
  const box = (await seen(page, "picker").boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 200, { steps: 8 })
  await expect(page.locator("[data-minimap=picker]")).toBeVisible()
  await page.mouse.up()
  await expect.poll(async () => (await paper(page).boundingBox())!.y).toBeLessThan(before - 20)
  // ミニマップの中で動かしても閉じず、枠から離れると閉じる
  const map = (await page.locator("[data-minimap=picker]").boundingBox())!
  await page.mouse.move(map.x + 20, map.y + 20, { steps: 3 })
  await expect(page.locator("[data-minimap=picker]")).toBeVisible()
  await page.mouse.move(map.x + 20, map.y - 150, { steps: 5 })
  await expect(picker).toHaveCount(0)
})

test("右ボタンの長押しのミニマップの下の帯で拡大縮小する（10% ずつ、30〜180%、端では押せない）。初めの位置に戻すと 100%、ページ全体を収めると紙が表示領域に入る。Ctrl+ホイールは滑らかに、Home キーでも戻る", async ({
  page,
}) => {
  await page.goto("/")
  const p = (await paper(page).boundingBox())!
  await page.mouse.move(p.x + 400, p.y + 300)
  await page.mouse.down({ button: "right" })
  await page.waitForTimeout(350)
  await page.mouse.up({ button: "right" })
  await page.getByRole("toolbar", { name: "ツールの切り替え" }).getByRole("button", { name: "ミニマップ" }).click()
  const map = page.locator("[data-minimap=picker]")
  const level = map.getByTitle("倍率")
  const width = async () => (await paper(page).boundingBox())!.width
  await expect(level).toHaveText("100%")
  await expect(map.getByRole("button", { name: "初めの位置に戻す" })).toBeDisabled()
  await map.getByRole("button", { name: "拡大" }).click()
  await expect(level).toHaveText("110%")
  await expect.poll(width).toBeCloseTo(p.width * 1.1, 0)
  for (const _ of Array(7)) await map.getByRole("button", { name: "拡大" }).click()
  await expect(level).toHaveText("180%")
  await expect(map.getByRole("button", { name: "拡大" })).toBeDisabled()
  for (const _ of Array(15)) await map.getByRole("button", { name: "縮小" }).click()
  await expect(level).toHaveText("30%")
  await expect(map.getByRole("button", { name: "縮小" })).toBeDisabled()
  await map.getByRole("button", { name: "初めの位置に戻す" }).click()
  await expect(level).toHaveText("100%")
  await expect.poll(width).toBeCloseTo(p.width, 0)
  // ページ全体を収める: 紙が表示領域（ステージ）に入り、収めた見え方ではもう押せない
  await map.getByRole("button", { name: "ページ全体を収める" }).click()
  await expect(map.getByRole("button", { name: "ページ全体を収める" })).toBeDisabled()
  const stage = (await page.locator("section[data-tool]").first().boundingBox())!
  await expect.poll(async () => (await paper(page).boundingBox())!.height).toBeLessThanOrEqual(stage.height)
  const fitted = (await paper(page).boundingBox())!
  expect(fitted.y).toBeGreaterThanOrEqual(stage.y)
  expect(fitted.y + fitted.height).toBeLessThanOrEqual(stage.y + stage.height)
  await map.getByRole("button", { name: "初めの位置に戻す" }).click()
  await expect.poll(width).toBeCloseTo(p.width, 0)
  // Ctrl+ホイールはポインタの下の紙の点を動かさない
  await page.keyboard.press("Escape")
  await expect(map).toHaveCount(0)
  const at = { x: p.x + 300, y: p.y + 200 }
  await page.mouse.move(at.x, at.y)
  await page.keyboard.down("Control")
  await page.mouse.wheel(0, -100)
  await page.keyboard.up("Control")
  await expect.poll(width).toBeCloseTo(p.width * WHEEL_100, 0)
  const q = (await paper(page).boundingBox())!
  expect((at.x - q.x) / WHEEL_100).toBeCloseTo(at.x - p.x, 0)
  expect((at.y - q.y) / WHEEL_100).toBeCloseTo(at.y - p.y, 0)
  await page.keyboard.press("Home")
  await expect.poll(width).toBeCloseTo(p.width, 0)
})

test("拡大縮小はなめらかに移り、途中でもポインタの下の紙の点は動かない。ずらすときはなめらかにしない", async ({
  page,
}) => {
  await page.goto("/")
  const p = (await paper(page).boundingBox())!
  const at = { x: p.x + 300, y: p.y + 200 }
  await page.mouse.move(at.x, at.y)
  await page.keyboard.down("Control")
  await page.mouse.wheel(0, -100)
  await page.keyboard.up("Control")
  await page.waitForTimeout(60)
  const mid = (await paper(page).boundingBox())!
  expect(mid.width).toBeGreaterThan(p.width + 1)
  expect(mid.width).toBeLessThan(p.width * WHEEL_100 - 1)
  const k = mid.width / p.width
  expect(at.x - mid.x).toBeCloseTo((at.x - p.x) * k, 0)
  await expect.poll(async () => (await paper(page).boundingBox())!.width).toBeCloseTo(p.width * WHEEL_100, 0)
  await page.waitForTimeout(250)
  await expect(paper(page)).not.toHaveCSS("transition-duration", "0.2s")
})
