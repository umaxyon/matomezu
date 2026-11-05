// 伝言一覧: フッタメニューのボタンで左ドロワーを開くと、開いているブックの伝言とマークがページごとに、新しい順に並ぶ。
// 伝言の行を押すと左ドロワーが閉じて、その伝言が右サイドパネルに出る。マークの行は付けた物へ移るだけ。取消で消える。AI が読むと既読になる
import { aiAuth, expect, type Page, test } from "./fixtures"
import { panel, writeNote } from "./helpers/note"
import { addBox, items } from "./helpers/paper"
import { fromMenu } from "./helpers/stage-menu"

const drawer = (page: Page) => page.getByRole("complementary", { name: "左ドロワー" })

async function openDrawer(page: Page) {
  await (await fromMenu(page, "左ドロワーを開く")).click()
  await expect(drawer(page)).toBeVisible()
}

test("左ドロワーの伝言一覧に、伝言とマークが新しい順に並ぶ。伝言の行を押すと閉じて右サイドパネルに出る。マークの行は物へ移るだけ。取消は確かめてから消える。Esc で閉じる", async ({
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

  await openDrawer(page)
  await expect(drawer(page).getByRole("tab", { name: "伝言一覧" })).toHaveAttribute("aria-selected", "true")
  const rows = drawer(page).getByRole("listitem")
  // 新しい順（後から付けたマークが上）。マークは付けた物の名前を出す
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText("二")
  await expect(rows.nth(1)).toContainText("一つ目を見て")
  await page.keyboard.press("Escape")
  await expect(drawer(page)).toHaveCount(0)

  // 伝言の行を押すと、左ドロワーが閉じて右サイドパネルに出る
  await openDrawer(page)
  await rows.nth(1).getByRole("button").first().click()
  await expect(drawer(page)).toHaveCount(0)
  await expect(panel(page).getByLabel("伝言", { exact: true })).toHaveValue("一つ目を見て")
  await page.keyboard.press("Escape")
  await expect(panel(page)).toHaveCount(0)

  // マークの行を押すと、左ドロワーが閉じるだけ（右サイドパネルは出ない）
  await openDrawer(page)
  await rows.nth(0).getByRole("button").first().click()
  await expect(drawer(page)).toHaveCount(0)
  await expect(panel(page)).toHaveCount(0)

  // 取消で消える。外を押すと閉じる
  await openDrawer(page)
  // 取消は確かめてから消す（やめるなら消さない）
  await drawer(page).getByRole("button", { name: "一つ目を見てを取り消す" }).click()
  const ask = drawer(page).getByRole("group", { name: "取り消しますか？" })
  await ask.getByRole("button", { name: "やめる" }).click()
  await expect(rows).toHaveCount(2)
  await drawer(page).getByRole("button", { name: "一つ目を見てを取り消す" }).click()
  await ask.getByRole("button", { name: "取消" }).click()
  await expect(rows).toHaveCount(1)
  await expect(page.getByRole("button", { name: "伝言を開く" })).toHaveCount(0)
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  await page.mouse.click(paper.x + paper.width - 40, paper.y + 400)
  await expect(drawer(page)).toHaveCount(0)
})

test("AI が伝言を読むと、上からマーキーが下りて「AIが伝言を読みました」と流れ、伝言一覧の行が既読になる", async ({
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
  await openDrawer(page)
  const row = drawer(page).getByRole("listitem")
  await expect(row).toContainText("読んで")
  await expect(row).not.toContainText("既読")
  const note = (
    (await (await page.request.get(`/api/ai/books/${book}`, { headers: ai })).json()).annotations as { id: string }[]
  )[0]!.id
  expect(await perform({ action: "@matomezu/base:note-read", args: { note }, on: { book } })).toMatchObject({
    ok: true,
  })
  await expect(page.getByRole("status").filter({ hasText: "AIが伝言を読みました" })).toBeVisible()
  await expect(row).toContainText("既読")
  // 流し終えたら消える
  await expect(page.getByRole("status").filter({ hasText: "AIが伝言を読みました" })).toHaveCount(0)
})

test("開いているブックが替わると、左ドロワーは閉じる", async ({ page }) => {
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
  await openDrawer(page)
  await page.request.post("/api/ai/show", { headers: ai, data: { book: made.result.book } })
  await expect(drawer(page)).toHaveCount(0)
})
