// ブックスクリーンの下の行の「閉じる」（頭）と「□」（右端）: 上下に分けた並びの中では、閉じるで並びから外し、□ でこのスクリーンだけを窓いっぱいにする。
// 窓いっぱいの間は □ を出さず、閉じるで前のスクリーンへ戻る。分割で開くブックスクリーンは、右から滑り込む
import { aiAuth, CONTROL_CENTER_URL, expect, type Page, test } from "./fixtures"
import { aiPerform } from "./helpers/ai"

const NOW = "2026-11-23T00:00:00.000Z"

async function perform(page: Page, action: string, args: object, on?: object) {
  const res = await page.request.post("/api/perform", {
    data: { actions: [{ action, args, ...(on ? { on } : {}), lang: "ja", now: NOW }] },
  })
  return (await res.json()) as { ok: boolean; result?: Record<string, string> }
}

// AI を 1 人参加させてワークルーム name に受け入れ、そのワーカーブックにページを 1 枚足す（参加者一覧の番号の行から開けるように）
async function memberWithPage(page: Page, name: string, title: string) {
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
  const ai = { ...aiAuth(), "X-Matomezu-Participant": joined.participant }
  const added = await aiPerform(
    page,
    { action: "@matomezu/base:worker-page-add", args: { type: "@matomezu/drawing:drawing", title } },
    ai,
  )
  expect(added, JSON.stringify(added)).toMatchObject({ ok: true })
}

// 画面の動き（スクリーンが入ってくるなど）が止まるのを待つ
const settled = (page: Page) =>
  expect.poll(() => page.evaluate(() => document.getAnimations().filter(a => a.playState === "running").length)).toBe(0)

test("分割で開いたブックスクリーンの下の行に閉じると □ が出る。□ で窓いっぱいになり、閉じるでコントロールセンターへ戻る", async ({
  page,
}) => {
  await page.goto(CONTROL_CENTER_URL)
  await memberWithPage(page, "しらべ", "作業のメモ")
  const line = page.locator("[data-workroom]").filter({ hasText: "しらべ" }).locator("[data-current-line]")
  const close = page.locator("[data-footer-close]").locator("visible=true")
  const maximize = page.locator("[data-footer-maximize]").locator("visible=true")

  // 分割で開くと、下の段のブックスクリーンの下の行に、閉じると □
  await line.click()
  await page.getByRole("menuitem", { name: "分割で開く" }).click()
  await expect(close).toHaveCount(1)
  await expect(maximize).toHaveCount(1)
  await settled(page)
  await page.screenshot({ path: "test-results/book-screen-footer-split.png" })

  // □: このスクリーンだけを窓いっぱいに（コントロールセンターは見えなくなり、□ は消える）
  await maximize.click()
  await expect(line).toBeHidden()
  await expect(maximize).toHaveCount(0)
  await settled(page)
  await page.screenshot({ path: "test-results/book-screen-footer-full.png" })

  // 閉じる: ブックスクリーンを閉じて、コントロールセンターへ戻る
  await close.click()
  await expect(line).toBeVisible()
  await expect(page.getByText("作業のメモ")).toHaveCount(0)

  // 分割の中の閉じる: 並びから外れ、コントロールセンターが窓いっぱいに戻る
  await line.click()
  await page.getByRole("menuitem", { name: "分割で開く" }).click()
  await expect(close).toHaveCount(1)
  await close.click()
  await expect(close).toHaveCount(0)
  await expect(line).toBeVisible()
})

test("ブックスクリーンを 2 枚分割で開くと 2 段で見え、それぞれの下の行に閉じると □ が出る", async ({ page }) => {
  await page.goto(CONTROL_CENTER_URL)
  await memberWithPage(page, "あお", "あおのメモ")
  await memberWithPage(page, "あか", "あかのメモ")
  const lineOf = (name: string) =>
    page.locator("[data-workroom]").filter({ hasText: name }).locator("[data-current-line]")
  const close = page.locator("[data-footer-close]").locator("visible=true")
  const maximize = page.locator("[data-footer-maximize]").locator("visible=true")

  await lineOf("あお").click()
  await page.getByRole("menuitem", { name: "分割で開く" }).click()
  await expect(close).toHaveCount(1)
  await settled(page)
  // コントロールセンターの段から、もう 1 冊を分割で開く（押した側の段が替わる）
  await lineOf("あか").click()
  await page.getByRole("menuitem", { name: "分割で開く" }).click()
  await expect(close).toHaveCount(2)
  await expect(maximize).toHaveCount(2)
  await expect(page.getByText("あおのメモ").locator("visible=true")).toHaveCount(1)
  await expect(page.getByText("あかのメモ").locator("visible=true")).toHaveCount(1)
  await settled(page)
  await page.screenshot({ path: "test-results/book-screen-footer-two.png" })
})
