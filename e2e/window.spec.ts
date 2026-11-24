// 窓: コントロールセンターかブックスクリーンをカレントスクリーンにする。開いた直後はコントロールセンター。ブックスクリーンからはメニューで行き、書庫で開いているブックを開くと戻る。戻ってもブックスクリーンの中は残る。
// カレントスクリーンを替えるのはブラウザの履歴に 1 つ積み、戻る・進むで戻る
import {
  BOOK_SCREEN_DEF,
  BOOK_SCREEN_URL,
  bookScreenUrl,
  CONTROL_CENTER_SCREEN_DEF,
  expect,
  joinedAiAuth,
  type Page,
  test,
  urlCurrentScreen,
} from "./fixtures"
import { onPaper, paper, settled } from "./helpers/paper"
import { lowerLibrary, splitWith } from "./helpers/split"
import { fromMenu } from "./helpers/stage-menu"
import { storedBooks, storedTrashedAt } from "./helpers/stored"

const center = (page: Page) => page.getByRole("heading", { name: "コントロールセンター" })

test("開いた直後（URL が無いとき）はコントロールセンターがカレントスクリーンになって、後ろのブックスクリーンは隠れている", async ({
  page,
}) => {
  await page.goto("/")
  await expect(center(page)).toBeVisible()
  await expect(page.getByRole("heading", { name: "ワークルーム/参加者" })).toBeVisible()
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(0)
  await expect.poll(() => urlCurrentScreen(page)).toBe(CONTROL_CENTER_SCREEN_DEF)
})

test("コントロールセンターへ行き、書庫で開いているブックを開くと、同じブックスクリーンへ戻る。戻ってもステージの中は残る", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await expect(center(page)).toBeHidden()
  await splitWith(page, "画面の構成")
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(2)
  await (await fromMenu(page, "コントロールセンター")).click()
  await expect(center(page)).toBeVisible()
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(0)
  // センターの下の行（巣箱）は無い。書庫で、開いているブックを 2 回押すと、同じブックスクリーンが分けたままカレントスクリーンになる
  await expect(page.locator("footer").getByRole("button", { name: "コントロールセンター" })).toHaveCount(0)
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  await page
    .getByRole("list", { name: "書庫 の中身" })
    .getByRole("button", { name: "画面の構成", exact: true })
    .dblclick()
  await expect(center(page)).toBeHidden()
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(2)
  await expect(page.getByRole("tablist").nth(1)).toHaveAttribute("aria-label", "画面の構成")
})

test("カレントスクリーンを替えるのはブラウザの履歴に 1 つ積み、戻る・進むで戻る", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  await (await fromMenu(page, "コントロールセンター")).click()
  await expect(center(page)).toBeVisible()
  await expect.poll(() => urlCurrentScreen(page)).toBe(CONTROL_CENTER_SCREEN_DEF)
  await page.goBack()
  await expect(center(page)).toBeHidden()
  await expect(page.getByRole("img", { name: "紙" })).toBeVisible()
  await page.goForward()
  await expect(center(page)).toBeVisible()
})

// コントロールセンターから始め、後ろのブックスクリーンが開いているブックの id を返す
async function startOnCenter(page: Page): Promise<string> {
  await page.goto(BOOK_SCREEN_URL)
  await page.bringToFront()
  await (await fromMenu(page, "コントロールセンター")).click()
  await expect(center(page)).toBeVisible()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: await joinedAiAuth() })).json())
    .toHaveProperty("hidden.entry.id")
  const view = await (await page.request.get("/api/ai/view", { headers: await joinedAiAuth() })).json()
  expect(view).toMatchObject({ current: "plain-screen" })
  expect("entry" in view || "awaiting" in view).toBe(false)
  return view.hidden.entry.id as string
}
const send = async (page: Page, args: object) =>
  page.request.post("/api/ai/perform", {
    headers: await joinedAiAuth(),
    data: { action: "@matomezu/base:mail-send", args: { from: "D92", ...args } },
  })
const visitedAt = async (page: Page) =>
  (
    (
      await (
        await page.request.get("/api/ai/records?kind=%40matomezu%2Fbase%3Amail", { headers: await joinedAiAuth() })
      ).json()
    ).records as {
      visitedAt?: string
    }[]
  )[0]?.visitedAt

test("コントロールセンターの間は、行き先のブックが後ろに開いていても行き先を見たことにならず、ブックスクリーンへ戻ると見たことになる", async ({
  page,
}) => {
  const book = await startOnCenter(page)
  await send(page, { title: "後ろのブック", to: { book } })
  await expect(page.getByRole("button", { name: "後ろのブック" })).toBeVisible()
  expect(await visitedAt(page)).toBeUndefined()
  // ブラウザの戻るでブックスクリーンへ戻る
  await page.goBack()
  await expect(center(page)).toBeHidden()
  await expect.poll(() => visitedAt(page)).toBeTruthy()
})

test("コントロールセンターの間にしおりを押すと、コンテンツエリアの郵便箱でその郵便を選び、「開く」でブックスクリーンがカレントスクリーンになって行き先が見える", async ({
  page,
}) => {
  const book = await startOnCenter(page)
  await send(page, { title: "開いてください", to: { book } })
  await page.getByRole("button", { name: "開いてください", exact: true }).click()
  const letter = page.getByRole("region", { name: "郵便箱" }).locator("article")
  await expect(center(page)).toBeVisible()
  await letter.getByRole("button", { name: "開く", exact: true }).click()
  await expect(center(page)).toBeHidden()
  await expect(page.getByRole("img", { name: "紙" })).toBeVisible()
})

test("コントロールセンターの間にしおりの「ほか n 件」を押すと、コンテンツエリアが郵便箱になり、何も選ばない", async ({
  page,
}) => {
  await startOnCenter(page)
  for (const n of [1, 2, 3, 4, 5, 6]) await send(page, { title: `手紙 ${n}` })
  await page.getByRole("button", { name: "ほか 1 件" }).click()
  await expect(center(page)).toBeVisible()
  const pane = page.getByRole("region", { name: "郵便箱" })
  await expect(pane.getByRole("listitem")).toHaveCount(6)
  await expect(pane.locator("article")).toHaveCount(0)
})

test("コントロールセンターがカレントスクリーンの間の Esc では、ブックスクリーンへ戻らない", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  await (await fromMenu(page, "コントロールセンター")).click()
  await expect(center(page)).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(center(page)).toBeVisible()
  await expect.poll(() => urlCurrentScreen(page)).toBe(CONTROL_CENTER_SCREEN_DEF)
})

test("宛先なしで開いた窓は、コントロールセンターだけで、ブックスクリーンは無い。AI の view は bookScreen が none", async ({
  page,
}) => {
  await page.goto("/")
  await page.bringToFront()
  await expect(center(page)).toBeVisible()
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(0)
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: await joinedAiAuth() })).json())
    .toMatchObject({ current: "plain-screen", bookScreen: "none" })
})

test("別の窓が、開いているブックをゴミ箱に入れると、そのブックスクリーンは閉じてコントロールセンターがカレントスクリーンになる。URL にもブックスクリーンは残らない", async ({
  page,
  newPage,
}) => {
  const books = (await storedBooks(page.request)) as { id: string; title: string }[]
  const [mine, other] = [books[0]?.id ?? "", books[1]?.id ?? ""]
  await page.goto(bookScreenUrl(mine))
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(1)
  const second = await newPage()
  await second.goto(bookScreenUrl(other))
  await (await fromMenu(second, "書庫を開く")).click()
  await lowerLibrary(second)
    .getByRole("button", { name: books[0]?.title ?? "", exact: true })
    .click()
  await second.keyboard.press("Delete")
  await expect.poll(async () => await storedTrashedAt(page.request, mine)).toBeTruthy()
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(0)
  await expect(center(page)).toBeVisible()
  await expect.poll(() => urlCurrentScreen(page)).toBe(CONTROL_CENTER_SCREEN_DEF)
  await expect.poll(() => page.url()).not.toContain(`%22${mine}%22`)
})

test("ブックスクリーンが無い窓でしおりを押すと、コントロールセンターの郵便箱で選び、「開く」で行き先のブックを新しいブックスクリーンで開く", async ({
  page,
}) => {
  await page.goto("/")
  await page.bringToFront()
  const book = ((await storedBooks(page.request)) as { id: string }[])[0]?.id ?? ""
  const sent = await page.request.post("/api/ai/perform", {
    headers: await joinedAiAuth(),
    data: { action: "@matomezu/base:mail-send", args: { from: "a", title: "開く手紙", to: { book } } },
  })
  expect(sent.ok()).toBe(true)
  await page.getByRole("button", { name: "開く手紙", exact: true }).click()
  const letter = page.getByRole("region", { name: "郵便箱" }).locator("article")
  await expect(letter.getByRole("heading", { name: "開く手紙" })).toBeVisible()
  await expect(letter.getByRole("button")).toHaveText(["開く"])
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(0)
  await letter.getByRole("button", { name: "開く" }).click()
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(1)
  await expect.poll(() => urlCurrentScreen(page)).toBe(BOOK_SCREEN_DEF)
})
test("ブラウザの戻るでブックスクリーンへ戻っても、可変ページは並べた広さのまま（紙 1 枚ぶんに縮まない）", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  const empty = await onPaper(page, 900, 600)
  await page.mouse.click(empty.x, empty.y, { button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "ページの設定" }).click()
  const dialog = page.getByRole("dialog", { name: "ページの設定" })
  await dialog.getByRole("switch", { name: "可変ページにする" }).click()
  await dialog.getByLabel("増やす向き").selectOption({ label: "上下左右" })
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator("[data-print-areas]")).toHaveAttribute("data-print-areas", "3x3")
  await settled(page)
  const grown = (await paper(page).boundingBox())!
  await (await fromMenu(page, "コントロールセンター")).click()
  await expect(center(page)).toBeVisible()
  await page.goBack()
  await expect(center(page)).toBeHidden()
  await settled(page)
  const back = (await paper(page).boundingBox())!
  expect(Math.abs(back.width - grown.width)).toBeLessThan(2)
  expect(Math.abs(back.height - grown.height)).toBeLessThan(2)
})
