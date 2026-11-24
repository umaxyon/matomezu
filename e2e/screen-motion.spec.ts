// スクリーンの動き: 窓いっぱいに開くブックスクリーンは、ほかのスクリーンの上を右から滑り込む（後ろの物は動かない）。
// 「画面を分割」では、ブックスクリーンが上に縮み終えてから、書庫のスクリーンが右から入る
import { BOOK_SCREEN_URL, CONTROL_CENTER_URL, expect, type Page, test } from "./fixtures"
import { track } from "./helpers/motion"
import { fromMenu } from "./helpers/stage-menu"

const BOOK = "[data-over]:not([data-leaving])"
const PLAIN = "section [data-top]"

const settled = (page: Page) =>
  expect.poll(() => page.evaluate(() => document.getAnimations().filter(a => a.playState === "running").length)).toBe(0)

test("「画面を分割」では、ブックスクリーンが上に縮み終えてから、書庫のスクリーンが右から入る", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  await settled(page)
  const { width, height } = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  const menu = await fromMenu(page, "画面を分割")
  const [frames] = await Promise.all([track(page, { book: BOOK, plain: PLAIN }), menu.click()])
  // ブックスクリーンは縮む途中を通り、その間、書庫のスクリーンは右の外にいる
  const shrinking = frames.filter(f => f.book && f.book.height > height * 0.55 && f.book.height < height * 0.95)
  expect(shrinking.length).toBeGreaterThan(0)
  for (const f of shrinking) expect(f.plain === null || f.plain.left >= width - 1).toBe(true)
  expect(frames.some(f => f.plain && f.plain.left > 10 && f.plain.left < width - 10)).toBe(true)
})

test("書庫のスクリーンからブックを開くと、ブックスクリーンが書庫の上を右から滑り込み、書庫は動かない。閉じると右へ出ていく", async ({
  page,
}) => {
  await page.goto(CONTROL_CENTER_URL)
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  const library = page.getByRole("list", { name: "書庫 の中身" })
  await expect(library).toBeVisible()
  await settled(page)
  const width = await page.evaluate(() => innerWidth)
  const [frames] = await Promise.all([
    track(page, { book: BOOK, center: "section[data-held]" }),
    library.getByRole("button", { name: "残課題" }).dblclick(),
  ])
  expect(frames.some(f => f.book && f.book.left > 10 && f.book.left < width - 10)).toBe(true)
  // 滑り込む間、後ろ（コントロールセンターの側）は左に寄ったまま
  for (const f of frames) if (f.book && f.book.left > 10 && f.center) expect(f.center.left).toBe(0)
  await settled(page)
  await expect(library).toBeHidden()

  const [out] = await Promise.all([
    track(page, { leaving: "[data-leaving]" }),
    page.locator("[data-footer-close]").locator("visible=true").click(),
  ])
  expect(out.some(f => f.leaving && f.leaving.left > 10 && f.leaving.left < width - 10)).toBe(true)
  await settled(page)
  await expect(library).toBeVisible()
})

test("窓いっぱいの書庫のスクリーンでは、ブックとページの行のクリックで「開く／分割で開く」を出す。「画面を分割」の下の段では出さない", async ({
  page,
}) => {
  await page.goto(CONTROL_CENTER_URL)
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  const library = page.getByRole("list", { name: "書庫 の中身" })
  await library.getByRole("button", { name: "残課題" }).click()
  await expect(page.getByRole("menuitem", { name: "分割で開く" })).toBeVisible()
  await page.getByRole("menuitem", { name: "分割で開く" }).click()
  await expect(library).toBeVisible()
  await expect(page.locator("[data-footer-close]").locator("visible=true")).toHaveCount(1)

  // 「画面を分割」の下の段の書庫では出さない（ダブルクリックで上の段に開く）
  await page.goto(BOOK_SCREEN_URL)
  await (await fromMenu(page, "画面を分割")).click()
  const below = page.getByRole("list", { name: "書庫 の中身" })
  await below.getByRole("button", { name: "残課題" }).click()
  await expect(page.getByRole("menuitem", { name: "分割で開く" })).toHaveCount(0)
})

test("ブックスクリーンと上下に並んだ書庫のスクリーンで「開く」を選ぶと、開いたブックが窓いっぱいになる", async ({
  page,
}) => {
  await page.goto(CONTROL_CENTER_URL)
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  const library = page.getByRole("list", { name: "書庫 の中身" })
  await library.getByRole("button", { name: "残課題" }).click()
  await page.getByRole("menuitem", { name: "分割で開く" }).click()
  await expect(library).toBeVisible()

  await library.getByRole("button", { name: "まとめ図の構想" }).click()
  await page.getByRole("menuitem", { name: "開く", exact: true }).click()
  await expect(library).toBeHidden()
  await expect(page.locator(BOOK).locator("visible=true")).toHaveCount(1)
  // 並んでいたブックスクリーンは閉じずに、見えないまま開いている
  await expect(page.locator(BOOK)).toHaveCount(2)
  await expect(page.getByText("まとめ図の構想").locator("visible=true").first()).toBeVisible()
  const { height } = await page.evaluate(() => ({ height: innerHeight }))
  expect((await page.locator(BOOK).locator("visible=true").boundingBox())?.height ?? 0).toBeGreaterThan(height * 0.9)
})
