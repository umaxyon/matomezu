// タスクボード: コントロールセンターの左の一覧でプロジェクトのタスクボードを出す・隠す、レーンにチケットのチケットカードが並ぶ、レーンの最大化と並べ方の一覧
import { CONTROL_CENTER_URL, expect, joinedAiAuth, type Page, test } from "./fixtures"

const perform = async (page: Page, data: object) =>
  (await page.request.post("/api/ai/perform", { headers: await joinedAiAuth(), data })).json() as Promise<{
    ok: boolean
    result?: { project?: string; ticket?: string }
  }>

const records = async (page: Page, subject: string) =>
  Object.values(
    (
      (await (await page.request.get("/api/data", { headers: await joinedAiAuth() })).json()) as {
        records: Record<string, Record<string, unknown>>
      }
    ).records[subject] ?? {},
  ) as { id: string; name: string; lanes?: { kind: string; id: string }[] }[]

test("一覧でタスクボードを出し入れし、レーンにチケットカードが並び、最大化と並べ方の一覧が動く", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(CONTROL_CENTER_URL)
  // 最初のプロジェクトが無ければ足す（常駐が初めて起動したときに作られる）
  if ((await records(page, "@matomezu/taskboard:project")).length === 0)
    expect((await perform(page, { action: "@matomezu/taskboard:project-add", args: {} })).ok).toBe(true)
  const first = (await records(page, "@matomezu/taskboard:project"))[0]!
  const lane = first.lanes!.find(l => l.kind === "lane")!.id
  expect(
    (
      await perform(page, {
        action: "@matomezu/taskboard:ticket-add",
        args: { project: first.id, name: "最初のチケットカード", lane },
      })
    ).ok,
  ).toBe(true)
  expect(
    (
      await perform(page, {
        action: "@matomezu/taskboard:ticket-add",
        args: { project: first.id, name: "二枚目", lane, priority: "high" },
      })
    ).ok,
  ).toBe(true)

  // 何も選んでいなければ、最初のプロジェクトだけが出る
  const board = page.locator(`[data-board="${first.id}"]`)
  await expect(board).toBeVisible()
  const card = board.locator("[data-card]", { hasText: "最初のチケットカード" })
  await expect(card).toContainText("-001")

  // 一覧は最初は閉じていて、見出しで開く。チェックを外すとタスクボードが消え、入れるとまた出る
  const head = page.locator("button[aria-expanded]", { hasText: "プロジェクト" })
  await expect(head).toHaveAttribute("aria-expanded", "false")
  await head.click()
  const check = page.getByRole("checkbox", { name: first.name })
  await expect(check).toBeChecked()
  await check.uncheck()
  await expect(board).toHaveCount(0)
  await check.check()
  await expect(board).toBeVisible()

  // レーンの最大化: ほかのレーンが畳まれ、元に戻すと戻る
  const lanes = board.locator("[data-lane]")
  const target = board.locator(`[data-lane="${lane}"]`)
  await target.getByRole("button", { name: "最大化" }).click()
  await expect(target).toHaveAttribute("data-max", "true")
  await expect(lanes.nth(1)).toHaveAttribute("data-folded", "true")
  await target.getByRole("button", { name: "元に戻す" }).click()
  await expect(target).toHaveAttribute("data-max", "false")

  // 並べ方の一覧: 開いて、Esc で閉じる
  await target.getByRole("button", { name: "並べ方" }).click()
  await expect(page.getByText("優先度").first()).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(target.getByRole("button", { name: "並べ方" })).toHaveAttribute("aria-expanded", "false")
})

test("ワークルームのボードで見るを押すと、出ていないタスクボードが出て、鳥がチケットカードに立ち寄り、色が付いて、飛び去ると消える", async ({
  page,
}) => {
  await page.goto(CONTROL_CENTER_URL)
  if ((await records(page, "@matomezu/taskboard:project")).length === 0)
    expect((await perform(page, { action: "@matomezu/taskboard:project-add", args: {} })).ok).toBe(true)
  const first = (await records(page, "@matomezu/taskboard:project"))[0]!
  const lane = first.lanes!.find(l => l.kind === "lane")!.id
  const added = await perform(page, {
    action: "@matomezu/taskboard:ticket-add",
    args: { project: first.id, name: "立ち寄り先", lane },
  })
  const ticket = added.result!.ticket!
  expect((await perform(page, { action: "@matomezu/taskboard:current-ticket-set", args: { ticket } })).ok).toBe(true)

  // タスクボードを隠してから、ワークルームを選ぶ
  await page.locator("button[aria-expanded]", { hasText: "プロジェクト" }).click()
  await page.getByRole("checkbox", { name: first.name }).uncheck()
  await expect(page.locator(`[data-board="${first.id}"]`)).toHaveCount(0)
  await page.locator("[data-workroom]").first().getByRole("button").first().click()
  await page.getByRole("button", { name: "ボードで見る" }).click()

  // タスクボードが出て、鳥が来て、チケットカードに色が付く
  const card = page.locator(`[data-card="${ticket}"]`)
  await expect(card).toBeVisible()
  await expect(page.locator("[data-card-visit]")).toBeVisible({ timeout: 10_000 })
  await expect(card).toHaveAttribute("data-lit", "true")
  // 鳥が飛び去ると、鳥も色も消える
  await expect(page.locator("[data-card-visit]")).toHaveCount(0, { timeout: 10_000 })
  await expect(card).toHaveAttribute("data-lit", "false")
})
