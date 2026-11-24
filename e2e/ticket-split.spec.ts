// チケットを上下に分けて開く（M-0120）: 窓が高ければ、カードを押すとコントロールセンターの下にチケットが入り、2 枚目は上に入る。
// 広げると押した 1 枚だけを全画面にし、もう 1 枚は閉じる。窓が低くなれば、カレントの 1 枚を残して全画面に戻す
import { CONTROL_CENTER_URL, expect, type Page, test } from "./fixtures"
import { aiPerform } from "./helpers/ai"
import { storedRecords } from "./helpers/stored"

type Row = { id: string; lanes?: { kind: string; id: string }[] }

// 最初のプロジェクトに、チケット 2 枚を足す
async function twoTickets(page: Page, tag = "") {
  if ((await storedRecords<Row>(page.request, "@matomezu/taskboard:project")).length === 0)
    await aiPerform(page, { action: "@matomezu/taskboard:project-add", args: {} })
  const first = (await storedRecords<Row>(page.request, "@matomezu/taskboard:project"))[0]!
  const lane = first.lanes!.find(l => l.kind === "lane")!.id
  const a = await aiPerform(page, {
    action: "@matomezu/taskboard:ticket-add",
    args: {
      project: first.id,
      name: `上下の一枚目${tag}`,
      lane,
    },
  })
  const b = await aiPerform(page, {
    action: "@matomezu/taskboard:ticket-add",
    args: {
      project: first.id,
      name: `上下の二枚目${tag}`,
      lane,
    },
  })
  return { a: a.result?.ticket ?? "", b: b.result?.ticket ?? "" }
}

const tickets = (page: Page) => page.getByRole("region", { name: "チケット" })
const boxOf = async (page: Page, name: string) =>
  (await tickets(page)
    .filter({ has: page.getByRole("heading", { name }) })
    .boundingBox()) ?? {
    y: -1,
    height: -1,
  }

test("窓が高ければ、カードでチケットを下に分けて開き、2 枚目は上に入る。広げると 1 枚だけ全画面に、もう 1 枚は見えなくなる", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(CONTROL_CENTER_URL)
  const { a, b } = await twoTickets(page)
  await page.locator(`[data-card="${a}"]`).click()
  await expect(tickets(page)).toHaveCount(1)
  // チケットは下の半分、コントロールセンターのカードは上に見えたまま、開いたカードに色が付く
  const lower = await boxOf(page, "上下の一枚目")
  expect(lower.y).toBeGreaterThan(300)
  await expect(page.locator(`[data-card="${a}"]`)).toHaveAttribute("data-open", "true")
  await expect(tickets(page).getByRole("button", { name: "閉じる" })).toBeVisible()
  await expect(tickets(page).getByRole("button", { name: "広げる" })).toBeVisible()
  // 2 枚目は上の段（コントロールセンターの所）に入る
  await page.locator(`[data-card="${b}"]`).click()
  await expect(tickets(page)).toHaveCount(2)
  const upper = await boxOf(page, "上下の二枚目")
  expect(upper.y).toBeLessThan(50)
  expect((await boxOf(page, "上下の一枚目")).y).toBe(lower.y)
  // 2 枚並べている間だけ、帯に巣箱が出る（どちらの帯にも）
  await expect(tickets(page).getByRole("button", { name: "コントロールセンター" })).toHaveCount(2)
  // 上を広げると、それだけが全画面になり、下の 1 枚は開いたまま見えなくなる
  await tickets(page)
    .filter({ has: page.getByRole("heading", { name: "上下の二枚目" }) })
    .getByRole("button", { name: "広げる" })
    .click()
  await expect(tickets(page)).toHaveCount(1)
  await expect(tickets(page).getByRole("heading", { name: "上下の二枚目" })).toBeVisible()
  expect((await boxOf(page, "上下の二枚目")).height).toBeGreaterThan(700)
  await expect(tickets(page).getByRole("button", { name: "戻る" })).toBeVisible()
})

test("分けている間に窓が低くなると、カレントの 1 枚だけを全画面に見せる。開いたカードをもう一度押すと閉じる", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(CONTROL_CENTER_URL)
  const { a, b } = await twoTickets(page)
  await page.locator(`[data-card="${a}"]`).click()
  await expect(tickets(page)).toHaveCount(1)
  // コントロールセンターと 1 枚の間は、帯に巣箱は出ない
  await expect(tickets(page).getByRole("button", { name: "コントロールセンター" })).toHaveCount(0)
  // 開いたカードを押すと閉じ、コントロールセンターだけに戻る
  await page.locator(`[data-card="${a}"]`).click()
  await expect(tickets(page)).toHaveCount(0)
  await page.locator(`[data-card="${a}"]`).click()
  await page.locator(`[data-card="${b}"]`).click()
  await expect(tickets(page)).toHaveCount(2)
  await page.setViewportSize({ width: 1280, height: 700 })
  await expect(tickets(page)).toHaveCount(1)
  await expect(tickets(page).getByRole("heading", { name: "上下の二枚目" })).toBeVisible()
  // 高くなれば、上下に戻る
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(tickets(page)).toHaveCount(2)
})

test("本文のチケットの番号を押すと「開く／分割で開く」を聞き、分割で開くと上の段に入る", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(CONTROL_CENTER_URL)
  const { a, b } = await twoTickets(page)
  const all = await storedRecords<Row>(page.request, "@matomezu/taskboard:ticket")
  const number = (all.find(t => t.id === b) as unknown as { number: number }).number
  const label = `T-${String(number).padStart(4, "0")}`
  await aiPerform(page, {
    action: "@matomezu/taskboard:ticket-update",
    args: { body: `${label} を見る` },
    on: { record: a },
  })
  await page.locator(`[data-card="${a}"]`).click()
  await expect(tickets(page)).toHaveCount(1)
  await tickets(page).getByRole("link", { name: label }).click()
  await expect(page.getByRole("menuitem", { name: "開く", exact: true })).toBeVisible()
  await page.getByRole("menuitem", { name: "分割で開く" }).click()
  await expect(tickets(page)).toHaveCount(2)
  expect((await boxOf(page, "上下の二枚目")).y).toBeLessThan(50)
})

test("横断検索の当たりは、何も開いていなければ下に開き（開いているチケットなら枠を光らせ）、分けている間は「上に開く／下に開く」、全画面のチケットからは「開く／分割で開く」を選ぶ", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(CONTROL_CENTER_URL)
  const tag = `${Date.now()}`
  await twoTickets(page, tag)
  const side = page.locator("[data-left-side-panel]")
  await page.getByRole("button", { name: "横断検索" }).click()
  await side.getByRole("button", { name: "全文" }).click()
  const search = async (word: string) => {
    await side.getByRole("textbox", { name: "検索する言葉" }).fill(word)
    await side
      .getByRole("button", { name: new RegExp(word) })
      .first()
      .click()
  }
  // 何も開いていなければ、聞かずに下に開く
  await search(`上下の一枚目${tag}`)
  await expect(tickets(page)).toHaveCount(1)
  expect((await boxOf(page, `上下の一枚目${tag}`)).y).toBeGreaterThan(300)
  // 開いているチケットに当たると、閉じずに、その枠を一瞬光らせる
  await search(`上下の一枚目${tag}`)
  await expect(tickets(page)).toHaveCount(1)
  await expect(page.locator('[class*="flash"]')).toHaveCount(1)
  // 分けている間は、上か下かを選ぶ。下を選ぶと、下の段が替わる
  await search(`上下の二枚目${tag}`)
  await expect(page.getByRole("menuitem", { name: "上に開く" })).toBeVisible()
  await page.getByRole("menuitem", { name: "下に開く" }).click()
  await expect(tickets(page)).toHaveCount(1)
  await expect(tickets(page).getByRole("heading", { name: `上下の二枚目${tag}` })).toBeVisible()
  // 広げて全画面にすると、開き方を選ぶ
  await tickets(page).getByRole("button", { name: "広げる" }).click()
  await search(`上下の一枚目${tag}`)
  await expect(page.getByRole("menuitem", { name: "開く", exact: true })).toBeVisible()
  await page.getByRole("menuitem", { name: "分割で開く" }).click()
  await expect(tickets(page)).toHaveCount(2)
})

test("チケットを 2 枚並べている間の帯の巣箱は、2 枚とも閉じてコントロールセンターへ戻る", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(CONTROL_CENTER_URL)
  const { a, b } = await twoTickets(page, "nest")
  await page.locator(`[data-card="${a}"]`).click()
  await page.locator(`[data-card="${b}"]`).click()
  await expect(tickets(page)).toHaveCount(2)
  await tickets(page).first().getByRole("button", { name: "コントロールセンター" }).click()
  await expect(tickets(page)).toHaveCount(0)
  await expect(page.locator(`[data-card="${a}"]`)).toBeVisible()
  await expect(page.locator(`[data-card="${a}"]`)).toHaveAttribute("data-open", "false")
})
