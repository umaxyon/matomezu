// チケットスクリーン: URL で開く（開いているチケットの id が画面の場所に入る）。番号・名前・タグ・担当・履歴（起票の行つき・質問の吹き出し）を見せ、名前・本文・優先度を直すと反映し、
// 読み直しても残り、戻るで閉じる。ロック中は直せず、AI の上書きは直している間だけ断られる
import { aiAuth, CONTROL_CENTER_URL, expect, joinedAiAuth, type Page, test } from "./fixtures"

const NOW = "2026-11-12T00:00:00.000Z"
const TICKET = "@matomezu/taskboard:ticket"
const open = (ticket: string) =>
  `${CONTROL_CENTER_URL}&w=${encodeURIComponent(
    JSON.stringify({
      "@matomezu/base:open-screen": { screen: "@matomezu/taskboard:ticket-screen", props: { ticket } },
    }),
  )}`

async function perform(page: Page, action: string, args: object, on?: object) {
  const res = await page.request.post("/api/perform", {
    data: { action, args, ...(on ? { on } : {}), lang: "ja", now: NOW },
  })
  return (await res.json()) as { ok: boolean; result?: Record<string, string> }
}

// プロジェクトを作ってチケットを足し、履歴を書く
async function setup(page: Page) {
  const made = await perform(page, "@matomezu/taskboard:project-add", { prefix: "T-" })
  const project = made.result?.project ?? ""
  const added = await perform(page, "@matomezu/taskboard:ticket-add", {
    project,
    name: "ログイン画面を直す",
    body: "# 本文\n\nはじめの文",
  })
  const ticket = added.result?.ticket ?? ""
  await perform(page, "@matomezu/taskboard:ticket-history-add", {
    ticket,
    topic: "@matomezu/taskboard:topic-status",
    text: "調べています",
  })
  await perform(page, "@matomezu/taskboard:ticket-history-add", {
    ticket,
    topic: "@matomezu/taskboard:topic-question",
    text: "どちらの画面ですか",
  })
  return { project, ticket }
}

test("URL でチケットを開くと、チケットの枠と本文が右から出る。履歴の質問を押すと質問の枠が出て、閉じられる", async ({
  page,
}) => {
  await page.goto(CONTROL_CENTER_URL)
  const { ticket } = await setup(page)
  await page.goto(open(ticket))
  const screen = page.getByRole("region", { name: "チケット" }).first()
  await expect(screen.getByRole("heading", { name: "ログイン画面を直す" })).toBeVisible()
  await expect(screen.getByText("T-001")).toBeVisible()
  await expect(screen.getByText("起票日時")).toBeVisible()
  // 履歴: 起票の行・状況・質問（吹き出し）
  await expect(screen.getByText("チケットを起票しました")).toBeVisible()
  await expect(screen.getByText("調べています")).toBeVisible()
  await screen.getByRole("button", { name: "どちらの画面ですか" }).click()
  const question = page.getByRole("region", { name: "質問" })
  await expect(question.getByText("どちらの画面ですか").last()).toBeVisible()
  await question.getByRole("button", { name: "閉じる" }).click()
  await expect(page.getByRole("region", { name: "質問", includeHidden: false })).toHaveCount(0)
})

test("名前・優先度・本文は直したそばから反映され、読み直しても残る。戻るで閉じる", async ({ page }) => {
  await page.goto(CONTROL_CENTER_URL)
  const { ticket } = await setup(page)
  await page.goto(open(ticket))
  const screen = page.getByRole("region", { name: "チケット" }).first()
  await screen.getByRole("button", { name: "名前を編集" }).click()
  const name = screen.getByRole("textbox", { name: "チケットの名前" })
  await name.fill("ログイン画面を直した")
  await name.press("Enter")
  await expect(screen.getByRole("heading", { name: "ログイン画面を直した" })).toBeVisible()
  // 優先度のつまみ: キーで 1 段上げる
  const slider = screen.getByRole("slider")
  await slider.focus()
  await slider.press("ArrowRight")
  await expect(slider).toHaveAttribute("aria-valuetext", "大")
  // 本文を編集に切り替えて書く
  await page.getByRole("button", { name: "編集", exact: true }).click()
  await page.getByRole("textbox", { name: "本文（マークダウン）" }).fill("書き直した本文")
  await expect
    .poll(async () => {
      const body = await (await page.request.get("/api/data", { headers: aiAuth() })).json()
      const t = (Object.values(body.records[TICKET] ?? {}) as { name: string; priority: string; body: string }[])[0]
      return t ? [t.name, t.priority, t.body] : []
    })
    .toEqual(["ログイン画面を直した", "high", "書き直した本文"])
  await page.reload()
  await expect(
    page.getByRole("region", { name: "チケット" }).first().getByRole("heading", { name: "ログイン画面を直した" }),
  ).toBeVisible()
  await page.goBack()
  await expect(page.getByRole("heading", { name: "ログイン画面を直した" })).toHaveCount(0)
})

test("ロック中のチケットは直せず、帯のロックで外すと直せる。無いチケットは「ありません」と出る", async ({ page }) => {
  await page.goto(CONTROL_CENTER_URL)
  const { ticket } = await setup(page)
  await perform(page, "@matomezu/taskboard:ticket-lock", {}, { record: ticket })
  await page.goto(open(ticket))
  const screen = page.getByRole("region", { name: "チケット" }).first()
  await expect(screen.getByRole("button", { name: "名前を編集" })).toHaveCount(0)
  await expect(screen.getByRole("slider")).toBeDisabled()
  await screen.getByRole("button", { name: "チケットのロックを外す" }).click()
  await expect(screen.getByRole("button", { name: "名前を編集" })).toBeVisible()
  await page.goto(open("nothing"))
  await expect(page.getByText("このチケットはありません")).toBeVisible()
})

test("名前を直している間は、AI がそのチケットを変えると断られ（being-edited）、確定すると変えられる", async ({
  page,
}) => {
  await page.goto(CONTROL_CENTER_URL)
  const { ticket } = await setup(page)
  await page.goto(open(ticket))
  const screen = page.getByRole("region", { name: "チケット" }).first()
  const ai = await joinedAiAuth()
  const rename = async () =>
    (
      await page.request.post("/api/ai/perform", {
        headers: ai,
        data: { action: "@matomezu/taskboard:ticket-update", args: { priority: "high" }, on: { record: ticket } },
      })
    ).json()
  await screen.getByRole("button", { name: "名前を編集" }).click()
  await expect.poll(async () => (await rename()).reason).toBe("being-edited")
  await screen.getByRole("textbox", { name: "チケットの名前" }).press("Escape")
  await expect.poll(async () => (await rename()).ok).toBe(true)
})
