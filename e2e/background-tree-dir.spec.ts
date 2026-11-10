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

test("ツリー: 背景編集モードで文字枠を置くと、そのまま文字を打てて、確定すると背景に文字が出る", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const add = await newBook(page, "木", "ツリー")
  await add.getByLabel("根のキャプション").fill("根")
  await add.getByRole("button", { name: "作る" }).click()
  await expect(paper(page)).toBeVisible()
  await settled(page)
  await (await fromMenu(page, "背景を編集")).click()
  await settled(page)
  await (await footerMenuTool(page, "文字枠")).click()
  const box = (await paper(page).boundingBox())!
  await page.mouse.move(box.x + 100, box.y + 120)
  await page.mouse.down()
  await page.mouse.move(box.x + 300, box.y + 180, { steps: 6 })
  await page.mouse.up()
  await expect(page.locator("textarea")).toBeFocused() // 節の書き換えに取られず、文字枠の入力Formが開く
  await page.keyboard.type("組織図")
  await page.mouse.click(box.x + 500, box.y + 400)
  await expect(page.getByText("組織図")).toBeVisible()
})

test("文字枠を選ぶと、バーは回すつまみに重ならず、つまみを押せる", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const add = await newBook(page, "木", "ツリー")
  await add.getByLabel("根のキャプション").fill("根")
  await add.getByRole("button", { name: "作る" }).click()
  await expect(paper(page)).toBeVisible()
  await settled(page)
  await (await fromMenu(page, "背景を編集")).click()
  await settled(page)
  await (await footerMenuTool(page, "文字枠")).click()
  const box = (await paper(page).boundingBox())!
  await page.mouse.move(box.x + 100, box.y + 300)
  await page.mouse.down()
  await page.mouse.move(box.x + 160, box.y + 340, { steps: 6 }) // バーより狭い枠
  await page.mouse.up()
  await page.keyboard.type("あ")
  await page.mouse.click(box.x + 600, box.y + 100) // 確定
  await page.mouse.click(box.x + 120, box.y + 320) // 選ぶ
  const rotate = (await page.locator("[data-rotate]").boundingBox())!
  const bar = (await page.locator("[data-bar]").boundingBox())!
  const overlaps =
    bar.x < rotate.x + rotate.width &&
    rotate.x < bar.x + bar.width &&
    bar.y < rotate.y + rotate.height &&
    rotate.y < bar.y + bar.height
  expect(overlaps).toBe(false)
  const hit = await page.evaluate(
    ([x, y]: [number, number]) => document.elementFromPoint(x, y)?.closest("[data-rotate]") !== null,
    [rotate.x + rotate.width / 2, rotate.y + rotate.height / 2] as [number, number],
  )
  expect(hit).toBe(true)
})

// 実際のマウスに近い 2 回押し: 押す→離す→（1 ピクセル動いて）押す→離す。2 回目は clickCount 2 を付ける（ダブルクリックの印）
async function realDoubleClick(page: Page, x: number, y: number) {
  await page.mouse.move(x, y)
  await page.mouse.down({ clickCount: 1 })
  await page.mouse.up({ clickCount: 1 })
  await page.mouse.move(x + 1, y)
  await page.mouse.down({ clickCount: 2 })
  await page.mouse.up({ clickCount: 2 })
}

test("ツリーの背景編集モード: 確定した文字枠は、文字の上でも余白でも、選択の有無にかかわらず、実際のマウスの 2 回押しで再編集できる", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  const add = await newBook(page, "木", "ツリー")
  await add.getByLabel("根のキャプション").fill("根")
  await add.getByRole("button", { name: "作る" }).click()
  await expect(paper(page)).toBeVisible()
  await settled(page)
  await (await fromMenu(page, "背景を編集")).click()
  await settled(page)
  await (await footerMenuTool(page, "文字枠")).click()
  const box = (await paper(page).boundingBox())!
  await page.mouse.move(box.x + 100, box.y + 120)
  await page.mouse.down()
  await page.mouse.move(box.x + 300, box.y + 180, { steps: 6 })
  await page.mouse.up()
  await page.keyboard.type("組織図")
  await page.mouse.click(box.x + 500, box.y + 400) // 確定。選択も外れる
  const item = page.locator("[data-item]").filter({ hasText: "組織図" })
  await expect(item).toBeVisible()
  const at = (await item.boundingBox())!
  // 未選択のまま、文字の上
  await realDoubleClick(page, at.x + 10, at.y + at.height / 2)
  await expect(page.locator("textarea")).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(page.locator("textarea")).toHaveCount(0)
  // 選択済みのまま、枠の余白（右の端）
  await realDoubleClick(page, at.x + at.width - 4, at.y + at.height - 4)
  await expect(page.locator("textarea")).toBeFocused()
})

test("ディレクトリ構成図の背景編集モード: 確定した文字枠を実際のマウスの 2 回押しで再編集できる", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const add = await newBook(page, "構成", "ディレクトリ構成図")
  await add.getByLabel("根のフォルダの名前").fill("proj")
  await add.getByRole("button", { name: "作る" }).click()
  await expect(paper(page).locator("[data-entry]").first()).toBeVisible()
  await settled(page)
  await (await fromMenu(page, "背景を編集")).click()
  await settled(page)
  await (await footerMenuTool(page, "文字枠")).click()
  const box = (await paper(page).boundingBox())!
  await page.mouse.move(box.x + 300, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 500, box.y + 260, { steps: 6 })
  await page.mouse.up()
  await page.keyboard.type("メモ")
  await page.mouse.click(box.x + 600, box.y + 500)
  const item = page.locator("[data-item]").filter({ hasText: "メモ" })
  const at = (await item.boundingBox())!
  await realDoubleClick(page, at.x + 8, at.y + at.height / 2)
  await expect(page.locator("textarea")).toBeFocused()
})
