// 可変ページで左・上へ増やすと、背景（ページの slide）は中身と同じだけずれて、中身に対する位置を保つ（図面は slide の座標をずらし、ツリーは描くときにずらす）
import { BOOK_SCREEN_URL, expect, type Locator, type Page, test } from "./fixtures"
import { footerMenuTool } from "./helpers/footer-menu"
import { newBook } from "./helpers/new-book"
import { addBox, onPaper, paper, settled } from "./helpers/paper"
import { fromMenu } from "./helpers/stage-menu"

const band = (page: Page) => page.locator("[data-background-band]")

// 2 つの物の左上の差
async function gap(a: Locator, b: Locator) {
  const [p, q] = [(await a.boundingBox())!, (await b.boundingBox())!]
  return { x: q.x - p.x, y: q.y - p.y }
}

async function makeGrowing(page: Page, all: boolean) {
  const empty = await onPaper(page, 900, 600)
  await page.mouse.click(empty.x, empty.y, { button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "ページの設定" }).click()
  const dialog = page.getByRole("dialog", { name: "ページの設定" })
  await dialog.getByRole("switch", { name: "可変ページにする" }).click()
  if (all) await dialog.getByLabel("増やす向き").selectOption({ label: "上下左右" })
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  await settled(page)
}

async function placeEllipse(page: Page, x: number, y: number) {
  await (await fromMenu(page, "背景を編集")).click()
  await expect(band(page)).toBeVisible()
  await settled(page)
  await (await footerMenuTool(page, "楕円")).click()
  const at = await onPaper(page, x, y)
  await page.mouse.move(at.x, at.y)
  await page.mouse.down()
  await page.mouse.move(at.x + 120, at.y + 80, { steps: 6 })
  await page.mouse.up()
  await band(page).getByRole("button", { name: "終了" }).click()
  await expect(band(page)).toHaveCount(0)
  await settled(page)
}

test("図面: 上下左右へ増やす可変ページにしても、背景は中身の箱に対する位置を保つ", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  await addBox(page, 300, 300, "元")
  const box = page.locator("[data-item]").filter({ hasText: "元" })
  await placeEllipse(page, 500, 200)
  const ellipse = page.locator("[data-item]").filter({ has: page.locator("ellipse") })
  await expect(ellipse).toHaveCount(1)
  const before = await gap(box, ellipse)
  await makeGrowing(page, true)
  const after = await gap(box, ellipse)
  expect(Math.abs(after.x - before.x)).toBeLessThan(2)
  expect(Math.abs(after.y - before.y)).toBeLessThan(2)
})

test("ツリー: 上下左右へ増やす可変ページにしても、背景は根の節に対する位置を保つ", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const add = await newBook(page, "木", "ツリー")
  await add.getByRole("radio", { name: "中央" }).check({ force: true })
  await add.getByLabel("根のキャプション").fill("根")
  await add.getByRole("button", { name: "作る" }).click()
  await expect(paper(page)).toBeVisible()
  await settled(page)
  const root = page.locator('[data-root="true"]')
  await placeEllipse(page, 700, 200)
  const ellipse = page.locator("[data-item]").filter({ has: page.locator("ellipse") })
  await expect(ellipse).toHaveCount(1)
  const before = await gap(root, ellipse)
  await makeGrowing(page, false) // 増やす向きは、ツリーの設定（中央は四方）が決める
  const after = await gap(root, ellipse)
  expect(Math.abs(after.x - before.x)).toBeLessThan(2)
  expect(Math.abs(after.y - before.y)).toBeLessThan(2)
  // 印刷プレビューでも、根の節を載せた印刷区画で、背景は根の節に対して同じ位置（縮尺が違うので、根の幅に対する比で比べる）
  const rootWidth = (await root.boundingBox())!.width
  await (await fromMenu(page, "印刷プレビュー")).click()
  const sheet = page.locator("[data-sheet]").filter({ has: page.locator('[data-root="true"]') })
  await expect(sheet).toHaveCount(1)
  const printedRoot = sheet.locator('[data-root="true"]')
  const printedEllipse = sheet
    .locator("div[style*='left']")
    .filter({ has: page.locator("ellipse") })
    .last()
  // 印刷プレビューの紙が落ち着くまで待って比べる
  await expect
    .poll(async () => {
      const printed = await gap(printedRoot, printedEllipse)
      const scale = (await printedRoot.boundingBox())!.width / rootWidth
      return Math.max(Math.abs(printed.x / scale - before.x), Math.abs(printed.y / scale - before.y))
    })
    .toBeLessThan(3)
})
