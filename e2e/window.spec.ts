// 窓: コントロールセンターかブックスクリーンを前に出す。開いた直後はコントロールセンター、止まり木のボタンで行き来し、戻ってもブックスクリーンの中は残る。
// 前に出す物を替えるのはブラウザの履歴に 1 つ積み、戻る・進むで戻る
import { aiAuth, BOOK_SCREEN_URL, CONTROL_CENTER_URL, expect, type Page, test } from "./fixtures"
import { fromMenu } from "./helpers/stage-menu"

const center = (page: Page) => page.getByRole("heading", { name: "コントロールセンター" })

test("開いた直後（URL が無いとき）はコントロールセンターが前に出て、後ろのブックスクリーンは隠れている", async ({
  page,
}) => {
  await page.goto("/")
  await expect(center(page)).toBeVisible()
  await expect(page.getByRole("heading", { name: "参加者" })).toBeVisible()
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(0)
  await expect(page).toHaveURL(/f=center/)
})

test("止まり木のボタンでコントロールセンターへ行き、押すとブックスクリーンへ戻る。戻ってもステージの中は残る", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await expect(center(page)).toBeHidden()
  await (await fromMenu(page, "画面を分割")).click()
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(2)
  await (await fromMenu(page, "コントロールセンター")).click()
  await expect(center(page)).toBeVisible()
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(0)
  // センターの下の行の止まり木は押された状態で、押すと戻る
  const perch = page.getByRole("button", { name: "コントロールセンター" })
  await expect(perch).toHaveAttribute("aria-pressed", "true")
  await perch.click()
  await expect(center(page)).toBeHidden()
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(2)
})

test("前に出す物を替えるのはブラウザの履歴に 1 つ積み、戻る・進むで戻る", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  await (await fromMenu(page, "コントロールセンター")).click()
  await expect(center(page)).toBeVisible()
  await expect(page).toHaveURL(/f=center/)
  await page.goBack()
  await expect(center(page)).toBeHidden()
  await expect(page.getByRole("img", { name: "紙" })).toBeVisible()
  await page.goForward()
  await expect(center(page)).toBeVisible()
})

// コントロールセンターから始め、後ろのブックスクリーンが開いているブックの id を返す
async function startOnCenter(page: Page): Promise<string> {
  await page.goto(CONTROL_CENTER_URL)
  await page.bringToFront()
  await expect(center(page)).toBeVisible()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: aiAuth() })).json())
    .toHaveProperty("hidden.book")
  const view = await (await page.request.get("/api/ai/view", { headers: aiAuth() })).json()
  expect(view).toMatchObject({ front: "control-center" })
  expect("book" in view || "awaiting" in view).toBe(false)
  return view.hidden.book as string
}
const send = async (page: Page, args: object) =>
  page.request.post("/api/ai/perform", {
    headers: aiAuth(),
    data: { action: "@matomezu/base:mail-send", args: { project: "default", from: "D92", ...args } },
  })
const visitedAt = async (page: Page) =>
  (
    (await (await page.request.get("/api/ai/mail?projects=default", { headers: aiAuth() })).json()).mailbox as {
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
  await page.getByRole("button", { name: "コントロールセンター" }).click()
  await expect(center(page)).toBeHidden()
  await expect.poll(() => visitedAt(page)).toBeTruthy()
})

test("コントロールセンターの間でも、しおりから開くとブックスクリーンが前に出て行き先が見える", async ({ page }) => {
  const book = await startOnCenter(page)
  await send(page, { title: "開いてください", to: { book } })
  await page.getByRole("button", { name: "開いてください" }).click()
  const dialog = page.getByRole("dialog", { name: "開いてください" })
  await dialog.getByRole("button", { name: "開く", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(center(page)).toBeHidden()
  await expect(page.getByRole("img", { name: "紙" })).toBeVisible()
})

test("コントロールセンターの間でも、しおりが 4 通以上のときの郵便箱の入口を押すと、ブックスクリーンが前に出て左サイドパネルが開く", async ({
  page,
}) => {
  await startOnCenter(page)
  for (const n of [1, 2, 3, 4]) await send(page, { title: `手紙 ${n}` })
  await page.getByRole("button", { name: "未読の郵便 4 通" }).click()
  await expect(center(page)).toBeHidden()
  await expect(page.getByRole("complementary", { name: "左サイドパネル" })).toBeVisible()
})

test("コントロールセンターを前に出している間、Esc でブックスクリーンへ戻る", async ({ page }) => {
  await page.goto(CONTROL_CENTER_URL)
  await expect(center(page)).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(center(page)).toBeHidden()
  await expect(page).not.toHaveURL(/f=center/)
})
