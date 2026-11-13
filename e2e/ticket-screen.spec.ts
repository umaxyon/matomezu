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

// プロジェクトを作ってチケットを足し、チケット履歴を書く
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

test("URL でチケットを開くと、チケットの枠と本文が右から出る。チケット履歴の質問を押すと質問の枠が出て、閉じられる", async ({
  page,
}) => {
  await page.goto(CONTROL_CENTER_URL)
  const { ticket } = await setup(page)
  await page.goto(open(ticket))
  const screen = page.getByRole("region", { name: "チケット" }).first()
  await expect(screen.getByRole("heading", { name: "ログイン画面を直す" })).toBeVisible()
  await expect(screen.getByText("T-001")).toBeVisible()
  await expect(screen.getByText("起票日時")).toBeVisible()
  // チケットスクリーンは、下の行（止まり木）を残して、窓の高さいっぱいに広がる
  const box = await screen.boundingBox()
  const size = page.viewportSize()
  expect(box?.height ?? 0).toBeGreaterThan((size?.height ?? 0) - 60)
  await expect(page.getByRole("button", { name: "コントロールセンター" })).toBeVisible()
  // 閉じて右へ出ている質問の枠が、チケットスクリーンを包むスクロールの枠に横スクロールを作らない
  const wide = await screen.evaluate(el => {
    for (let e = el.parentElement; e; e = e.parentElement) {
      const x = getComputedStyle(e).overflowX
      if ((x === "auto" || x === "scroll") && e.scrollWidth > e.clientWidth + 1) return true
    }
    return false
  })
  expect(wide).toBe(false)
  // チケット履歴: 起票の行・状況・質問（吹き出し）
  await expect(screen.getByText("チケットを起票しました")).toBeVisible()
  await expect(screen.getByText("調べています")).toBeVisible()
  await screen.getByRole("button", { name: "どちらの画面ですか" }).click()
  const question = page.getByRole("region", { name: "質問" })
  await expect(question.getByText("どちらの画面ですか").last()).toBeVisible()
  await question.getByRole("button", { name: "閉じる" }).click()
  await expect(page.getByRole("region", { name: "質問", includeHidden: false })).toHaveCount(0)
  // 質問だけが吹き出し（押せる）で、状況の行は押せない
  await expect(screen.getByRole("button", { name: "調べています" })).toHaveCount(0)
  // 左上の戻るで閉じる
  await screen.getByRole("button", { name: "戻る" }).click()
  await expect(screen.getByRole("heading", { name: "ログイン画面を直す" })).toBeHidden()
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
  await screen.getByRole("button", { name: "編集", exact: true }).click()
  await screen.getByRole("textbox", { name: "本文（マークダウン）" }).fill("書き直した本文")
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

test("本文を直してチケットスクリーンから離れると、チケット履歴に「本文を更新しました」の行が 1 行だけ足される。直さずに離れたときは足されない", async ({
  page,
}) => {
  await page.goto(CONTROL_CENTER_URL)
  const { ticket } = await setup(page)
  const lines = async () => {
    const body = await (await page.request.get("/api/data", { headers: aiAuth() })).json()
    return (
      Object.values(body.records["@matomezu/taskboard:ticket-history"] ?? {}) as {
        topic: string
        text: string
        by: { kind: string }
      }[]
    ).filter(l => l.topic === "@matomezu/taskboard:topic-body")
  }
  // 本文を直さずに（優先度だけ変えて）開いて戻る: 足されない
  await page.goto(open(ticket))
  const screen = page.getByRole("region", { name: "チケット" }).first()
  await expect(screen.getByRole("button", { name: "本文", exact: true })).toBeVisible()
  const slider = screen.getByRole("slider")
  await slider.focus()
  await slider.press("ArrowRight")
  await expect(slider).toHaveAttribute("aria-valuetext", "大")
  await screen.getByRole("button", { name: "戻る" }).click()
  await expect(screen.getByRole("heading", { name: "ログイン画面を直す" })).toBeHidden()
  expect(await lines()).toHaveLength(0)
  // 本文を何度か打って戻る: 1 行
  await page.goto(open(ticket))
  const again = page.getByRole("region", { name: "チケット" }).first()
  await again.getByRole("button", { name: "編集", exact: true }).click()
  const source = again.getByRole("textbox", { name: "本文（マークダウン）" })
  await source.fill("一度目")
  await source.fill("二度目")
  await again.getByRole("button", { name: "戻る" }).click()
  await expect.poll(async () => (await lines()).map(l => [l.text, l.by.kind])).toEqual([["", "user"]])
  // チケット履歴の一覧には、題と文が出る
  await page.goto(open(ticket))
  await expect(page.getByRole("region", { name: "チケット" }).first().getByText("本文を更新しました")).toBeVisible()
})

test("ボードのカードを押すとチケットスクリーンが開き、戻るで閉じる。もう一度押すと、また開く", async ({ page }) => {
  await page.goto(CONTROL_CENTER_URL)
  // レーンに入れたチケットが、ボードのカードになる（未分類のチケットは、レーンには出ない）
  const made = await page.request.post("/api/perform", {
    data: { action: "@matomezu/taskboard:project-add", args: { prefix: "T-" }, lang: "ja", now: NOW },
  })
  const { result } = (await made.json()) as { result: { project: string; lanes: { id: string }[] } }
  const added = await perform(page, "@matomezu/taskboard:ticket-add", {
    project: result.project,
    name: "ログイン画面を直す",
    lane: result.lanes[0]?.id ?? "",
  })
  const ticket = added.result?.ticket ?? ""
  const card = page.locator(`[data-card="${ticket}"]`)
  await card.click()
  const screen = page.getByRole("region", { name: "チケット" }).first()
  await expect(screen.getByRole("heading", { name: "ログイン画面を直す" })).toBeVisible()
  await screen.getByRole("button", { name: "戻る" }).click()
  await expect(page.getByRole("heading", { name: "ログイン画面を直す" })).toHaveCount(0)
  await card.click()
  await expect(
    page.getByRole("region", { name: "チケット" }).first().getByRole("heading", { name: "ログイン画面を直す" }),
  ).toBeVisible()
})

test("タグは「＋」の一覧から付け、バッヂの × で外す。付いたタグはプロジェクトの順に並び、ロック中は付け外しできない", async ({
  page,
}) => {
  await page.goto(CONTROL_CENTER_URL)
  const { ticket } = await setup(page)
  await page.goto(open(ticket))
  const screen = page.getByRole("region", { name: "チケット" }).first()
  const add = screen.getByRole("button", { name: "タグを付ける" })
  const picker = screen.getByRole("dialog", { name: "タグを付ける" })
  const badges = screen.locator("[data-tag]")
  // バグを付けてからタスクを付けても、並びはプロジェクトの順（タスク・バグ）
  await add.click()
  await picker.getByRole("button", { name: "バグ" }).click()
  await expect(picker).toHaveCount(0)
  await add.click()
  await picker.getByRole("button", { name: "タスク" }).click()
  await expect(badges).toHaveText(["タスク", "バグ"])
  // 全部付くと「＋」は出ない
  await expect(add).toHaveCount(0)
  await screen.getByRole("button", { name: "タグ「タスク」を外す" }).click()
  await expect(badges).toHaveText(["バグ"])
  // ロック中は × も「＋」も出ない
  await screen.getByRole("button", { name: "チケットをロックする" }).click()
  await expect(screen.getByRole("button", { name: "タグ「バグ」を外す" })).toHaveCount(0)
  await expect(add).toHaveCount(0)
})

test("カードのタグは、M なら 1 行・L なら 3 行に入るだけ並び、入らない分は「+N」になる", async ({ page }) => {
  await page.goto(CONTROL_CENTER_URL)
  const made = await page.request.post("/api/perform", {
    data: { action: "@matomezu/taskboard:project-add", args: { prefix: "T-" }, lang: "ja", now: NOW },
  })
  const { result } = (await made.json()) as { result: { project: string; lanes: { id: string }[] } }
  const names = ["調べ物", "見直し", "画面", "サーバー", "急ぎ", "あとで", "相談", "文書"]
  const tags = names.map(name => ({ name, color: "primary", enabled: true, prompt: "" }))
  expect((await perform(page, "@matomezu/taskboard:project-update", { tags }, { record: result.project })).ok).toBe(
    true,
  )
  const added = await perform(page, "@matomezu/taskboard:ticket-add", {
    project: result.project,
    name: "タグの多いチケット",
    lane: result.lanes[0]?.id ?? "",
    tags: names,
  })
  const card = page.locator(`[data-card="${added.result?.ticket ?? ""}"]`)
  const shown = card.locator("[data-tag]")
  const more = card.locator("[data-more]")
  // M: 1 行に入るだけ。残りは +N で、並べた数と足すと全部
  await expect(more).toBeVisible()
  const inOne = await shown.count()
  expect(inOne).toBeGreaterThan(0)
  await expect(more).toHaveText(`+${names.length - inOne}`)
  // L: 3 行まで並ぶので、M より多く並ぶ
  await perform(page, "@matomezu/taskboard:project-update", { cardSize: "large" }, { record: result.project })
  await expect(card).toHaveAttribute("data-size", "large")
  await expect.poll(() => shown.count()).toBeGreaterThan(inOne)
})
