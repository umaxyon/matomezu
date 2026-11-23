// ブックスクリーンの下の行の「閉じる」（頭）と「□」（右端）: 上下に分けた並びの中では、閉じるで並びから外し、□ でこのスクリーンだけを窓いっぱいにする。
// 窓いっぱいの間の □ は、並びに戻す・上下に分ける。閉じるで前のスクリーンへ戻る。分割で開くブックスクリーンは、右から滑り込む
import { aiAuth, CONTROL_CENTER_URL, expect, type Page, test } from "./fixtures"
import { aiPerform } from "./helpers/ai"
import { track } from "./helpers/motion"

const BOOK = "[data-current][data-row='true']:not([data-leaving])"
const WHOLE_OR_ROW = "[data-over]:not([data-leaving])"
const PLAIN = "section [data-top]"

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
  const maximize = page.locator("[data-footer-widen]").locator("visible=true")

  // 分割で開くと、下の段のブックスクリーンの下の行に、閉じると □
  await line.click()
  await page.getByRole("menuitem", { name: "分割で開く" }).click()
  await expect(close).toHaveCount(1)
  await expect(maximize).toHaveCount(1)
  await settled(page)
  await page.screenshot({ path: "test-results/book-screen-footer-split.png" })

  // □: このスクリーンだけを、その場から窓いっぱいに伸ばす（右から入り直さない）。□ は「分割に戻す」に替わる
  const height = await page.evaluate(() => innerHeight)
  const grow = await Promise.all([track(page, { book: WHOLE_OR_ROW }), maximize.click()])
  expect(grow[0].every(f => f.book === null || f.book.left === 0)).toBe(true)
  expect(grow[0].some(f => f.book && f.book.height > height * 0.55 && f.book.height < height * 0.95)).toBe(true)
  await expect(line).toBeHidden()
  const restore = page.getByRole("button", { name: "分割に戻す" }).locator("visible=true")
  await expect(restore).toHaveCount(1)
  await settled(page)
  await page.screenshot({ path: "test-results/book-screen-footer-full.png" })
  // 分割に戻す: その場から縮み、コントロールセンターの段が戻る
  const shrink = await Promise.all([track(page, { book: WHOLE_OR_ROW }), restore.click()])
  expect(shrink[0].every(f => f.book === null || f.book.left === 0)).toBe(true)
  expect(shrink[0].some(f => f.book && f.book.height > height * 0.55 && f.book.height < height * 0.95)).toBe(true)
  await expect(line).toBeVisible()
  await expect(maximize).toHaveCount(1)
  await settled(page)
  await maximize.click()
  await expect(line).toBeHidden()

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
  // 並びから外れただけでなく、閉じている
  await expect(page.getByText("作業のメモ")).toHaveCount(0)
})

test("ブックスクリーンを 2 枚分割で開くと 2 段で見え、それぞれの下の行に閉じると □ が出る", async ({ page }) => {
  await page.goto(CONTROL_CENTER_URL)
  await memberWithPage(page, "あお", "あおのメモ")
  await memberWithPage(page, "あか", "あかのメモ")
  const lineOf = (name: string) =>
    page.locator("[data-workroom]").filter({ hasText: name }).locator("[data-current-line]")
  const close = page.locator("[data-footer-close]").locator("visible=true")
  const maximize = page.locator("[data-footer-widen]").locator("visible=true")

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

  // 上の段（あか）の閉じる: 押した方だけ閉じ、もう片方は動かずに残る（替えたコントロールセンターの段が、伸び縮みせずに上に戻る）
  // 文字で見分けた段に印を付け、その印で位置を追う（track は CSS のセレクタで探す）
  const rowOf = async (text: string, mark: string) => {
    await page
      .locator("[data-over]:not([data-leaving])")
      .filter({ hasText: text })
      .evaluate((e, m) => {
        e.setAttribute("data-probe", m)
      }, mark)
    return `[data-probe="${mark}"]:not([data-leaving])`
  }
  const height = await page.evaluate(() => innerHeight)
  const [top] = await Promise.all([
    track(page, { stays: await rowOf("あおのメモ", "stays"), plain: PLAIN }),
    page.locator("[data-over]").filter({ hasText: "あかのメモ" }).locator("[data-footer-close]").click(),
  ])
  expect(new Set(top.flatMap(f => (f.stays ? [Math.round(f.stays.top)] : []))).size).toBe(1)
  expect(top.every(f => f.plain === null || f.plain.height < height * 0.55)).toBe(true)
  await expect(page.getByText("あかのメモ")).toHaveCount(0)
  await expect(page.getByText("あおのメモ").locator("visible=true")).toHaveCount(1)
  await expect(lineOf("あお")).toBeVisible()
  await expect(close).toHaveCount(1)
  await settled(page)

  // もう一度 2 段にして、下の段（あお）の閉じる: 下が右へ出ていき終えてから、上（あか）が下の段へ降りる
  await lineOf("あか").click()
  await page.getByRole("menuitem", { name: "分割で開く" }).click()
  await expect(close).toHaveCount(2)
  await settled(page)
  const width = await page.evaluate(() => innerWidth)
  const [bottom] = await Promise.all([
    track(page, { leaving: "[data-leaving]", moves: await rowOf("あかのメモ", "moves"), plain: PLAIN }),
    page.locator("[data-over]").filter({ hasText: "あおのメモ" }).locator("[data-footer-close]").click(),
  ])
  for (const f of bottom) if (f.leaving && f.leaving.left < width - 10) expect(f.moves?.top).toBe(0)
  expect(bottom.some(f => f.moves && f.moves.top > 10 && f.moves.top < height * 0.45)).toBe(true)
  expect(bottom.every(f => f.plain === null || f.plain.height < height * 0.55)).toBe(true)
  await expect(page.getByText("あおのメモ")).toHaveCount(0)
  await expect(lineOf("あか")).toBeVisible()
})

test("ブックスクリーンと並んだコントロールセンターの書庫で、ブックのクリックで 2 択を出す。分割で開くと上の段に入り、開くと並びのブックスクリーンを閉じて窓いっぱいに開く", async ({
  page,
}) => {
  await page.goto(CONTROL_CENTER_URL)
  await memberWithPage(page, "あお", "あおのメモ")
  const line = page.locator("[data-workroom]").filter({ hasText: "あお" }).locator("[data-current-line]")
  const close = page.locator("[data-footer-close]").locator("visible=true")
  await line.click()
  await page.getByRole("menuitem", { name: "分割で開く" }).click()
  await expect(close).toHaveCount(1)
  await settled(page)
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  const library = page.getByRole("list", { name: "書庫 の中身" })

  // 分割で開く: 上の段（コントロールセンター）が、開いたブックスクリーンに替わる
  await library.getByRole("button", { name: "残課題" }).click()
  await page.getByRole("menuitem", { name: "分割で開く" }).click()
  await expect(close).toHaveCount(2)
  await expect(page.getByText("あおのメモ").locator("visible=true")).toHaveCount(1)
  await expect(line).toBeHidden()
  await settled(page)

  // 上の段を閉じて、コントロールセンターの段に戻し、こんどは開く: 並びのブックスクリーンを閉じて、窓いっぱいに開く
  await page.locator("[data-over]").filter({ hasText: "残課題" }).locator("[data-footer-close]").click()
  await expect(line).toBeVisible()
  await settled(page)
  await library.getByRole("button", { name: "残課題" }).click()
  await page.getByRole("menuitem", { name: "開く", exact: true }).click()
  await expect(line).toBeHidden()
  await expect(page.getByText("あおのメモ")).toHaveCount(0)
  await expect(close).toHaveCount(1)
})

test("分割で開くと、コントロールセンターが上に縮んでから、ブックスクリーンが右から入る。閉じると、ブックスクリーンが右へ出ていき、後ろのコントロールセンターが見える", async ({
  page,
}) => {
  await page.goto(CONTROL_CENTER_URL)
  await memberWithPage(page, "しらべ", "作業のメモ")
  const line = page.locator("[data-workroom]").filter({ hasText: "しらべ" }).locator("[data-current-line]")
  await line.click()
  const height = await page.evaluate(() => innerHeight)
  const [frames] = await Promise.all([
    track(page, { book: BOOK, plain: PLAIN }),
    page.getByRole("menuitem", { name: "分割で開く" }).click(),
  ])
  const width = await page.evaluate(() => innerWidth)
  // コントロールセンターが縮み終える前は、ブックスクリーンは右の外にいる
  const shrinking = frames.filter(f => f.plain && f.plain.height > height * 0.55 && f.plain.height < height * 0.95)
  expect(shrinking.length).toBeGreaterThan(0)
  for (const f of shrinking) expect(f.book === null || f.book.left >= width - 1).toBe(true)
  // そのあと、右から入る（途中の位置を通る）。下から上がってこない（上端は動かない）
  expect(frames.some(f => f.book && f.book.left > 10 && f.book.left < width - 10)).toBe(true)
  const tops = new Set(frames.flatMap(f => (f.book && f.book.left < width - 1 ? [Math.round(f.book.top)] : [])))
  expect(tops.size).toBe(1)
  await settled(page)

  const close = page.locator("[data-footer-close]").locator("visible=true")
  const [out] = await Promise.all([track(page, { leaving: "[data-leaving]" }), close.click()])
  // 閉じたブックスクリーンが、右へ出ていく（途中の位置を通る）。その間、コントロールセンターは右から滑り込まない（見えたまま）
  expect(out.some(f => f.leaving && f.leaving.left > 10 && f.leaving.left < width - 10)).toBe(true)
  const section = await page.locator("section[data-instant]").evaluate(e => e.getBoundingClientRect().left)
  expect(section).toBe(0)
  await settled(page)
  await expect(page.locator("[data-leaving]")).toHaveCount(0)
  await expect(line).toBeVisible()
})

test("下の段にだけブックスクリーンがあるとき、書庫から開くと、新しいブックスクリーンが下の段の上を右から滑り込む", async ({
  page,
}) => {
  await page.goto(CONTROL_CENTER_URL)
  await memberWithPage(page, "あお", "あおのメモ")
  const line = page.locator("[data-workroom]").filter({ hasText: "あお" }).locator("[data-current-line]")
  await line.click()
  await page.getByRole("menuitem", { name: "分割で開く" }).click()
  await settled(page)
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  const library = page.getByRole("list", { name: "書庫 の中身" })
  await library.getByRole("button", { name: "残課題" }).click()
  const width = await page.evaluate(() => innerWidth)
  const [frames] = await Promise.all([
    track(page, { book: WHOLE_OR_ROW }),
    page.getByRole("menuitem", { name: "開く", exact: true }).click(),
  ])
  // 窓いっぱいの高さで、右から入る（途中の位置を通る）
  expect(frames.some(f => f.book && f.book.top === 0 && f.book.left > 10 && f.book.left < width - 10)).toBe(true)
  await settled(page)
  await expect(page.getByText("あおのメモ")).toHaveCount(0)
})

test("最初から窓いっぱいに開いたブックスクリーンにも □ を「上下に分ける」で出し、押すとその場から縮んでコントロールセンターと上下に分かれる", async ({
  page,
}) => {
  await page.goto(CONTROL_CENTER_URL)
  await memberWithPage(page, "あお", "あおのメモ")
  const line = page.locator("[data-workroom]").filter({ hasText: "あお" }).locator("[data-current-line]")
  await line.click()
  await page.getByRole("menuitem", { name: "開く", exact: true }).click()
  await settled(page)
  await expect(line).toBeHidden()
  const rows = page.getByRole("button", { name: "上下に分ける" }).locator("visible=true")
  await expect(rows).toHaveCount(1)
  const height = await page.evaluate(() => innerHeight)
  const [frames] = await Promise.all([track(page, { book: WHOLE_OR_ROW }), rows.click()])
  expect(frames.every(f => f.book === null || f.book.left === 0)).toBe(true)
  expect(frames.some(f => f.book && f.book.height > height * 0.55 && f.book.height < height * 0.95)).toBe(true)
  await expect(line).toBeVisible()
  await expect(page.getByRole("button", { name: "スクリーンを広げる" }).locator("visible=true")).toHaveCount(1)
})

test("書庫の行の右クリックのメニューの「開く」の下に「分割で開く」があり、押すと上下に分けて開く。Mod+Enter でも分割で開く", async ({
  page,
}) => {
  await page.goto(CONTROL_CENTER_URL)
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  const library = page.getByRole("list", { name: "書庫 の中身" })
  const row = library.getByRole("button", { name: "残課題" })
  await row.click({ button: "right" })
  const items = page.getByRole("menu").getByRole("menuitem")
  const names = await items.allTextContents()
  expect(names[names.findIndex(n => n.startsWith("開く")) + 1]).toMatch(/^分割で開く/)
  await page.getByRole("menuitem", { name: /^分割で開く/ }).click()
  const close = page.locator("[data-footer-close]").locator("visible=true")
  await expect(close).toHaveCount(1)
  await expect(page.getByRole("button", { name: "書庫", exact: true }).first()).toBeVisible()
  await close.click()
  await expect(close).toHaveCount(0)
  await settled(page)

  await row.focus()
  await page.keyboard.press("ControlOrMeta+Enter")
  await expect(close).toHaveCount(1)
  await expect(page.getByRole("button", { name: "書庫", exact: true }).first()).toBeVisible()
})

test("ブックスクリーンの紙の右クリックのメニューの「画面を分割」の下に「スクリーンを閉じる」があり、押すとブックスクリーンを閉じる", async ({
  page,
}) => {
  await page.goto(CONTROL_CENTER_URL)
  await memberWithPage(page, "あお", "あおのメモ")
  const line = page.locator("[data-workroom]").filter({ hasText: "あお" }).locator("[data-current-line]")
  await line.click()
  await page.getByRole("menuitem", { name: "開く", exact: true }).click()
  await settled(page)
  await page
    .getByRole("img", { name: "紙" })
    .locator("visible=true")
    .first()
    .click({ button: "right", position: { x: 40, y: 40 } })
  const names = await page.getByRole("menu").getByRole("menuitem").allTextContents()
  expect(names[names.indexOf("画面を分割") + 1]).toBe("スクリーンを閉じる")
  await page.getByRole("menuitem", { name: "スクリーンを閉じる" }).click()
  await expect(line).toBeVisible()
  await expect(page.getByText("あおのメモ")).toHaveCount(0)
})
