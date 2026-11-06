// 郵便: AI が手紙を送ると、フォーカスのある窓にマーキーが流れ、画面の上からしおりがぶら下がる。左サイドパネルを開くボタンと郵便箱のタブに未読の数が出る。
// しおりか郵便箱の行を押すとダイアログで本文が見え（見たことになる）、「移動」で行き先へ移る（行き先を見たことになる）。行き先が無ければ「行き先がありません」
import { aiAuth, expect, type Page, test } from "./fixtures"
import { addBox, items } from "./helpers/paper"
import { fromMenu } from "./helpers/stage-menu"

const leftPanel = (page: Page) => page.getByRole("complementary", { name: "左サイドパネル" })
const perform = async (page: Page, data: object) =>
  (await page.request.post("/api/ai/perform", { headers: aiAuth(), data })).json()
const mailbox = async (page: Page) =>
  (await (await page.request.get("/api/ai/mail", { headers: aiAuth() })).json()).mailbox as {
    id: string
    seenAt?: string
    visitedAt?: string
  }[]

// 画面を開き、窓が見ているブックの id を返す
async function ready(page: Page): Promise<string> {
  const ai = aiAuth()
  await page.goto("/")
  await page.bringToFront()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toHaveProperty("stage")
  return ((await (await page.request.get("/api/ai/view", { headers: ai })).json()) as { book: string }).book
}

test("AI が手紙を送るとマーキーとしおりが出て、未読の数が出る。しおりを押すとダイアログで本文が見え、移動で行き先の箱を見せる。AI はどちらも見たと知れる", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const book = await ready(page)
  await addBox(page, 900, 600, "遠く")
  const box = (await items(page).filter({ hasText: "遠く" }).getAttribute("data-item"))!
  await perform(page, {
    action: "@matomezu/base:mail-send",
    args: { from: "D64", title: "見てください", body: "箱を直しました", to: { book, ids: [box] } },
  })
  await expect(page.getByRole("status").filter({ hasText: "郵便が届きました: 見てください" })).toBeVisible()
  const bookmark = page.getByRole("button", { name: "見てください" })
  await expect(bookmark).toBeVisible()
  const count = (await fromMenu(page, "左サイドパネルを開く")).locator("[data-count]")
  await expect(count).toHaveText("1")
  await page.keyboard.press("Escape")
  await bookmark.click()
  const dialog = page.getByRole("dialog", { name: "見てください" })
  await expect(dialog).toContainText("箱を直しました")
  await expect(dialog).toContainText("D64")
  // 見たことになり、しおりは消える
  await expect.poll(async () => !!(await mailbox(page))[0]?.seenAt).toBe(true)
  await expect(bookmark).toHaveCount(0)
  await dialog.getByRole("button", { name: "移動" }).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(async () => !!(await mailbox(page))[0]?.visitedAt).toBe(true)
  const stage = (await page.locator("[data-stage]").boundingBox())!
  const b = (await items(page).filter({ hasText: "遠く" }).boundingBox())!
  expect(b.x).toBeGreaterThan(stage.x)
  expect(b.x + b.width).toBeLessThan(stage.x + stage.width)
})

test("未読が 3 通まではしおりを 1 通に 1 つずつ、4 通になると 1 つにまとめて数を付け、押すと郵便箱が開く。郵便箱の行を押すとダイアログが開き、取消は確かめてから消す", async ({
  page,
}) => {
  await ready(page)
  for (const n of [1, 2, 3])
    await perform(page, { action: "@matomezu/base:mail-send", args: { from: "a", title: `題${n}` } })
  for (const n of [1, 2, 3]) await expect(page.getByRole("button", { name: `題${n}` })).toBeVisible()
  await perform(page, { action: "@matomezu/base:mail-send", args: { from: "a", title: "題4" } })
  const many = page.getByRole("button", { name: "未読の郵便 4 通" })
  await expect(many).toBeVisible()
  await expect(page.getByRole("button", { name: "題1" })).toHaveCount(0)
  await many.click()
  await expect(leftPanel(page).getByRole("tab", { name: /郵便箱/ })).toHaveAttribute("aria-selected", "true")
  const rows = leftPanel(page).getByRole("listitem")
  await expect(rows).toHaveCount(4)
  // 新しい順。行を押すとダイアログが開く
  await expect(rows.first()).toContainText("題4")
  await rows.first().getByRole("button").first().click()
  await expect(page.getByRole("dialog", { name: "題4" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog", { name: "題4" })).toHaveCount(0)
  // ダイアログを閉じても、郵便箱は開いたまま
  await leftPanel(page).getByRole("button", { name: "題1を取り消す" }).click()
  await leftPanel(page).getByRole("group", { name: "取り消しますか？" }).getByRole("button", { name: "取消" }).click()
  await expect(rows).toHaveCount(3)
})

test("行き先の無くなった手紙は、ダイアログに「行き先がありません」と出て、移動は出ない", async ({ page }) => {
  const book = await ready(page)
  await perform(page, {
    action: "@matomezu/base:mail-send",
    args: { from: "a", title: "消えた所", to: { book, ids: ["nothing"] } },
  })
  await page.getByRole("button", { name: "消えた所" }).click()
  const dialog = page.getByRole("dialog", { name: "消えた所" })
  await expect(dialog).toContainText("行き先がありません")
  await expect(dialog.getByRole("button", { name: "移動" })).toHaveCount(0)
})

test("移動を使わなくても、行き先が画面に出ていれば行き先を見たことになる（郵便そのものは見ていないまま）", async ({
  page,
}) => {
  const book = await ready(page)
  await perform(page, { action: "@matomezu/base:mail-send", args: { from: "a", title: "今のブック", to: { book } } })
  await expect.poll(async () => !!(await mailbox(page))[0]?.visitedAt).toBe(true)
  expect((await mailbox(page))[0]?.seenAt).toBeUndefined()
})
