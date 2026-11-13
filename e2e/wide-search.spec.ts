// 横断検索: コントロールセンターの虫メガネで左サイドパネルに開く。全文で打つと横断検索の当たりが並び、押すとチケットスクリーンが開く（パネルは開いたまま）。
// チケットモードは、パネルを開いたままボードを絞り（書庫が前なら引っ込めてボードを出し）、閉じても絞ったままにして、ボードの上の印の × で戻す
import { CONTROL_CENTER_URL, expect, joinedAiAuth, type Page, test } from "./fixtures"

const perform = async (page: Page, data: object) =>
  (await page.request.post("/api/ai/perform", { headers: await joinedAiAuth(), data })).json() as Promise<{
    ok: boolean
    result?: { project?: string; ticket?: string; label?: string }
  }>

const projects = async (page: Page) =>
  Object.values(
    (
      (await (await page.request.get("/api/data", { headers: await joinedAiAuth() })).json()) as {
        records: Record<string, Record<string, unknown>>
      }
    ).records["@matomezu/taskboard:project"] ?? {},
  ) as { id: string; lanes: { kind: string; id: string }[] }[]

// 最初のプロジェクト（無ければ足す）のレーンに、題に word を含むチケットと、含まないチケットを足す
async function setup(page: Page, word: string) {
  await page.goto(CONTROL_CENTER_URL)
  if ((await projects(page)).length === 0)
    expect((await perform(page, { action: "@matomezu/taskboard:project-add", args: {} })).ok).toBe(true)
  const first = (await projects(page))[0]!
  const lane = first.lanes.find(l => l.kind === "lane")!.id
  const hit = await perform(page, {
    action: "@matomezu/taskboard:ticket-add",
    args: { project: first.id, name: `${word}を直す`, lane },
  })
  const other = await perform(page, {
    action: "@matomezu/taskboard:ticket-add",
    args: { project: first.id, name: "ほかのチケット", lane },
  })
  return { project: first.id, hit: hit.result!.ticket!, label: hit.result!.label!, other: other.result!.ticket! }
}

const panel = (page: Page) => page.locator("[data-left-side-panel]")

test("虫メガネで左サイドパネルに横断検索が開き、全文で打つと横断検索の当たりが並び、押すとチケットスクリーンが開いてもパネルは開いたまま", async ({
  page,
}) => {
  const word = `ぜんぶん${Date.now()}`
  const { hit } = await setup(page, word)
  const opener = page.getByRole("button", { name: "横断検索" })
  await opener.click()
  const side = panel(page)
  // もう一度押すと閉じる
  await opener.click()
  await expect(side.getByRole("textbox", { name: "検索する言葉" })).toHaveCount(0)
  await opener.click()
  await expect(side.getByRole("button", { name: "チケット" })).toHaveAttribute("aria-pressed", "true")
  await side.getByRole("button", { name: "全文" }).click()
  await side.getByRole("textbox", { name: "検索する言葉" }).fill(word)
  await side.getByRole("button", { name: new RegExp(word) }).click()
  await expect(
    page
      .getByRole("region", { name: "チケット" })
      .first()
      .getByRole("heading", { name: `${word}を直す` }),
  ).toBeVisible()
  await expect(side.getByRole("textbox", { name: "検索する言葉" })).toBeVisible()
  expect(hit).not.toBe("")
})

test("チケットモードは、パネルを開いたままボードを絞り、閉じても残り、印の × で戻る", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const word = `ちけっと${Date.now()}`
  const { hit, other } = await setup(page, word)
  await expect(page.locator(`[data-card="${other}"]`)).toBeVisible()
  await page.getByRole("button", { name: "横断検索" }).click()
  const side = panel(page)
  await expect(side.getByRole("button", { name: "チケット" })).toHaveAttribute("aria-pressed", "true")
  await side.getByRole("textbox", { name: "検索する言葉" }).fill(word)
  // パネルを開いたまま、ボードが絞られて見える
  await expect(page.locator(`[data-card="${other}"]`)).toHaveCount(0)
  await expect(page.locator(`[data-card="${hit}"]`)).toBeVisible()
  await expect(side.getByRole("textbox", { name: "検索する言葉" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(side.getByRole("textbox", { name: "検索する言葉" })).toHaveCount(0)
  await expect(page.locator(`[data-card="${hit}"]`)).toBeVisible()
  await expect(page.locator(`[data-card="${other}"]`)).toHaveCount(0)
  const mark = page.getByRole("status").filter({ hasText: "検索中" })
  await expect(mark).toContainText(word)
  await mark.getByRole("button", { name: "絞りを解除" }).click()
  await expect(mark).toHaveCount(0)
  await expect(page.locator(`[data-card="${other}"]`)).toBeVisible()
})

test("書庫が前に出ていても、チケットモードで絞るとボードが出る。カードの番号（M-0050 の形）でも当たる", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const word = `ばんごう${Date.now()}`
  const { hit, label } = await setup(page, word)
  expect(label).toMatch(/\d{4}$/)
  await page.getByRole("button", { name: "書庫" }).click()
  await expect(page.getByRole("button", { name: "書庫" })).toHaveAttribute("aria-pressed", "true")
  await page.getByRole("button", { name: "横断検索" }).click()
  await panel(page).getByRole("textbox", { name: "検索する言葉" }).fill(label)
  // コンテンツエリアの書庫の表示が引っ込み、プロジェクトの表示が出て、番号に当たったチケットのカードが見える
  await expect(page.getByRole("button", { name: "プロジェクト" }).first()).toHaveAttribute("aria-pressed", "true")
  await expect(page.locator(`[data-card="${hit}"]`)).toBeVisible()
})
