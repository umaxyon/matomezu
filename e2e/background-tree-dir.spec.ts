// ツリーとディレクトリ構成図の背景: 背景編集モードで、背景の形を置ける。背景は紙の座標に敷かれ、中身（根の節・根の行）と同じ位置に載る
import { BOOK_SCREEN_URL, expect, type Locator, type Page, test } from "./fixtures"
import { footerMenuTool } from "./helpers/footer-menu"
import { newBook } from "./helpers/new-book"
import { paper, settled } from "./helpers/paper"
import { fromMenu } from "./helpers/stage-menu"

const band = (page: Page) => page.locator("[data-background-band]")

// 背景編集モードに入り、楕円の道具で target の枠をなぞって置く。置いた楕円の枠を返す
async function placeEllipseOver(page: Page, target: Locator) {
  await settled(page)
  const before = (await target.boundingBox())!
  await (await fromMenu(page, "背景を編集")).click()
  await expect(band(page)).toBeVisible()
  await settled(page)
  const t = (await target.boundingBox())! // 帯が出てステージの高さが変わるので、モードの中で測り直す
  await (await footerMenuTool(page, "楕円")).click()
  await page.mouse.move(t.x, t.y)
  await page.mouse.down()
  await page.mouse.move(t.x + t.width, t.y + t.height, { steps: 6 })
  await page.mouse.up()
  const placed = page.locator('[data-item^="slide-"], [data-item]').filter({ has: page.locator("ellipse") })
  await expect(placed).toHaveCount(1)
  return { before, t, e: (await placed.first().boundingBox())! }
}

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(3)

test("ツリー（根が中央で四方へ伸びる）: 背景編集モードで楕円を置くと、根の節の位置に重なり、モードを出ても中身が動かない", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  const add = await newBook(page, "木", "ツリー")
  await add.getByRole("radio", { name: "中央" }).check({ force: true })
  await add.getByLabel("根のキャプション").fill("根")
  await add.getByRole("button", { name: "作る" }).click()
  await expect(paper(page)).toBeVisible()
  const root = page.locator('[data-root="true"]')
  const { before, t, e } = await placeEllipseOver(page, root)
  near(e.x, t.x)
  near(e.y, t.y)
  near(e.width, t.width)
  near(e.height, t.height)
  await band(page).getByRole("button", { name: "終了" }).click()
  await expect(band(page)).toHaveCount(0)
  await settled(page)
  const after = (await root.boundingBox())!
  near(after.x, before.x)
  near(after.y, before.y)
})

test("ディレクトリ構成図: 背景編集モードで楕円を置くと、根の行の位置に重なり、モードを出ても中身が動かない", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  const add = await newBook(page, "構成", "ディレクトリ構成図")
  await add.getByLabel("根のフォルダの名前").fill("proj")
  await add.getByRole("button", { name: "作る" }).click()
  const row = paper(page).locator("[data-entry]").first()
  await expect(row).toBeVisible()
  const { before, t, e } = await placeEllipseOver(page, row)
  near(e.x, t.x)
  near(e.y, t.y)
  await band(page).getByRole("button", { name: "終了" }).click()
  await expect(band(page)).toHaveCount(0)
  await settled(page)
  const after = (await row.boundingBox())!
  near(after.x, before.x)
  near(after.y, before.y)
})
