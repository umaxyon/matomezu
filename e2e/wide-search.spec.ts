// 横断検索: コントロールセンターの虫メガネか Ctrl+Shift+F で左サイドパネルに開く。全文で打つと横断検索の当たりが並び、押すとチケットスクリーンが開く（パネルは開いたまま）。
// チケットモードは、パネルを開いたままボードを絞り（書庫が前なら引っ込めてボードを出し）、閉じても絞ったままにして、ボードの上の印の × で戻す
import { CONTROL_CENTER_URL, expect, type Page, test } from "./fixtures"
import { aiPerform } from "./helpers/ai"
import { storedRecords } from "./helpers/stored"

// 窓が低い（800px 未満）ときの、チケットスクリーンを全画面で開く動きを確かめる（上下に分ける動きは ticket-split.spec.ts）
const PROJECT = "@matomezu/taskboard:project"
type Project = { id: string; lanes: { kind: string; id: string }[] }

test.use({ viewport: { width: 1280, height: 720 } })

// 最初のプロジェクト（無ければ足す）のレーンに、題に word を含むチケットと、含まないチケットを足す
async function setup(page: Page, word: string) {
  await page.goto(CONTROL_CENTER_URL)
  if ((await storedRecords<Project>(page.request, PROJECT)).length === 0)
    expect((await aiPerform(page, { action: "@matomezu/taskboard:project-add", args: {} })).ok).toBe(true)
  const first = (await storedRecords<Project>(page.request, PROJECT))[0]!
  const lane = first.lanes.find(l => l.kind === "lane")!.id
  const hit = await aiPerform(page, {
    action: "@matomezu/taskboard:ticket-add",
    args: { project: first.id, name: `${word}を直す`, lane },
  })
  const other = await aiPerform(page, {
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

test("コントロールセンターで Ctrl+Shift+F を押すと横断検索が開いて検索する言葉の入力に焦点が来て、その中でもう一度押すと閉じる", async ({
  page,
}) => {
  await page.goto(CONTROL_CENTER_URL)
  const words = panel(page).getByRole("textbox", { name: "検索する言葉" })
  await expect(page.getByRole("button", { name: "横断検索" })).toBeVisible()
  await page.keyboard.press("Control+Shift+F")
  await expect(words).toBeFocused()
  await expect(page.getByRole("button", { name: "横断検索" })).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("Control+Shift+F")
  await expect(words).toHaveCount(0)
})

test("チケットモードは、パネルを開いたままボードを絞り、閉じても残り、パネルを開き直して印の × で戻る", async ({
  page,
}) => {
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
  // 絞りの印（検索中の帯）はボードの上には出ず、左サイドパネルの中に出る。パネルを閉じていても、プロジェクトの題の帯には押した状態のろうとが出る
  const mark = page.getByRole("status").filter({ hasText: "検索中" })
  await expect(mark).toHaveCount(0)
  const indicator = page.locator("[data-board]").first().getByRole("button", { name: "絞り込み中（押すと解除）" })
  await expect(indicator).toHaveAttribute("aria-pressed", "true")
  await page.getByRole("button", { name: "横断検索" }).click()
  await expect(mark).toContainText(word)
  await expect(side.locator(mark)).toHaveCount(1)
  await mark.getByRole("button", { name: "絞りを解除" }).click()
  await expect(mark).toHaveCount(0)
  await expect(page.locator(`[data-card="${other}"]`)).toBeVisible()
  // 絞りが解けると、題の帯のろうとも消える
  await expect(indicator).toHaveCount(0)
})

test("絞っている間だけ題の帯に押した状態のろうとが出て、押すと絞りが解ける（パネルを閉じたままでよい）", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const word = `ろうと${Date.now()}`
  const { hit, other } = await setup(page, word)
  const indicator = page.locator("[data-board]").first().getByRole("button", { name: "絞り込み中（押すと解除）" })
  await expect(indicator).toHaveCount(0)
  await page.getByRole("button", { name: "横断検索" }).click()
  await panel(page).getByRole("textbox", { name: "検索する言葉" }).fill(word)
  await expect(page.locator(`[data-card="${other}"]`)).toHaveCount(0)
  await page.keyboard.press("Escape")
  await expect(panel(page).getByRole("textbox", { name: "検索する言葉" })).toHaveCount(0)
  // 絵は線だけ（塗らない）。押すと絞りが解け、ろうとも消える
  expect(await indicator.locator("svg").evaluate(e => getComputedStyle(e).fill)).toBe("none")
  await indicator.click()
  await expect(page.locator(`[data-card="${other}"]`)).toBeVisible()
  await expect(page.locator(`[data-card="${hit}"]`)).toBeVisible()
  await expect(indicator).toHaveCount(0)
})

test("パネルを開いたまま、ろうとや「検索中」の × で絞りを解くと入力の言葉も消え、言葉を消して選びが初めのままなら絞りも解ける", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const word = `けす${Date.now()}`
  const { hit, other } = await setup(page, word)
  const indicator = page.locator("[data-board]").first().getByRole("button", { name: "絞り込み中（押すと解除）" })
  const mark = page.getByRole("status").filter({ hasText: "検索中" })
  await page.getByRole("button", { name: "横断検索" }).click()
  const box = panel(page).getByRole("textbox", { name: "検索する言葉" })
  // ろうとで解くと、入力の言葉も消える
  await box.fill(word)
  await expect(page.locator(`[data-card="${other}"]`)).toHaveCount(0)
  await indicator.click()
  await expect(indicator).toHaveCount(0)
  await expect(box).toHaveValue("")
  // 「検索中」の × で解いても、入力の言葉は消える
  await box.fill(word)
  await expect(mark).toContainText(word)
  await mark.getByRole("button", { name: "絞りを解除" }).click()
  await expect(mark).toHaveCount(0)
  await expect(box).toHaveValue("")
  // 言葉を消すと、ほかに選びが無いので絞りも解ける
  await box.fill(word)
  await expect(indicator).toHaveCount(1)
  await box.fill("")
  await expect(mark).toHaveCount(0)
  await expect(indicator).toHaveCount(0)
  await expect(page.locator(`[data-card="${other}"]`)).toBeVisible()
  await expect(page.locator(`[data-card="${hit}"]`)).toBeVisible()
})

test("コンテンツエリアに書庫が出ていても、チケットモードで絞るとボードが出る。カードの番号（M-0050 の形）でも当たる", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const word = `ばんごう${Date.now()}`
  const { hit, label } = await setup(page, word)
  expect(label).toMatch(/\d{4}$/)
  // 利用者パネルの「書庫」のボタン（書庫の画面の中にも、同じ名前のツリーの行とパンくずが在る。利用者パネルが先）
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  await expect(page.getByRole("button", { name: "書庫", exact: true }).first()).toHaveAttribute("aria-pressed", "true")
  await page.getByRole("button", { name: "横断検索" }).click()
  await panel(page).getByRole("textbox", { name: "検索する言葉" }).fill(label)
  // コンテンツエリアの書庫の表示が引っ込み、プロジェクトの表示が出て、番号に当たったチケットのカードが見える
  await expect(page.getByRole("button", { name: "プロジェクト" }).first()).toHaveAttribute("aria-pressed", "true")
  await expect(page.locator(`[data-card="${hit}"]`)).toBeVisible()
})

test("全文モードで続けて別のチケットを開いても、スクリーンは積まず、ブラウザの履歴には積む。戻るで前のチケット、もう 1 回でコントロールセンターに戻る。当たった所は赤字になる", async ({
  page,
}) => {
  const word = `かさね${Date.now()}`
  const { hit, other } = await setup(page, word)
  expect(other).not.toBe(hit)
  // 2 枚目のチケット（題にも word を入れる）
  const first = (await storedRecords<Project>(page.request, PROJECT))[0]!
  const lane = first.lanes.find(l => l.kind === "lane")!.id
  await aiPerform(page, {
    action: "@matomezu/taskboard:ticket-add",
    args: { project: first.id, name: `${word}の二枚目`, lane },
  })
  await page.getByRole("button", { name: "横断検索" }).click()
  const side = panel(page)
  await side.getByRole("button", { name: "全文" }).click()
  await side.getByRole("textbox", { name: "検索する言葉" }).fill(word)
  await expect(side.locator("mark").first()).toHaveText(new RegExp(word, "i"))
  await side.getByRole("button", { name: new RegExp(`${word}を直す`) }).click()
  await expect(page.getByRole("heading", { name: `${word}を直す` })).toBeVisible()
  const length = await page.evaluate(() => history.length)
  await side.getByRole("button", { name: new RegExp(`${word}の二枚目`) }).click()
  await expect(page.getByRole("heading", { name: `${word}の二枚目` })).toBeVisible()
  // ブラウザの履歴には積む（戻ると前のチケットに戻る）
  expect(await page.evaluate(() => history.length)).toBe(length + 1)
  await page.getByRole("button", { name: "戻る" }).click()
  await expect(page.getByRole("heading", { name: `${word}を直す` })).toBeVisible()
  await page.getByRole("button", { name: "戻る" }).click()
  await expect(page.getByRole("heading", { name: "コントロールセンター" })).toBeVisible()
})
