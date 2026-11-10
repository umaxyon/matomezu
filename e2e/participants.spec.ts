// 参加: AI が join で参加を頼むと、参加要求の郵便が届く。郵便のダイアログで断る・受け入れるを選べる。
// 受け入れるは、ワークルームの名前・鳥・配色を決めるダイアログを開き、決めるとコントロールセンターの参加者リストに出る。断ると何も残さず、AI の次の呼び出しで断られたと分かる
import { aiAuth, BOOK_SCREEN_URL, expect, type Page, test } from "./fixtures"
import { fromMenu } from "./helpers/stage-menu"

const JOINED = "ワークルームに入れます"
const REQUEST = "AI エージェントから参加要求が届きました"

// sessionId を渡すと、MCP がセッション id を運ぶ AI（フックの無い AI）の join になる。渡さなければ、話しかけのフックが参加を伝えるまで準備中
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
      projects: ["default"],
      ...(workroom ? { workroom } : {}),
    },
  })
  return (await res.json()) as { ok: boolean; participant: string; reason?: string }
}

// この参加者の id で AI の口を呼ぶ（参加が済んでいれば、最後に呼ばれた時刻が進み、受け入れた直後なら参加の知らせが返る）
const call = (page: Page, participant: string) =>
  page.request.get("/api/ai/books?projects=default", {
    headers: { ...aiAuth(), "X-Matomezu-Participant": participant },
  })

// 話しかけのフックの代わり。会話の記録から拾った link で、そのセッションに参加者を結び、参加を伝える
const talk = (page: Page, sessionId: string, link: string) =>
  page.request.post("/api/ai/talked", { headers: aiAuth(), data: { sessionId, candidates: [link] } })

// 画面を開き、参加要求の郵便のダイアログを開く
async function openRequest(page: Page) {
  await page.getByRole("button", { name: REQUEST }).click()
  const dialog = page.getByRole("dialog", { name: REQUEST })
  await expect(dialog).toContainText("opus-5")
  return dialog
}

test("参加要求の郵便で受け入れるを押すと、名前・鳥・配色を決めるダイアログが開き、決めるとセンターの参加者リストに鳥と名前が出る", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(BOOK_SCREEN_URL)
  const made = await join(page, "e2e-link-1", "sub4_work")
  const mail = await openRequest(page)
  await expect(mail.getByRole("button")).toHaveText(["閉じる", "断る", "受け入れる"])
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

  // 受け入れた参加者の表に、決めた名前・鳥・配色が入る
  const body = await (await page.request.get("/api/data", { headers: aiAuth() })).json()
  expect(body.participants).toMatchObject([
    { id: made.participant, state: "joined", workroom: "ひよこ", bird: "buncho", palette: "pink" },
  ])
  // センターの参加者リストに出る（フックが参加を伝えるまでは準備中）
  await (await fromMenu(page, "コントロールセンター")).click()
  const row = page.locator(`[data-participant="${made.participant}"]`)
  await expect(row).toContainText("ひよこ")
  await expect(row).toContainText("claude / opus-5 / wsl")
  await expect(row).toContainText("準備中")
  // 準備中の間は、AI の口を呼んでも参加者として数えない（知らせも返らない）
  const early = await call(page, made.participant)
  expect(early.headers()["x-matomezu-notice"]).toBeUndefined()
  await expect(row).toContainText("準備中")
  // フックが参加を伝えると生きている
  await talk(page, "S-e2e-1", "e2e-link-1")
  await expect(row).toContainText("生きている")
})

test("セッション id を join で運ぶ AI（フックの無い AI）は、受け入れた直後は準備中でなく静かで、呼ばれると生きている", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(BOOK_SCREEN_URL)
  const made = await join(page, "e2e-link-20", "codex", "", "S-e2e-20")
  await openRequest(page).then(d => d.getByRole("button", { name: "受け入れる" }).click())
  await page.getByRole("dialog", { name: JOINED }).getByRole("button", { name: "受け入れる" }).click()
  await (await fromMenu(page, "コントロールセンター")).click()
  const row = page.locator(`[data-participant="${made.participant}"]`)
  await expect(row).toContainText("静か")
  const told = await call(page, made.participant)
  expect(decodeURIComponent((told.headers()["x-matomezu-notice"] ?? "").replaceAll("+", " "))).toContain(
    "You joined matomezu",
  )
  await expect(row).toContainText("生きている")
})

test("保留中の参加要求は参加者リストに出ず、リストが空のうちは空と出る", async ({ page }) => {
  await page.goto("/?f=center")
  await expect(page.getByText("参加者はいません")).toBeVisible()
  await join(page, "e2e-link-2")
  await expect(page.getByText("参加者はいません")).toBeVisible()
})

test("断るを押すと郵便が閉じ、参加者の表から消える。AI は次の呼び出しで断られたと知る（1 度だけ）", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  const made = await join(page, "e2e-link-3")
  const mail = await openRequest(page)
  await mail.getByRole("button", { name: "断る" }).click()
  await expect(mail).toHaveCount(0)
  await expect
    .poll(async () => (await (await page.request.get("/api/data", { headers: aiAuth() })).json()).participants)
    .toEqual([])
  const first = await call(page, made.participant)
  expect(decodeURIComponent(first.headers()["x-matomezu-notice"] ?? "")).toContain("declined")
  const second = await call(page, made.participant)
  expect(second.headers()["x-matomezu-notice"]).toBeUndefined()
})

test("受け入れ済みの参加要求の郵便には、断る・受け入れるが出ない", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  await join(page, "e2e-link-4", "a")
  const mail = await openRequest(page)
  await mail.getByRole("button", { name: "受け入れる" }).click()
  await page.getByRole("dialog", { name: JOINED }).getByRole("button", { name: "受け入れる" }).click()
  await (await fromMenu(page, "左サイドパネルを開く")).click()
  await page
    .getByRole("complementary", { name: "左サイドパネル" })
    .getByRole("button", { name: REQUEST })
    .first()
    .click()
  await expect(page.getByRole("dialog", { name: REQUEST }).getByRole("button")).toHaveText(["閉じる"])
})

test("生きている参加者と同じ名前は、受け入れのダイアログでその場で断る", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const first = await join(page, "e2e-link-5", "同じ名前", "", "S-e2e-5")
  await openRequest(page).then(d => d.getByRole("button", { name: "受け入れる" }).click())
  await page.getByRole("dialog", { name: JOINED }).getByRole("button", { name: "受け入れる" }).click()
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

test("キャンセルは何も変えず、参加要求は保留のまま郵便から受け入れ直せる", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const made = await join(page, "e2e-link-7", "x")
  await openRequest(page).then(d => d.getByRole("button", { name: "受け入れる" }).click())
  await page.getByRole("dialog", { name: JOINED }).getByRole("button", { name: "キャンセル" }).click()
  const body = await (await page.request.get("/api/data", { headers: aiAuth() })).json()
  expect(body.participants).toMatchObject([{ id: made.participant, state: "requested" }])
})

// 受け入れの画面で名前を決めて、参加者を受け入れる
async function acceptAs(page: Page, name: string) {
  await openRequest(page).then(d => d.getByRole("button", { name: "受け入れる" }).click())
  const dialog = page.getByRole("dialog", { name: JOINED })
  await dialog.getByRole("textbox", { name: "ワークルーム名" }).fill(name)
  await dialog.getByRole("button", { name: "受け入れる" }).click()
  await expect(dialog).toHaveCount(0)
}

// 最後の（新しい）参加要求の郵便を開き、受け入れるを押して受け入れのダイアログを開く
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

  const body = await (await page.request.get("/api/data", { headers: aiAuth() })).json()
  expect(body.participants).toMatchObject([
    { id: next.participant, state: "joined", workroom: "ひよこ", sessionName: "新" },
  ])
  await (await fromMenu(page, "コントロールセンター")).click()
  await expect(page.locator(`[data-participant="${next.participant}"]`)).toContainText("ひよこ")
  await expect(page.locator(`[data-participant="${old.participant}"]`)).toHaveCount(0)
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
  await expect(dialog).toContainText("この名前の、静かな参加者がいます")
  await dialog.getByRole("radio", { name: "文鳥", exact: true }).check({ force: true })
  await dialog.getByRole("button", { name: "受け入れる" }).click()
  await expect(dialog).toContainText("ひよこ を引き継ぎますか。前のを破棄して新しく始めますか")
  await dialog.getByRole("button", { name: "前のを破棄して新しく始める" }).click()
  await expect(dialog).toHaveCount(0)

  const body = await (await page.request.get("/api/data", { headers: aiAuth() })).json()
  expect(body.participants).toMatchObject([
    { id: next.participant, state: "joined", workroom: "ひよこ", bird: "buncho" },
  ])
  expect(body.participants.some((p: { id: string }) => p.id === old.participant)).toBe(false)
})

test("頼まれた名前の参加要求を断ると、元の参加者はそのまま残る", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const old = await join(page, "e2e-link-10", "旧")
  await acceptAs(page, "ひよこ")
  await join(page, "e2e-link-11", "新", "ひよこ")
  await page.getByRole("button", { name: REQUEST }).last().click()
  await page.getByRole("dialog", { name: REQUEST }).getByRole("button", { name: "断る" }).click()
  const body = await (await page.request.get("/api/data", { headers: aiAuth() })).json()
  expect(body.participants).toMatchObject([{ id: old.participant, state: "joined", workroom: "ひよこ" }])
})

test("生きている参加者のワークルームは引き継げない。断られ、郵便も出ない", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const old = await join(page, "e2e-link-12", "旧", "", "S-e2e-12")
  await acceptAs(page, "ひよこ")
  await call(page, old.participant)
  const refused = await join(page, "e2e-link-13", "新", "ひよこ")
  expect(refused).toMatchObject({ ok: false, reason: "workroom-in-use" })
  const body = await (await page.request.get("/api/data", { headers: aiAuth() })).json()
  expect(body.participants).toHaveLength(1)
  expect(body.mailbox).toHaveLength(1) // 最初の郵便だけ
})
