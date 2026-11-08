// 参加: AI が join で参加を頼むと、参加要求の郵便が届く。郵便のダイアログで断る・受け入れるを選べる。
// 受け入れるは、ワークルームの名前・鳥・配色を決めるダイアログを開き、決めるとコントロールセンターの参加者リストに出る。断ると何も残さず、AI の次の呼び出しで断られたと分かる
import { aiAuth, BOOK_SCREEN_URL, expect, type Page, test } from "./fixtures"
import { fromMenu } from "./helpers/stage-menu"

const JOINED = "ワークルームに入れます"
const REQUEST = "AI エージェントから参加要求が届きました"

async function join(page: Page, link: string, sessionName = "") {
  const res = await page.request.post("/api/ai/join", {
    headers: aiAuth(),
    data: { ai: "claude", model: "opus-5", env: "wsl", sessionName, link, sessionId: "", projects: ["default"] },
  })
  return (await res.json()) as { ok: boolean; participant: string }
}

// この参加者の id で AI の口を呼ぶ（最後に呼ばれた時刻が進み、受け入れた直後なら参加の知らせが返る）
const call = (page: Page, participant: string) =>
  page.request.get("/api/ai/books?projects=default", {
    headers: { ...aiAuth(), "X-Matomezu-Participant": participant },
  })

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
  // センターの参加者リストに出る（呼ばれるまでは静か）
  await (await fromMenu(page, "コントロールセンター")).click()
  const row = page.locator(`[data-participant="${made.participant}"]`)
  await expect(row).toContainText("ひよこ")
  await expect(row).toContainText("claude / opus-5 / wsl")
  await expect(row).toContainText("静か")
  // 呼ばれると生きている
  await call(page, made.participant)
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
  const first = await join(page, "e2e-link-5", "同じ名前")
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
