// ワーカーブックを開く口: 参加者一覧の行の、本を頭に付けたチケット番号の行と、書庫のワーカーブックの行と、チケットのナレッジの「作業ブック」。
// ページが無い間は押せない。番号の行はクリックで「開く／分割で開く」を出し、分割で開くとコントロールセンターの下にブックスクリーンが入る。ダブルクリックは全画面で開く。
// 窓が低いと、番号の行のクリックで全画面で開く。書庫の行はクリックで 2 択を出す。「作業ブック」はクリックで右を本文からページの一覧に替え（もう一度押しても閉じない）、ダブルクリックで全画面で開く
import { aiAuth, CONTROL_CENTER_URL, expect, type Page, test } from "./fixtures"
import { aiPerform } from "./helpers/ai"
import { onPaper } from "./helpers/paper"

const NOW = "2026-11-23T00:00:00.000Z"

async function perform(page: Page, action: string, args: object, on?: object) {
  const res = await page.request.post("/api/perform", {
    data: { actions: [{ action, args, ...(on ? { on } : {}), lang: "ja", now: NOW }] },
  })
  return (await res.json()) as { ok: boolean; result?: Record<string, string> }
}

// AI を 1 人参加させ、ワークルーム name に受け入れる（セッション id を運ぶ AI なので、受け入れた直後から準備中でない）。AI の入口に付けるヘッダを返す
async function member(page: Page, name: string) {
  const joined = (await (
    await page.request.post("/api/ai/join", {
      headers: aiAuth(),
      data: {
        ai: "claude",
        model: "opus-5",
        env: "wsl-linux",
        sessionName: name,
        link: `link-${name}`,
        sessionId: `s-${name}`,
      },
    })
  ).json()) as { participant: string }
  const made = await perform(page, "@matomezu/base:workroom-add", { name, bird: "buncho" })
  await perform(
    page,
    "@matomezu/base:participant-accept",
    { workroom: made.result?.workroom ?? "" },
    { record: joined.participant },
  )
  return { ...aiAuth(), "X-Matomezu-Participant": joined.participant }
}

// 画面の動き（スクリーンや枠が入ってくるなど）が止まるのを待つ（見た目を撮る前）
const settled = (page: Page) =>
  expect.poll(() => page.evaluate(() => document.getAnimations().filter(a => a.playState === "running").length)).toBe(0)

// チケット ticket のチケットスクリーンを開いた場所の URL（後ろにコントロールセンター）
const ticketUrl = (ticket: string) =>
  `/?sc=${encodeURIComponent(
    JSON.stringify({
      s: [
        { i: "c1", d: "@matomezu/control-center:screen" },
        { i: "c3", d: "@matomezu/taskboard:ticket-screen", p: { ticket } },
      ],
      o: ["c1", "c3"],
    }),
  )}`

test("チケットのワーカーブックは、ページが足されると参加者一覧の番号の行と「作業ブック」から開ける", async ({
  page,
}) => {
  await page.goto(CONTROL_CENTER_URL)
  const made = await perform(page, "@matomezu/taskboard:project-add", { prefix: "W-" })
  const added = await perform(page, "@matomezu/taskboard:ticket-add", {
    project: made.result?.project ?? "",
    name: "資料を見る口",
    body: "",
  })
  const ticket = added.result?.ticket ?? ""
  const ai = await member(page, "しらべ")
  const started = await aiPerform(
    page,
    { action: "@matomezu/taskboard:ticket-start", args: {}, on: { record: ticket } },
    ai,
  )
  expect(started, JSON.stringify(started)).toMatchObject({ ok: true })

  // ページが無い間は、番号の行を押せない
  const row = page.locator("[data-workroom]").filter({ hasText: "しらべ" })
  const line = row.locator("[data-current-line]")
  await expect(line).toContainText("W-")
  await expect(line).toBeDisabled()

  const page1 = await aiPerform(
    page,
    {
      action: "@matomezu/base:worker-page-add",
      args: { type: "@matomezu/drawing:drawing", title: "作業のメモ" },
    },
    ai,
  )
  expect(page1, JSON.stringify(page1)).toMatchObject({ ok: true })
  await expect(line).toBeEnabled()

  // クリックで 2 択。分割で開くと、コントロールセンターの下にブックスクリーンが入る（参加者一覧は見えたまま）
  await line.click()
  await page.getByRole("menuitem", { name: "分割で開く" }).click()
  await expect(page.getByText("作業のメモ").first()).toBeVisible()
  await expect(line).toBeVisible()
  await settled(page)
  await page.screenshot({ path: "test-results/worker-book-split.png" })

  // チケットのナレッジの「作業ブック」: クリックで右にページの一覧、ダブルクリックで全画面で開く
  await page.goto(ticketUrl(ticket))
  const history = page.locator("[data-work-book]")
  await expect(history).toBeEnabled()
  await history.click()
  const list = page.getByRole("region", { name: "作業ブック" })
  await expect(list.locator("[data-worker-page]")).toHaveText("作業のメモ")
  await settled(page)
  await page.screenshot({ path: "test-results/worker-book-history.png" })
  await list.locator("[data-worker-page]").click()
  await expect(page.getByRole("menuitem", { name: "開く", exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  // ページの一覧に［閉じる］は無く、もう一度押しても閉じない。「本文」を押すと本文に入れ替わり、本文ももう一度押しても閉じない
  await expect(list.getByRole("button", { name: "閉じる" })).toHaveCount(0)
  await history.click()
  await expect(list).toHaveAttribute("data-open", "true")
  const body = page.getByRole("region", { name: "本文", exact: true })
  await page.getByRole("button", { name: "本文", exact: true }).click()
  await expect(body).toHaveAttribute("data-open", "true")
  await expect(list).toHaveAttribute("data-open", "false")
  await page.getByRole("button", { name: "本文", exact: true }).click()
  await expect(body).toHaveAttribute("data-open", "true")
  await history.dblclick()
  await expect(page.locator("[data-work-book]")).toBeHidden()
  await expect(page.getByText("作業のメモ").first()).toBeVisible()
})

test("ワーカーブックは、番号の行のダブルクリックで全画面で開き、書庫の行のクリックで 2 択を出す。窓が低いと、番号の行のクリックで全画面で開く", async ({
  page,
}) => {
  await page.goto(CONTROL_CENTER_URL)
  // チケットの無い AI のページは、ワークルーム自身のワーカーブックに入る
  const ai = await member(page, "ひま")
  const added = await aiPerform(
    page,
    { action: "@matomezu/base:worker-page-add", args: { type: "@matomezu/drawing:drawing", title: "空きのメモ" } },
    ai,
  )
  expect(added, JSON.stringify(added)).toMatchObject({ ok: true })
  const line = page.locator("[data-workroom]").filter({ hasText: "ひま" }).locator("[data-current-line]")
  await expect(line).toContainText("（空き）")

  // ダブルクリックは 2 択を出さずに全画面で開く
  await line.dblclick()
  await expect(page.getByRole("menuitem", { name: "分割で開く" })).toHaveCount(0)
  await expect(line).toBeHidden()
  await expect(page.getByText("空きのメモ").first()).toBeVisible()

  // 書庫のワーカーブックの行: クリックで 2 択
  await page.goto(CONTROL_CENTER_URL)
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  await page.getByRole("list", { name: "書庫 の中身" }).getByRole("button", { name: "ワークルーム" }).dblclick()
  await page.getByRole("list", { name: "ワークルーム の中身" }).getByRole("button", { name: "ひま" }).dblclick()
  await page.getByRole("list", { name: "ひま の中身" }).getByRole("button").click()
  await expect(page.getByRole("menuitem", { name: "分割で開く" })).toBeVisible()
  await page.keyboard.press("Escape")

  // 窓が低い（分けて並べない）と、番号の行のクリックで 2 択を出さずに全画面で開く
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(CONTROL_CENTER_URL)
  await expect(line).toBeVisible()
  await line.click()
  await expect(line).toBeHidden()
  await expect(page.getByRole("menuitem", { name: "分割で開く" })).toHaveCount(0)
  await expect(page.getByText("空きのメモ").first()).toBeVisible()
})

test("書庫の検索は、チケットの番号と名前・ページの名前でワーカーブックの物を作業履歴に出す。クリックで 2 択、Enter で全画面で開く", async ({
  page,
}) => {
  await page.goto(CONTROL_CENTER_URL)
  const made = await perform(page, "@matomezu/taskboard:project-add", { prefix: "S-" })
  const added = await perform(page, "@matomezu/taskboard:ticket-add", {
    project: made.result?.project ?? "",
    name: "検索で見つける",
    body: "",
  })
  const ai = await member(page, "さがし")
  await aiPerform(
    page,
    { action: "@matomezu/taskboard:ticket-start", args: {}, on: { record: added.result?.ticket ?? "" } },
    ai,
  )
  const page1 = await aiPerform(
    page,
    { action: "@matomezu/base:worker-page-add", args: { type: "@matomezu/drawing:drawing", title: "見つける絵" } },
    ai,
  )
  expect(page1, JSON.stringify(page1)).toMatchObject({ ok: true })

  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  const field = page.getByRole("textbox", { name: "名前で検索" })
  const history = page.getByRole("list", { name: "作業履歴" })
  // チケットの名前に当たると、ブックの行は番号とチケットの名前。クリックで 2 択
  await field.fill("検索で見つける")
  await page.keyboard.press("Enter")
  await expect(page.getByRole("status")).toHaveText("「検索で見つける」を含む名前: 1 件")
  const book = history.getByRole("button", { name: /S-0001/ })
  await expect(book).toContainText("検索で見つける")
  await book.click()
  await expect(page.getByRole("menuitem", { name: "分割で開く" })).toBeVisible()
  await page.keyboard.press("Escape")

  // ページの名前に当たると、ページの行。Enter で全画面で開く
  await field.fill("見つける絵")
  await page.keyboard.press("Enter")
  const row = history.getByRole("button", { name: /見つける絵/ })
  await expect(row).toContainText("S-0001 検索で見つける")
  await row.focus()
  await page.keyboard.press("Enter")
  await expect(field).toBeHidden()
  await expect(page.getByText("見つける絵").first()).toBeVisible()
})

test("ワーカーブックの下の行は、名前の枠の中の名前の前に作業しているワークルームの鳥を出し、フォルダの絵は出さない。鳥を押すと書庫でその作業机を開いてワーカーブックを選ぶ。指になるのは鳥だけ", async ({
  page,
}) => {
  await page.goto(CONTROL_CENTER_URL)
  const ai = await member(page, "とり")
  const added = await aiPerform(
    page,
    { action: "@matomezu/base:worker-page-add", args: { type: "@matomezu/drawing:drawing", title: "鳥のメモ" } },
    ai,
  )
  expect(added, JSON.stringify(added)).toMatchObject({ ok: true })
  await page.locator("[data-workroom]").filter({ hasText: "とり" }).locator("[data-current-line]").dblclick()
  await expect(page.getByText("鳥のメモ").first()).toBeVisible()
  await expect(page.locator("[data-worker-birds]")).toHaveAttribute("title", "とり")
  await expect(page.locator("[data-book-name] [data-worker-birds]")).toHaveCount(1)
  await expect(page.getByRole("button", { name: /^置き場所/ })).toHaveCount(0)
  const birds = page.locator("[data-worker-birds]")
  const cursor = (l: typeof birds) => l.evaluate(e => getComputedStyle(e).cursor)
  expect(await cursor(birds)).toBe("pointer")
  expect(await cursor(page.locator("[data-book-name] button[aria-haspopup]"))).toBe("default")
  // 鳥の左（枠の左端の強調の線から）と右（名前との間）の余白はそろう
  const [frame, face, name] = await Promise.all(
    [page.locator("[data-book-name]"), birds, page.locator("[data-book-name] button[aria-haspopup]")].map(l =>
      l.boundingBox(),
    ),
  )
  expect(Math.abs(face!.x - (frame!.x + 3) - (name!.x - (face!.x + face!.width)))).toBeLessThanOrEqual(1)
  expect(Math.abs(face!.y + face!.height / 2 - (frame!.y + frame!.height / 2))).toBeLessThanOrEqual(1)
  await birds.click()
  const desk = page.getByRole("list", { name: "とり の中身" })
  await expect(desk.getByRole("button")).toHaveAttribute("aria-pressed", "true")
})

test("チケットのワーカーブックのページの名前を、チケットの番号で始まる名前に変えようとすると、断りをトーストに出し、ダイアログは開いたまま", async ({
  page,
}) => {
  await page.goto(CONTROL_CENTER_URL)
  const made = await perform(page, "@matomezu/taskboard:project-add", { prefix: "N-" })
  const added = await perform(page, "@matomezu/taskboard:ticket-add", {
    project: made.result?.project ?? "",
    name: "名前の写し",
    body: "",
  })
  const ai = await member(page, "なまえ")
  await aiPerform(
    page,
    { action: "@matomezu/taskboard:ticket-start", args: {}, on: { record: added.result?.ticket ?? "" } },
    ai,
  )
  const page1 = await aiPerform(
    page,
    { action: "@matomezu/base:worker-page-add", args: { type: "@matomezu/drawing:drawing", title: "メモ" } },
    ai,
  )
  expect(page1, JSON.stringify(page1)).toMatchObject({ ok: true })
  await page.locator("[data-workroom]").filter({ hasText: "なまえ" }).locator("[data-current-line]").dblclick()
  await expect(page.getByText("メモ").first()).toBeVisible()
  await settled(page)
  const empty = await onPaper(page, 300, 300)
  await page.mouse.click(empty.x, empty.y, { button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "ページの設定" }).click()
  const dialog = page.getByRole("dialog", { name: "ページの設定" })
  await dialog.getByLabel("名前").fill("N-0001 メモ")
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(page.getByText("ページ名をブック名で始めることは出来ません")).toBeVisible()
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("名前").fill("[N-0001] メモ")
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
})
