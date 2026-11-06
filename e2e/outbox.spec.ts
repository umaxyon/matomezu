// 送信トレイ: フッタメニューのボタンで左サイドパネルを開くと、開いているブックの伝言とマークがページごとに、新しい順に並ぶ。
// 伝言の行を押すと左サイドパネルが閉じて、その伝言が右サイドパネルに出る。マークの行は付けた物へ移るだけ。取消で消える。AI が読むと既読になる
import { aiAuth, expect, test } from "./fixtures"
import { panel, writeNote } from "./helpers/note"
import { leftPanel, openOutbox } from "./helpers/outbox"
import { addBox, items } from "./helpers/paper"
import { fromMenu } from "./helpers/stage-menu"

test("左サイドパネルの送信トレイに、伝言とマークが新しい順に並ぶ。伝言の行を押すと閉じて右サイドパネルに出る。マークの行は物へ移るだけ。取消は確かめてから消える。Esc で閉じる", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  await addBox(page, 200, 150, "一")
  await addBox(page, 500, 150, "二")
  await writeNote(page, items(page).filter({ hasText: "一" }), "一つ目を見て")
  const two = items(page).filter({ hasText: "二" })
  await two.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに示す" }).click()
  await page.getByRole("group", { name: "マークを付ける" }).getByRole("button", { name: "インコ" }).click()

  await openOutbox(page)
  await expect(leftPanel(page).getByRole("tab", { name: "送信トレイ" })).toHaveAttribute("aria-selected", "true")
  const rows = leftPanel(page).getByRole("listitem")
  // 新しい順（後から付けたマークが上）。マークは付けた物の名前を出す
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText("二")
  await expect(rows.nth(1)).toContainText("一つ目を見て")
  await page.keyboard.press("Escape")
  await expect(leftPanel(page)).toHaveCount(0)

  // 伝言の行を押すと、左サイドパネルが閉じて右サイドパネルに出る
  await openOutbox(page)
  await rows.nth(1).getByRole("button").first().click()
  await expect(leftPanel(page)).toHaveCount(0)
  await expect(panel(page).getByLabel("伝言", { exact: true })).toHaveValue("一つ目を見て")
  await page.keyboard.press("Escape")
  await expect(panel(page)).toHaveCount(0)

  // マークの行を押すと、左サイドパネルが閉じるだけ（右サイドパネルは出ない）
  await openOutbox(page)
  await rows.nth(0).getByRole("button").first().click()
  await expect(leftPanel(page)).toHaveCount(0)
  await expect(panel(page)).toHaveCount(0)

  // 取消で消える。外を押すと閉じる
  await openOutbox(page)
  // 取消は確かめてから消す（やめるなら消さない）
  await leftPanel(page).getByRole("button", { name: "一つ目を見てを取り消す" }).click()
  const ask = leftPanel(page).getByRole("group", { name: "取り消しますか？" })
  await ask.getByRole("button", { name: "やめる" }).click()
  await expect(rows).toHaveCount(2)
  await leftPanel(page).getByRole("button", { name: "一つ目を見てを取り消す" }).click()
  await ask.getByRole("button", { name: "取消" }).click()
  await expect(rows).toHaveCount(1)
  await expect(page.getByRole("button", { name: "伝言を開く" })).toHaveCount(0)
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  await page.mouse.click(paper.x + paper.width - 40, paper.y + 400)
  await expect(leftPanel(page)).toHaveCount(0)
})

test("AI が伝言を読むと、上からマーキーが下りて「AIが伝言を読みました」と流れ、送信トレイの行が既読になり、吹き出しが緑の丸のチェックに替わる", async ({
  page,
}) => {
  const ai = aiAuth()
  const perform = async (data: object) => (await page.request.post("/api/ai/perform", { headers: ai, data })).json()
  await page.goto("/")
  await page.bringToFront()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toHaveProperty("stage")
  const { book } = (await (await page.request.get("/api/ai/view", { headers: ai })).json()) as { book: string }
  await addBox(page, 200, 150, "一")
  await writeNote(page, items(page).filter({ hasText: "一" }), "読んで")
  await openOutbox(page)
  const row = leftPanel(page).getByRole("listitem")
  await expect(row).toContainText("読んで")
  await expect(row).not.toContainText("既読")
  const bubble = page.getByRole("button", { name: "伝言を開く" })
  await expect(bubble).toHaveText("読んで")
  await expect(bubble).not.toHaveAttribute("data-read", "true")
  const note = (
    (await (await page.request.get(`/api/ai/books/${book}`, { headers: ai })).json()).annotations as { id: string }[]
  )[0]!.id
  expect(await perform({ action: "@matomezu/base:note-read", args: { note }, on: { book } })).toMatchObject({
    ok: true,
  })
  await expect(page.getByRole("status").filter({ hasText: "AIが伝言を読みました" })).toBeVisible()
  await expect(row).toContainText("既読")
  // 吹き出しは、読んだ印の緑の丸のチェックに替わる（文は出さない）
  await expect(bubble).toHaveAttribute("data-read", "true")
  await expect(bubble.locator("[data-read-check]")).toBeVisible()
  await expect(bubble).toHaveText("")
  // 流し終えたら消える
  await expect(page.getByRole("status").filter({ hasText: "AIが伝言を読みました" })).toHaveCount(0)
})

test("開いているブックが替わると、左サイドパネルは閉じる", async ({ page }) => {
  const ai = aiAuth()
  await page.goto("/")
  await page.bringToFront()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toHaveProperty("stage")
  const made = await (
    await page.request.post("/api/ai/perform", {
      headers: ai,
      data: { action: "@matomezu/base:book-create", args: { type: "@matomezu/drawing:drawing", title: "ほかの" } },
    })
  ).json()
  await openOutbox(page)
  await page.request.post("/api/ai/show", { headers: ai, data: { book: made.result.book } })
  await expect(leftPanel(page)).toHaveCount(0)
})

test("分けているとき右のステージで左サイドパネルを開くと、窓の左に出て、右のステージが窓いっぱいに広がり、左のステージの幅は 0。閉じると分けた幅に戻る", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  await (await fromMenu(page, "画面を分割")).click()
  const stages = page.locator("[data-stage]")
  await expect(stages).toHaveCount(2)
  const before = (await stages.nth(1).boundingBox())!
  await (await fromMenu(page, "左サイドパネルを開く", 1)).click()
  await expect(leftPanel(page)).toBeVisible()
  const side = (await leftPanel(page).boundingBox())!
  expect(side.x).toBe(0)
  expect(side.width).toBe(320)
  await expect.poll(async () => (await stages.nth(0).boundingBox())?.width ?? 0).toBe(0)
  const wide = (await stages.nth(1).boundingBox())!
  expect(Math.abs(wide.x - 320)).toBeLessThan(2)
  expect(wide.width).toBeGreaterThan(before.width + 100)
  await page.keyboard.press("Escape")
  await expect(leftPanel(page)).toHaveCount(0)
  await expect.poll(async () => Math.round((await stages.nth(1).boundingBox())!.width)).toBe(Math.round(before.width))
})

test("右サイドパネルを開いているステージで左サイドパネルも開くと、両方出る。Esc は左サイドパネルだけを閉じる", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  await addBox(page, 200, 150, "一")
  await writeNote(page, items(page).filter({ hasText: "一" }), "見て")
  await (await fromMenu(page, "画面を分割")).click()
  await page.getByRole("button", { name: "伝言を開く" }).first().click()
  await expect(panel(page)).toBeVisible()
  await (await fromMenu(page, "左サイドパネルを開く", 0)).click()
  await expect(leftPanel(page)).toBeVisible()
  await expect(panel(page)).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(leftPanel(page)).toHaveCount(0)
  await expect(panel(page)).toBeVisible()
})
