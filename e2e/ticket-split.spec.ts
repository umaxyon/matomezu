// チケットを上下に分けて開く（M-0120）: 窓が高ければ、カードを押すとコントロールセンターの下にチケットが入り、2 枚目は上に入る。
// 広げると押した 1 枚だけを全画面にし、もう 1 枚は閉じる。窓が低くなれば、カレントの 1 枚を残して全画面に戻す
import { CONTROL_CENTER_URL, expect, joinedAiAuth, type Page, test } from "./fixtures"

const perform = async (page: Page, action: string, args: object, on?: object) =>
  (
    await page.request.post("/api/ai/perform", {
      headers: await joinedAiAuth(),
      data: { action, args, ...(on ? { on } : {}) },
    })
  ).json() as Promise<{
    ok: boolean
    result?: Record<string, string>
  }>

const records = async (page: Page, subject: string) =>
  Object.values(
    (
      (await (await page.request.get("/api/data", { headers: await joinedAiAuth() })).json()) as {
        records: Record<string, Record<string, unknown>>
      }
    ).records[subject] ?? {},
  ) as { id: string; lanes?: { kind: string; id: string }[] }[]

// 最初のプロジェクトに、チケット 2 枚を足す
async function twoTickets(page: Page) {
  if ((await records(page, "@matomezu/taskboard:project")).length === 0)
    await perform(page, "@matomezu/taskboard:project-add", {})
  const first = (await records(page, "@matomezu/taskboard:project"))[0]!
  const lane = first.lanes!.find(l => l.kind === "lane")!.id
  const a = await perform(page, "@matomezu/taskboard:ticket-add", { project: first.id, name: "上下の一枚目", lane })
  const b = await perform(page, "@matomezu/taskboard:ticket-add", { project: first.id, name: "上下の二枚目", lane })
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

test("窓が高ければ、カードでチケットを下に分けて開き、2 枚目は上に入る。広げると 1 枚だけ全画面に、もう 1 枚は閉じる", async ({
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
  // 上を広げると、それだけが全画面になり、下の 1 枚は閉じる
  await tickets(page)
    .filter({ has: page.getByRole("heading", { name: "上下の二枚目" }) })
    .getByRole("button", { name: "広げる" })
    .click()
  await expect(tickets(page)).toHaveCount(1)
  await expect(tickets(page).getByRole("heading", { name: "上下の二枚目" })).toBeVisible()
  expect((await boxOf(page, "上下の二枚目")).height).toBeGreaterThan(700)
  await expect(tickets(page).getByRole("button", { name: "戻る" })).toBeVisible()
})

test("分けている間に窓が低くなると、カレントの 1 枚を残して全画面に戻す。開いたカードをもう一度押すと閉じる", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(CONTROL_CENTER_URL)
  const { a, b } = await twoTickets(page)
  await page.locator(`[data-card="${a}"]`).click()
  await expect(tickets(page)).toHaveCount(1)
  // 開いたカードを押すと閉じ、コントロールセンターだけに戻る
  await page.locator(`[data-card="${a}"]`).click()
  await expect(tickets(page)).toHaveCount(0)
  await page.locator(`[data-card="${a}"]`).click()
  await page.locator(`[data-card="${b}"]`).click()
  await expect(tickets(page)).toHaveCount(2)
  await page.setViewportSize({ width: 1280, height: 700 })
  await expect(tickets(page)).toHaveCount(1)
  await expect(tickets(page).getByRole("heading", { name: "上下の二枚目" })).toBeVisible()
  expect(new URL(page.url()).searchParams.get("sc")).not.toContain("split-rows")
})

test("本文のチケットの番号を押すと「開く／分割して開く」を聞き、分割して開くと上の段に入る", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(CONTROL_CENTER_URL)
  const { a, b } = await twoTickets(page)
  const all = await records(page, "@matomezu/taskboard:ticket")
  const number = (all.find(t => t.id === b) as unknown as { number: number }).number
  const label = `T-${String(number).padStart(4, "0")}`
  await perform(page, "@matomezu/taskboard:ticket-update", { body: `${label} を見る` }, { record: a })
  await page.locator(`[data-card="${a}"]`).click()
  await expect(tickets(page)).toHaveCount(1)
  await tickets(page).getByRole("link", { name: label }).click()
  await expect(page.getByRole("menuitem", { name: "開く", exact: true })).toBeVisible()
  await page.getByRole("menuitem", { name: "分割して開く" }).click()
  await expect(tickets(page)).toHaveCount(2)
  expect((await boxOf(page, "上下の二枚目")).y).toBeLessThan(50)
})
