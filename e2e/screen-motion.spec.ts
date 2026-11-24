// スクリーンの動き: 窓いっぱいに開くブックスクリーンは、ほかのスクリーンの上を右から滑り込む（後ろの物は動かない）。
// 「画面を分割」では、ブックスクリーンが上に縮み終えてから、書庫のスクリーンが右から入る
import { BOOK_SCREEN_URL, CONTROL_CENTER_URL, expect, type Page, test } from "./fixtures"
import { aiPerform } from "./helpers/ai"
import { track } from "./helpers/motion"
import { fromMenu } from "./helpers/stage-menu"
import { storedBooks } from "./helpers/stored"

const BOOK = "[data-over]:not([data-leaving])"
const PLAIN = "section [data-top]"

// スクリーンの動きが止まるまで待つ（郵便を送ると流れるマーキー（role="status"）は、スクリーンの動きと関わらないので待たない）
const settled = (page: Page) =>
  expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(a => a.playState === "running")
            .filter(a => !((a.effect as KeyframeEffect | null)?.target as Element | null)?.closest('[role="status"]'))
            .length,
      ),
    )
    .toBe(0)

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

test("ブックスクリーンの下の段の郵便箱を閉じると、郵便箱が右へ出ていき終えてからブックスクリーンが伸び、その間も後ろのコントロールセンターは見せない", async ({
  page,
}) => {
  const book = ((await storedBooks(page.request)) as { id: string }[])[0]?.id
  expect(book).toBeDefined()
  await page.goto(CONTROL_CENTER_URL)
  await page.bringToFront()
  await aiPerform(page, { action: "@matomezu/base:mail-send", args: { from: "a", title: "行き先", to: { book } } })
  // コントロールセンターのコンテンツエリアに郵便箱を出し、郵便の行き先を窓いっぱいに開く
  await page
    .getByRole("button", { name: /^郵便箱/ })
    .filter({ visible: true })
    .first()
    .click()
  const panes = page.getByRole("region", { name: "郵便箱" }).locator("visible=true")
  await panes
    .getByRole("listitem")
    .getByRole("button", { name: /行き先/ })
    .first()
    .click()
  await panes.locator("article").getByRole("button", { name: "開く", exact: true }).click()
  await expect(panes).toHaveCount(0)
  await settled(page)
  // フッタの封筒で、下の段に郵便箱を出す
  await (await fromMenu(page, "郵便箱")).click()
  await expect(panes).toHaveCount(1)
  await settled(page)
  const height = await page.evaluate(() => innerHeight)
  const [frames] = await Promise.all([
    track(page, {
      book: BOOK,
      center: 'section [data-top="true"][data-row="false"]',
      mailbox: 'section [data-row="true"]',
    }),
    page.getByRole("button", { name: "郵便箱を閉じる" }).filter({ visible: true }).click(),
  ])
  // 後ろのコントロールセンターは、どのコマでも見えない
  expect(frames.filter(f => f.center !== null)).toEqual([])
  // ブックスクリーンが伸び始めるのは、郵便箱が見えなくなってから
  const grows = frames.findIndex(f => (f.book?.height ?? 0) > height * 0.6)
  const gone = frames.findIndex(f => f.mailbox === null)
  expect(grows).toBeGreaterThan(0)
  expect(gone).toBeGreaterThanOrEqual(0)
  expect(grows).toBeGreaterThanOrEqual(gone)
})

// コントロールセンターのコンテンツエリアの郵便箱から、郵便の行き先を窓いっぱいに開き、フッタの封筒で下の段に郵便箱を出す
async function bookOverMailbox(page: Page, titles: readonly string[]) {
  const book = ((await storedBooks(page.request)) as { id: string }[])[0]?.id
  expect(book).toBeDefined()
  await page.goto(CONTROL_CENTER_URL)
  await page.bringToFront()
  for (const title of titles)
    await aiPerform(page, { action: "@matomezu/base:mail-send", args: { from: "a", title, to: { book } } })
  await page.getByRole("button", { name: "郵便箱", exact: true }).filter({ visible: true }).first().click()
  const panes = page.getByRole("region", { name: "郵便箱" }).locator("visible=true")
  await panes
    .getByRole("listitem")
    .getByRole("button", { name: new RegExp(titles[0] ?? "") })
    .first()
    .click()
  await panes.locator("article").getByRole("button", { name: "開く", exact: true }).click()
  await expect(panes).toHaveCount(0)
  await settled(page)
  await (await fromMenu(page, "郵便箱")).click()
  await expect(panes).toHaveCount(1)
  await settled(page)
  return panes
}

test("上の段のブックスクリーンを閉じると、下の段の郵便箱も一緒に右へ出ていき、プロジェクトを出したコントロールセンターが見える", async ({
  page,
}) => {
  await bookOverMailbox(page, ["行き先"])
  const [frames] = await Promise.all([
    track(page, { leaving: "[data-over][data-leaving]", mailbox: 'section [data-row="true"]' }),
    page.getByRole("button", { name: "スクリーンを閉じる" }).filter({ visible: true }).first().click(),
  ])
  // 郵便箱は飛ばずに滑って出ていく（右の外へ着くまでに、間の位置を通る）
  const width = await page.evaluate(() => innerWidth)
  expect(frames.some(f => (f.mailbox?.left ?? 0) > 0 && (f.mailbox?.left ?? width) < width * 0.8)).toBe(true)
  expect(frames.some(f => (f.leaving?.left ?? 0) > 0)).toBe(true)
  expect(frames.at(-1)).toEqual({ leaving: null, mailbox: null })
  const tile = (name: string) => page.getByRole("button", { name, exact: true }).filter({ visible: true }).first()
  await expect(tile("プロジェクト")).toHaveAttribute("aria-pressed", "true")
})

test("下の段の郵便箱から別のブックを開き、郵便箱を閉じてからブックスクリーンを閉じると、前のブックスクリーンでなくコントロールセンターが見える", async ({
  page,
}) => {
  const panes = await bookOverMailbox(page, ["一通目", "二通目"])
  await panes
    .getByRole("listitem")
    .getByRole("button", { name: /二通目/ })
    .first()
    .click()
  await panes.locator("article").getByRole("button", { name: "開く", exact: true }).click()
  await settled(page)
  await page.getByRole("button", { name: "郵便箱を閉じる" }).filter({ visible: true }).click()
  await expect(panes).toHaveCount(0)
  await settled(page)
  await page.getByRole("button", { name: "スクリーンを閉じる" }).filter({ visible: true }).first().click()
  await settled(page)
  await expect(page.locator(BOOK)).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "プロジェクト", exact: true }).filter({ visible: true }).first(),
  ).toHaveAttribute("aria-pressed", "true")
})
