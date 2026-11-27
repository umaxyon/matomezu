// 参加: AI が join で参加を頼むと、参加要求のしおりが出る（郵便箱には出さない）。しおりのダイアログで断る・受け入れるを選べる。
// 受け入れるは、ワークルームの名前・鳥・配色を決めるダイアログを開き、決めるとコントロールセンターの参加者リストに出る。断ると何も残さず、AI の次の呼び出しで断られたと分かる。
// 受け入れのダイアログの［キャンセル］は要求を終え、AI はキャンセルされたと分かる
import { aiAuth, BOOK_SCREEN_URL, expect, type Page, test } from "./fixtures"
import { fromMenu } from "./helpers/stage-menu"

const JOINED = "ワークルームに入れます"
const REQUEST = "AI エージェントから参加要求が届きました"

// sessionId を渡すと、MCP がセッション id を運ぶ AI（フックの無い AI）の join になる。渡さなければ、UserPromptSubmit のフックが参加を伝えるまで準備中
async function join(page: Page, link: string, sessionName = "", workroom = "", sessionId = "") {
  const res = await page.request.post("/api/ai/join", {
    headers: aiAuth(),
    data: {
      ai: "claude",
      model: "opus-5",
      env: "wsl",
      sessionName,
      link,
      sessionId,
      ...(workroom ? { workroom } : {}),
    },
  })
  return (await res.json()) as { ok: boolean; participant: string; reason?: string }
}

// 参加者の表（要求が届いた順）。入っているワークルームの名前・鳥・配色を workroom・bird・palette に引き、要求中は希望の名前を workroom に置く
async function participants(page: Page) {
  const body = await (await page.request.get("/api/data")).json()
  const rooms = (body.records?.["@matomezu/base:workroom"] ?? {}) as Record<
    string,
    { name: string; bird: string; palette?: string }
  >
  const people = Object.values(body.records?.["@matomezu/base:participant"] ?? {}) as {
    id: string
    state: string
    workroom?: string
    wantedName?: string
    requestedAt: string
  }[]
  return people
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt) || a.id.localeCompare(b.id))
    .map(p => {
      const room = p.workroom === undefined ? undefined : rooms[p.workroom]
      return { ...p, workroom: room?.name ?? p.wantedName, bird: room?.bird, palette: room?.palette }
    })
}

// この参加者の id で AI の口を呼ぶ（参加が済んでいれば、最後に呼ばれた時刻が進み、受け入れた直後なら参加の知らせが返る）
const call = (page: Page, participant: string) =>
  page.request.get("/api/ai/books", {
    headers: { ...aiAuth(), "X-Matomezu-Participant": participant },
  })

// UserPromptSubmit のフックの代わり。会話の記録から拾った link で、そのセッションに参加者を結び、参加を伝える
const talk = (page: Page, sessionId: string, link: string) =>
  page.request.post("/api/ai/talked", { headers: aiAuth(), data: { sessionId, candidates: [link] } })

// 受け入れたあとに出る、ようこそのダイアログを閉じる
async function closeWelcome(page: Page) {
  const welcome = page.getByRole("dialog", { name: "ようこそ" })
  await welcome.getByRole("button", { name: "閉じる" }).click()
  await expect(welcome).toHaveCount(0)
}

// 参加要求のしおりを押し、参加要求のダイアログを開く
async function openRequest(page: Page) {
  await page.getByRole("button", { name: REQUEST }).click()
  const dialog = page.getByRole("dialog", { name: REQUEST })
  await expect(dialog).toContainText("opus-5")
  return dialog
}

test("参加要求のしおりで受け入れるを押すと、名前・鳥・配色を決めるダイアログが開き、決めるとセンターの参加者リストに鳥と名前が出る", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(BOOK_SCREEN_URL)
  const made = await join(page, "e2e-link-1", "sub4_work")
  const mail = await openRequest(page)
  await expect(mail.getByRole("button")).toHaveText(["断る", "受け入れる"])
  // 合言葉は画面に出さない
  await expect(mail).not.toContainText("e2e-link-1")
  await mail.getByRole("button", { name: "受け入れる" }).click()

  const dialog = page.getByRole("dialog", { name: JOINED })
  // 名前の初めは元のセッション名。空にすると決められない
  const name = dialog.getByRole("textbox", { name: "ワークルーム名" })
  await expect(name).toHaveValue("sub4_work")
  await name.fill("")
  await expect(dialog.getByRole("button", { name: "受け入れる" })).toBeDisabled()
  await name.fill("ひよこ")
  // 鳥は初め先頭の 1 羽（ツナギドリ）、配色は鳥の元の配色
  await expect(dialog.getByRole("radio", { name: "ツナギドリ", exact: true })).toBeChecked()
  await expect(dialog.getByRole("radio", { name: "ツナギドリ・グリーン" })).toBeChecked()
  await dialog.getByRole("radio", { name: "文鳥", exact: true }).check({ force: true })
  await expect(dialog.getByRole("radio", { name: "文鳥・ホワイト" })).toBeChecked()
  await dialog.getByRole("radio", { name: "ピンク" }).check({ force: true })
  await dialog.getByRole("button", { name: "受け入れる" }).click()
  await expect(dialog).toHaveCount(0)
  // 管理者がいないので管理者になる。区分はワーカーで、管理者と添える
  await expect(page.getByRole("dialog", { name: "ようこそ" })).toContainText("ワーカー（管理者）")
  await closeWelcome(page)

  // 受け入れた参加者の表に、決めた名前・鳥・配色が入る
  await expect
    .poll(() => participants(page))
    .toMatchObject([{ id: made.participant, state: "joined", workroom: "ひよこ", bird: "buncho", palette: "pink" }])
  // センターの参加者の一覧に出る（フックが参加を伝えるまでは準備中。鳥も薄くなる）
  await (await fromMenu(page, "コントロールセンター")).click()
  const row = page.getByRole("listitem").filter({ hasText: "ひよこ" })
  await expect(row).toContainText("（準備中）")
  await expect(row.locator("[data-preparing=true]")).toHaveCount(1)
  // 準備中の間は、AI の口を呼んでも参加者として数えない（知らせも返らない）
  const early = await call(page, made.participant)
  expect(early.headers()["x-matomezu-notice"]).toBeUndefined()
  await expect(row).toContainText("（準備中）")
  // フックが参加を伝えると準備中でなくなり、選ぶとワークルームの枠に model・os・最終アクセスが出る
  await talk(page, "S-e2e-1", "e2e-link-1")
  await expect(row).not.toContainText("準備中")
  await row.getByRole("button", { name: "ひよこ", exact: true }).click()
  const room = page.locator("[data-workroom-panel]")
  await expect(room).toContainText("opus-5")
  await expect(room).toContainText("wsl")
  await expect(room).toContainText("たった今")
})

test("セッション id を join で運ぶ AI（フックの無い AI）は、受け入れた直後から準備中でなく、呼ばれると最終アクセスが出る", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(BOOK_SCREEN_URL)
  const made = await join(page, "e2e-link-20", "codex", "", "S-e2e-20")
  await openRequest(page).then(d => d.getByRole("button", { name: "受け入れる" }).click())
  await page.getByRole("dialog", { name: JOINED }).getByRole("button", { name: "受け入れる" }).click()
  await closeWelcome(page)
  await (await fromMenu(page, "コントロールセンター")).click()
  const row = page.getByRole("listitem").filter({ hasText: "codex" })
  await expect(row).toContainText("（空き）")
  await row.getByRole("button", { name: "codex", exact: true }).click()
  const room = page.locator("[data-workroom-panel]")
  await expect(room).toContainText("最終アクセス:なし")
  const told = await call(page, made.participant)
  expect(decodeURIComponent((told.headers()["x-matomezu-notice"] ?? "").replaceAll("+", " "))).toContain(
    "You joined matomezu",
  )
  await expect(room).toContainText("たった今")
})

test("フックが知らせた会話のコンテキストの量は、参加者リストの行のいちばん下に棒と数で出て、物差しの 9 割以上で赤になり、全体設定で物差しを変えると変わり、読めないと知らされると消える", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(BOOK_SCREEN_URL)
  await join(page, "e2e-link-30", "context", "", "S-e2e-30")
  await openRequest(page).then(d => d.getByRole("button", { name: "受け入れる" }).click())
  await page.getByRole("dialog", { name: JOINED }).getByRole("button", { name: "受け入れる" }).click()
  await closeWelcome(page)
  await (await fromMenu(page, "コントロールセンター")).click()
  const row = page.getByRole("listitem").filter({ hasText: "context" })
  const bar = row.locator("[data-context-use]")
  await expect(row).toContainText("（空き）")
  await expect(bar).toHaveCount(0)
  const tell = (contextUse: unknown) =>
    page.request.post("/api/ai/context-use", { headers: aiAuth(), data: { sessionId: "S-e2e-30", contextUse } })
  await tell({ used: 120_400, aiScale: 300_000 })
  await expect(bar).toHaveText("120k")
  await expect(bar).toHaveAttribute("data-near-full", "false")
  const amount = bar.getByText("120k")
  const calm = await amount.evaluate(e => getComputedStyle(e).color)
  await tell({ used: 280_000, aiScale: 300_000 })
  await expect(bar).toHaveText("280k")
  await expect(bar).toHaveAttribute("data-near-full", "true")
  expect(await bar.getByText("280k").evaluate(e => getComputedStyle(e).color)).not.toBe(calm)
  // 全体設定で物差しを 100 万にすると、同じ量でも赤でなくなる
  await page.getByRole("button", { name: "全体設定" }).click()
  const settings = page.getByRole("dialog", { name: "設定" })
  await settings.getByRole("combobox", { name: "コンテキストの物差し" }).selectOption({ label: "100 万" })
  await page.keyboard.press("Escape")
  await expect(settings).toHaveCount(0)
  await expect(bar).toHaveText("280k")
  await expect(bar).toHaveAttribute("data-near-full", "false")
  await tell("unknown")
  await expect(bar).toHaveCount(0)
})

test("保留中の参加要求は参加者の一覧に出ず、一覧が空のうちは空と出る", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByText("ワークルームはありません")).toBeVisible()
  await join(page, "e2e-link-2")
  await expect(page.getByText("ワークルームはありません")).toBeVisible()
})

test("断るを押すとダイアログとしおりが消え、参加者の表から消える。AI は次の呼び出しで断られたと知る（1 度だけ）", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  const made = await join(page, "e2e-link-3")
  const mail = await openRequest(page)
  await mail.getByRole("button", { name: "断る" }).click()
  await expect(mail).toHaveCount(0)
  await expect(page.getByRole("button", { name: REQUEST })).toHaveCount(0)
  await expect.poll(async () => await participants(page)).toEqual([])
  const first = await call(page, made.participant)
  expect(decodeURIComponent(first.headers()["x-matomezu-notice"] ?? "")).toContain("declined")
  const second = await call(page, made.participant)
  expect(second.headers()["x-matomezu-notice"]).toBeUndefined()
})

test("参加要求のしおりは封筒で、郵便箱には出ず、受け入れるとしおりが消える", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  await join(page, "e2e-link-4", "a")
  await expect(page.getByRole("button", { name: REQUEST }).locator("svg")).toBeVisible()
  await (await fromMenu(page, "郵便箱")).click()
  const pane = page.getByRole("region", { name: "郵便箱" })
  await expect(pane).toBeVisible()
  await expect(pane.getByRole("listitem")).toHaveCount(0)
  await page.getByRole("button", { name: "郵便箱を閉じる" }).click()
  const mail = await openRequest(page)
  await mail.getByRole("button", { name: "受け入れる" }).click()
  await page.getByRole("dialog", { name: JOINED }).getByRole("button", { name: "受け入れる" }).click()
  await closeWelcome(page)
  await expect(page.getByRole("button", { name: REQUEST })).toHaveCount(0)
})

test("参加要求のダイアログを Esc で閉じても、要求もしおりも残る", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const made = await join(page, "e2e-link-14")
  const dialog = await openRequest(page)
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole("button", { name: REQUEST })).toBeVisible()
  expect(await participants(page)).toMatchObject([{ id: made.participant, state: "requested" }])
})

test("生きている参加者と同じ名前は、受け入れのダイアログでその場で断る", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const first = await join(page, "e2e-link-5", "同じ名前", "", "S-e2e-5")
  await openRequest(page).then(d => d.getByRole("button", { name: "受け入れる" }).click())
  await page.getByRole("dialog", { name: JOINED }).getByRole("button", { name: "受け入れる" }).click()
  await closeWelcome(page)
  await expect(page.getByRole("dialog", { name: JOINED })).toHaveCount(0)
  await joinedOnHost(page)
  await call(page, first.participant)
  const second = await join(page, "e2e-link-6", "別のセッション")
  expect(second.participant).not.toBe(first.participant)
  await page.getByRole("button", { name: REQUEST }).last().click()
  await page.getByRole("dialog", { name: REQUEST }).getByRole("button", { name: "受け入れる" }).click()
  const dialog = page.getByRole("dialog", { name: JOINED })
  await dialog.getByRole("textbox", { name: "ワークルーム名" }).fill("同じ名前")
  await expect(dialog).toContainText("この名前は使われています")
  await expect(dialog.getByRole("button", { name: "受け入れる" })).toBeDisabled()
  await dialog.getByRole("textbox", { name: "ワークルーム名" }).fill("別の名前")
  await expect(dialog).not.toContainText("この名前は使われています")
  await expect(dialog.getByRole("button", { name: "受け入れる" })).toBeEnabled()
})

test("受け入れのダイアログのキャンセルは要求を終え、しおりが消え、AI はキャンセルされたと知る。答えを待つ間の頼み直しは断り、キャンセルのあとの頼み直しは新しいしおりになる", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  const made = await join(page, "e2e-link-7", "x")
  expect(await join(page, "e2e-link-7", "x")).toMatchObject({ ok: false, reason: "already-requested" })
  await openRequest(page).then(d => d.getByRole("button", { name: "受け入れる" }).click())
  await page.getByRole("dialog", { name: JOINED }).getByRole("button", { name: "キャンセル" }).click()
  await expect(page.getByRole("button", { name: REQUEST })).toHaveCount(0)
  await expect.poll(async () => await participants(page)).toEqual([])
  const told = await call(page, made.participant)
  expect(decodeURIComponent(told.headers()["x-matomezu-notice"] ?? "")).toContain("cancelled")
  const again = await join(page, "e2e-link-7", "x")
  expect(again.ok).toBe(true)
  expect(again.participant).not.toBe(made.participant)
  await expect(page.getByRole("button", { name: REQUEST })).toHaveCount(1)
})

// 受け入れの画面で名前を決めて、参加者を受け入れる
async function acceptAs(page: Page, name: string) {
  await openRequest(page).then(d => d.getByRole("button", { name: "受け入れる" }).click())
  const dialog = page.getByRole("dialog", { name: JOINED })
  await dialog.getByRole("textbox", { name: "ワークルーム名" }).fill(name)
  await dialog.getByRole("button", { name: "受け入れる" }).click()
  await expect(dialog).toHaveCount(0)
  await closeWelcome(page)
  await joinedOnHost(page)
}

// 受け入れのアクションが、常駐まで届くのを待つ
const joinedOnHost = (page: Page) =>
  expect.poll(async () => (await participants(page)).some(p => p.state === "joined")).toBe(true)

// 最後の（新しい）参加要求のしおりを押し、受け入れるを押して受け入れのダイアログを開く
async function openJoinDialog(page: Page) {
  await page.getByRole("button", { name: REQUEST }).last().click()
  await page.getByRole("dialog", { name: REQUEST }).getByRole("button", { name: "受け入れる" }).click()
  return page.getByRole("dialog", { name: JOINED })
}

test("生きていない参加者のワークルームの名前で頼むと、受け入れのダイアログは引き継ぐが選ばれ、確かめて引き継ぐと新しい持ち主に替わる", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  const old = await join(page, "e2e-link-8", "旧")
  await acceptAs(page, "ひよこ")

  // 呼ばれていない（静か）ので、引き継げる参加者に出る。頼まれた名前の参加者が初めから選ばれている
  const next = await join(page, "e2e-link-9", "新", "ひよこ")
  expect(next).toMatchObject({ ok: true })
  const dialog = await openJoinDialog(page)
  await expect(dialog.getByRole("radio", { name: "引き継ぐ" })).toBeChecked()
  await expect(dialog.locator(`[data-participant="${old.participant}"]`)).toContainText("ひよこ")
  await dialog.getByRole("button", { name: "受け入れる" }).click()
  // 最後に確かめる（引き継ぐ・戻る。名前の入力から決めたのではないので、破棄は出さない）
  await expect(dialog).toContainText("ひよこ を引き継ぎますか")
  await expect(dialog.getByRole("button", { name: "前のを破棄して新しく始める" })).toHaveCount(0)
  await dialog.getByRole("button", { name: "引き継ぐ" }).click()
  await expect(dialog).toHaveCount(0)
  await closeWelcome(page)

  // アクションが常駐に届くまで待つ
  await expect
    .poll(() => participants(page))
    .toMatchObject([{ id: next.participant, state: "joined", workroom: "ひよこ", sessionName: "新" }])
  await (await fromMenu(page, "コントロールセンター")).click()
  await expect(page.getByRole("listitem").filter({ hasText: "ひよこ" })).toHaveCount(1)
})

test("名前が生きていない参加者と同じなら、最後に引き継ぐか前のを破棄して新しく始めるかを選べ、破棄すると選んだ鳥で始まって前の参加者は消える", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  const old = await join(page, "e2e-link-14", "旧")
  await acceptAs(page, "ひよこ")
  const next = await join(page, "e2e-link-15", "新")
  const dialog = await openJoinDialog(page)
  await dialog.getByRole("radio", { name: "新しく始める" }).check()
  await dialog.getByRole("textbox", { name: "ワークルーム名" }).fill("ひよこ")
  await expect(dialog).toContainText("この名前の、引き継げる部屋があります")
  await dialog.getByRole("radio", { name: "文鳥", exact: true }).check({ force: true })
  await dialog.getByRole("button", { name: "受け入れる" }).click()
  await expect(dialog).toContainText("ひよこ を引き継ぎますか。前のを破棄して新しく始めますか")
  await dialog.getByRole("button", { name: "前のを破棄して新しく始める" }).click()
  await expect(dialog).toHaveCount(0)
  await closeWelcome(page)

  await expect
    .poll(() => participants(page))
    .toMatchObject([{ id: next.participant, state: "joined", workroom: "ひよこ", bird: "buncho" }])
  expect((await participants(page)).some(p => p.id === old.participant)).toBe(false)
})

test("頼まれた名前の参加要求を断ると、元の参加者はそのまま残る", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const old = await join(page, "e2e-link-10", "旧")
  await acceptAs(page, "ひよこ")
  await join(page, "e2e-link-11", "新", "ひよこ")
  await page.getByRole("button", { name: REQUEST }).last().click()
  await page.getByRole("dialog", { name: REQUEST }).getByRole("button", { name: "断る" }).click()
  const table = await participants(page)
  expect(table).toMatchObject([{ id: old.participant, state: "joined", workroom: "ひよこ" }])
})

test("生きている参加者のワークルームは引き継げない。断られ、要求も残らない", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const old = await join(page, "e2e-link-12", "旧", "", "S-e2e-12")
  await acceptAs(page, "ひよこ")
  await call(page, old.participant)
  const refused = await join(page, "e2e-link-13", "新", "ひよこ")
  expect(refused).toMatchObject({ ok: false, reason: "workroom-in-use" })
  const table = await participants(page)
  expect(table).toHaveLength(1)
  await expect(page.getByRole("button", { name: REQUEST })).toHaveCount(0)
})

test("列は、呼ばれた時刻と参加の新しい順に並び、列に触れている間は並びが止まって、離れると並び直す", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(BOOK_SCREEN_URL)
  const first = await join(page, "e2e-link-order-1", "order-1", "", "S-order-1")
  await acceptAs(page, "あいう")
  const second = await join(page, "e2e-link-order-2", "order-2", "", "S-order-2")
  const dialog = await openJoinDialog(page)
  await dialog.getByRole("textbox", { name: "ワークルーム名" }).fill("かきく")
  await dialog.getByRole("button", { name: "受け入れる" }).click()
  await expect(dialog).toHaveCount(0)
  await closeWelcome(page)
  await expect.poll(async () => (await participants(page)).filter(p => p.state === "joined").length).toBe(2)
  // 1 人目のワーカー（あいう）は受け入れで管理者になり、いつも先頭に出る。並びだけを見るため、管理者を置かない形にする
  const noAdmin = await page.request.post("/api/perform", {
    data: { actions: [{ action: "@matomezu/base:admin-set", args: { workroom: "none" }, on: { record: "admin" } }] },
  })
  expect(await noAdmin.json()).toMatchObject({ ok: true })
  await (await fromMenu(page, "コントロールセンター")).click()
  const names = () => page.locator("[data-workroom]").evaluateAll(els => els.map(e => e.textContent ?? ""))
  const order = async () => (await names()).map(t => (t.includes("あいう") ? "あいう" : "かきく"))
  // 常駐に残った時刻（呼ばれた時刻と参加した時刻の新しいほう）の新しい順。マシンの時計は合わせ直しで後ろへ戻ることがあり、
  // 戻った直後に残った時刻は前の時刻より古くなるので、画面の並びはコメントの並びでなく、この並びと比べる
  const byTimes = async () => {
    const body = await (await page.request.get("/api/data")).json()
    const at = (p: { participant: string }) => {
      const joinedAt = body.records["@matomezu/base:participant"][p.participant].joinedAt as string
      const calledAt = body.participantCalls?.[p.participant] as string | undefined
      return Math.max(Date.parse(joinedAt), calledAt ? Date.parse(calledAt) : 0)
    }
    return at(first) > at(second) ? ["あいう", "かきく"] : ["かきく", "あいう"]
  }
  const followsTimes = async () => {
    const [shown, recorded] = [await order(), await byTimes()]
    return shown.join() === recorded.join() ? "follows" : `shown ${shown}, by the times ${recorded}`
  }
  const calledOf = async (p: { participant: string }) =>
    (await (await page.request.get("/api/data")).json()).participantCalls?.[p.participant]
  // あとから参加したほうが上
  await expect.poll(followsTimes).toBe("follows")
  // 先に参加したほうが呼ばれると、上へ来る
  await call(page, first.participant)
  await expect.poll(() => calledOf(first)).toBeTruthy()
  await expect.poll(followsTimes).toBe("follows")
  // 列に触れている間は、呼ばれても並びが止まる。離れると並び直す
  const top = (await order())[0]!
  await page.locator("[data-workroom]").first().hover()
  await call(page, second.participant)
  await expect.poll(() => calledOf(second)).toBeTruthy()
  await expect(page.locator("[data-workroom]").first()).toContainText(top)
  await page.mouse.move(0, 0)
  await expect.poll(followsTimes).toBe("follows")
})

test("ビジター: as visitor で頼むと参加要求のダイアログにそう出て、受け入れのダイアログは区分を選ばせず、受け入れると、ようこそに区分が出て、センターのビジターの節に並ぶ。ビジターはブックも変えられず、確かめて外すと消える", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(BOOK_SCREEN_URL)
  const res = await page.request.post("/api/ai/join", {
    headers: aiAuth(),
    data: {
      ai: "claude",
      model: "opus-5",
      env: "wsl",
      sessionName: "見学",
      link: "e2e-visitor-1",
      sessionId: "S-v1",
      as: "visitor",
    },
  })
  const made = (await res.json()) as { participant: string }
  // 参加要求のダイアログにも、ビジターとして頼んだことが出る
  const mail = await openRequest(page)
  await expect(mail).toContainText("参加者区分: ビジター（読むだけ）")
  await mail.getByRole("button", { name: "受け入れる" }).click()
  // ビジターはワークルームに入れないので、題は「参加を受け入れます」
  const dialog = page.getByRole("dialog", { name: "参加を受け入れます" })
  await expect(dialog).toContainText("ビジターとして参加を頼んでいます")
  await expect(dialog.getByRole("radio", { name: "ワーカー" })).toHaveCount(0)
  await expect(dialog.getByRole("textbox", { name: "ワークルーム名" })).toHaveCount(0)
  await dialog.getByRole("button", { name: "受け入れる" }).click()
  const welcome = page.getByRole("dialog", { name: "ようこそ" })
  await expect(welcome).toContainText("claude / 見学 が参加しました")
  await expect(welcome).toContainText("ビジター（読むだけ）")
  await closeWelcome(page)
  await expect.poll(() => participants(page)).toMatchObject([{ id: made.participant, state: "visitor" }])

  // ビジターは、ブックを変えるアクションも断られる（理由は visitor）
  const done = await page.request.post("/api/ai/perform", {
    headers: { ...aiAuth(), "X-Matomezu-Participant": made.participant },
    data: { action: "@matomezu/base:book-create", args: { title: "x" } },
  })
  expect(await done.json()).toMatchObject({
    ok: false,
    reason: "not-allowed",
    detail: expect.stringMatching(/^visitor:/),
  })

  // センターの一覧の下にビジターの節。選ぶと右に情報、外すと消える
  await (await fromMenu(page, "コントロールセンター")).click()
  const row = page.locator(`[data-visitor="${made.participant}"]`)
  await expect(row).toContainText("claude / 見学")
  await row.getByRole("button").click()
  const panel = page.locator("[data-workroom-panel]")
  await expect(panel).toContainText("ビジター（読むだけ）")
  await expect(panel).toContainText("opus-5")
  await panel.getByRole("button", { name: "ビジターを外す" }).click()
  // 確かめのダイアログ: キャンセルは何も変えず、外すで外れる
  const confirm = page.getByRole("dialog", { name: "ビジターを外す" })
  await expect(confirm).toContainText("claude / 見学")
  await confirm.getByRole("button", { name: "キャンセル" }).click()
  await expect(row).toHaveCount(1)
  await panel.getByRole("button", { name: "ビジターを外す" }).click()
  await confirm.getByRole("button", { name: "外す", exact: true }).click()
  await expect(confirm).toHaveCount(0)
  await expect(row).toHaveCount(0)
  await expect.poll(() => participants(page)).toHaveLength(0)
})

test("ワーカーとして頼んだ要求も、受け入れのダイアログでビジターを選ぶと、題が替わってワークルームの入力Formが消え、ワークルームを作らずに受け入れる", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  const made = await join(page, "e2e-visitor-2", "選ぶ", "", "S-v2")
  const mail = await openRequest(page)
  await expect(mail).not.toContainText("参加者区分")
  await mail.getByRole("button", { name: "受け入れる" }).click()
  const dialog = page.getByRole("dialog", { name: JOINED })
  await expect(dialog.getByRole("radio", { name: "ワーカー" })).toBeChecked()
  await dialog.getByRole("radio", { name: "ビジター" }).check()
  // 題が「参加を受け入れます」に替わる
  const visitor = page.getByRole("dialog", { name: "参加を受け入れます" })
  await expect(visitor).toContainText("読むだけ。ワークルームは持たない")
  await expect(visitor.getByRole("textbox", { name: "ワークルーム名" })).toHaveCount(0)
  await visitor.getByRole("button", { name: "受け入れる" }).click()
  await closeWelcome(page)
  await expect.poll(() => participants(page)).toMatchObject([{ id: made.participant, state: "visitor" }])
  const body = await (await page.request.get("/api/data")).json()
  expect(Object.keys(body.records["@matomezu/base:workroom"] ?? {})).toHaveLength(0)
})
