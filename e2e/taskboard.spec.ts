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
  ) as {
    id: string
    name: string
    lanes?: { kind: string; id: string }[]
    createdBy?: { workroom?: { id: string } }
  }[]

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
  await expect(card).toContainText("-0001")

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

  // レーンの最大化: ほかのレーンが畳まれ、タスクボードの置き場は、退いたワークルームの下の端まで広がる。元に戻すと戻る
  const lanes = board.locator("[data-lane]")
  const target = board.locator(`[data-lane="${lane}"]`)
  const area = page.locator("[data-boards-area]")
  const roomBottom = await page.locator("[data-workroom-panel]").evaluate(e => e.getBoundingClientRect().bottom)
  await target.getByRole("button", { name: "最大化" }).click()
  await expect(target).toHaveAttribute("data-max", "true")
  await expect(lanes.nth(1)).toHaveAttribute("data-folded", "true")
  await expect.poll(() => area.evaluate(e => Math.round(e.getBoundingClientRect().bottom))).toBe(Math.round(roomBottom))
  // レーンの最大化の間は、レーンのボタンも、タスクボードの題の帯のボタンも「元の大きさに戻す」になる
  await expect(board.getByRole("button", { name: "元の大きさに戻す" })).toHaveCount(2)
  await target.getByRole("button", { name: "元の大きさに戻す" }).click()
  await expect(target).toHaveAttribute("data-max", "false")

  // 並べ方の一覧: 開いて、Esc で閉じる
  await target.getByRole("button", { name: "並べ方" }).click()
  await expect(page.getByText("優先度").first()).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(target.getByRole("button", { name: "並べ方" })).toHaveAttribute("aria-expanded", "false")
})

test("担当の 2 人目のチケットでも、作業中のレーンへ入れると現在のタスクに出て、ボードで見るを押すと、出ていないタスクボードが出て、鳥がチケットカードに立ち寄り、色が付いて、飛び去ると消える", async ({
  page,
}) => {
  await page.goto(CONTROL_CENTER_URL)
  if ((await records(page, "@matomezu/taskboard:project")).length === 0)
    expect((await perform(page, { action: "@matomezu/taskboard:project-add", args: {} })).ok).toBe(true)
  const first = (await records(page, "@matomezu/taskboard:project"))[0]!
  const lane = first.lanes!.find(l => l.kind === "lane")!.id
  // 利用者が、そのレーンに作業中の印を付ける
  const marked = first.lanes!.map(l => (l.kind === "lane" && l.id === lane ? { ...l, working: true } : l))
  const updated = await page.request.post("/api/perform", {
    data: {
      actions: [{ action: "@matomezu/taskboard:project-update", args: { lanes: marked }, on: { record: first.id } }],
    },
  })
  expect(((await updated.json()) as { ok: boolean }).ok).toBe(true)
  const added = await perform(page, {
    action: "@matomezu/taskboard:ticket-add",
    args: { project: first.id, name: "立ち寄り先" },
  })
  const ticket = added.result!.ticket!
  // タスクボードを隠してから、ワークルームを選ぶ（現在のタスクはまだなし）
  const own = (await records(page, "@matomezu/taskboard:ticket")).find(t => t.id === ticket)!.createdBy!.workroom!.id
  await page.locator("button[aria-expanded]", { hasText: "プロジェクト" }).click()
  await page.getByRole("checkbox", { name: first.name }).uncheck()
  await expect(page.locator(`[data-board="${first.id}"]`)).toHaveCount(0)
  await page.locator(`[data-workroom="${own}"]`).getByRole("button").first().click()
  const task = page.locator('[data-column="task"]')
  await expect(task).toContainText("なし")
  // 利用者が足した空のワークルームを主担当に、AI が自分のワークルームを 2 人目の担当にして、作業中のレーンへ入れると、現在のタスクにそのチケットが出る
  const roomAdded = await page.request.post("/api/perform", {
    data: {
      actions: [{ action: "@matomezu/base:workroom-add", args: { name: `主担当${Date.now() % 1e6}`, bird: "inko" } }],
    },
  })
  const lead = ((await roomAdded.json()) as { result?: { workroom: string } }).result!.workroom
  expect(
    (
      await perform(page, {
        action: "@matomezu/taskboard:ticket-update",
        args: { assignees: [lead, own], lane },
        on: { record: ticket },
      })
    ).ok,
  ).toBe(true)
  await expect(task).toContainText("立ち寄り先")
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

test("レーンのタイトル帯をドラッグすると、レーンが左右に入れ替わり、離す前は入るすき間に線が出る", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(CONTROL_CENTER_URL)
  if ((await records(page, "@matomezu/taskboard:project")).length === 0)
    expect((await perform(page, { action: "@matomezu/taskboard:project-add", args: {} })).ok).toBe(true)
  const first = (await records(page, "@matomezu/taskboard:project"))[0]!
  const board = page.locator(`[data-board="${first.id}"]`)
  // 入る動き（右から滑り込む）が終わって、位置が止まってから測る（動いている間の位置でつかむと、別の所を運ぶことになる）
  await expect(board).toHaveAttribute("data-state", "idle")
  const lanes = board.locator("[data-lane]")
  const ids = async () => lanes.evaluateAll(els => els.map(e => e.getAttribute("data-lane")))
  const before = await ids()
  expect(before.length).toBeGreaterThan(1)
  const [a, b] = before as [string, string]

  // タイトル帯の字は選べない
  await expect(lanes.nth(1).locator("> div").first()).toHaveCSS("user-select", "none")

  // つかんで先頭のレーンの上へ運ぶと、先頭の手前（左の辺）に印が出て、離すと入れ替わる
  const handle = lanes.nth(1).locator("> div").first()
  let last = ""
  await expect
    .poll(
      async () => {
        const now = JSON.stringify([await handle.boundingBox(), await lanes.nth(0).boundingBox()])
        const same = now === last
        last = now
        return same
      },
      { intervals: [100] },
    )
    .toBe(true)
  const from = (await handle.boundingBox())!
  const over = (await lanes.nth(0).boundingBox())!
  await page.mouse.move(from.x + 40, from.y + 6)
  await page.mouse.down()
  await page.mouse.move(over.x + 40, over.y + 60, { steps: 8 })
  await expect(lanes.nth(0)).toHaveAttribute("data-drop", "before")
  await page.mouse.up()
  await expect.poll(ids).toEqual([b, a, ...before.slice(2)])

  // 戻す
  await lanes.nth(1).locator("> div").first().dragTo(lanes.nth(0))
  await expect.poll(ids).toEqual(before)
})

test("一覧でプロジェクトをつまみで入れ替えても、チェックはプロジェクトに付いて行く", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(CONTROL_CENTER_URL)
  if ((await records(page, "@matomezu/taskboard:project")).length === 0)
    expect((await perform(page, { action: "@matomezu/taskboard:project-add", args: {} })).ok).toBe(true)
  if ((await records(page, "@matomezu/taskboard:project")).length < 2)
    expect(
      (await perform(page, { action: "@matomezu/taskboard:project-add", args: { name: "二つ目", prefix: "SW-" } })).ok,
    ).toBe(true)
  const head = page.locator("button[aria-expanded]", { hasText: "プロジェクト" })
  if ((await head.getAttribute("aria-expanded")) === "false") await head.click()
  const rows = page.locator("li[data-project]")
  const state = async () =>
    rows.evaluateAll(els =>
      els.map(e => `${e.getAttribute("data-project")}:${(e.querySelector("input") as HTMLInputElement).checked}`),
    )
  const before = await state()
  await rows.nth(1).locator("span").first().dragTo(rows.nth(0))
  // 入れ替わっても、各プロジェクトのチェックの有無はそのまま
  await expect.poll(async () => (await state()).slice().sort()).toEqual(before.slice().sort())
  await expect.poll(async () => (await state())[0]).toBe(before[1])
})

test("完了のアクションで、チケットカードが完了のレーンへ移る。ほかの道で完了のレーンへ入れることは断られる", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(CONTROL_CENTER_URL)
  if ((await records(page, "@matomezu/taskboard:project")).length === 0)
    expect((await perform(page, { action: "@matomezu/taskboard:project-add", args: {} })).ok).toBe(true)
  const first = (await records(page, "@matomezu/taskboard:project"))[0]! as { id: string; doneLane?: string } & {
    lanes?: { kind: string; id: string }[]
  }
  const todo = first.lanes!.find(l => l.kind === "lane")!.id
  expect(typeof first.doneLane).toBe("string") // 最初のプロジェクトは、完了のレーンが最初から決まっている
  const added = await perform(page, {
    action: "@matomezu/taskboard:ticket-add",
    args: { project: first.id, name: "完了させるチケット", lane: todo },
  })
  const ticket = added.result?.ticket as string
  const board = page.locator(`[data-board="${first.id}"]`)
  await expect(board).toHaveAttribute("data-state", "idle")
  const card = board.locator("[data-card]", { hasText: "完了させるチケット" })
  await expect(card).toBeVisible()
  // ほかの道で完了のレーンへは入れない
  const moved = await page.request.post("/api/ai/perform", {
    headers: await joinedAiAuth(),
    data: { action: "@matomezu/taskboard:ticket-update", args: { lane: first.doneLane }, on: { record: ticket } },
  })
  expect((await moved.json()).ok).toBe(false)
  const done = await perform(page, { action: "@matomezu/taskboard:ticket-complete", args: {}, on: { record: ticket } })
  expect(done.ok).toBe(true)
  await expect(
    board.locator(`[data-lane="${first.doneLane}"]`).locator("[data-card]", { hasText: "完了させるチケット" }),
  ).toBeVisible()
})
