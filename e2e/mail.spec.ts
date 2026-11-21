// 郵便: AI が手紙を送ると、フォーカスのある窓にマーキーが流れ、画面の上からしおりがぶら下がる。左サイドパネルを開くボタンと郵便箱のタブに未読の数が出る。
// しおりか郵便箱の行を押すとダイアログで本文が見え（見たことになる）、下の行の「開く」などで行き先へ移る（行き先を見たことになる）。行き先の物には鳥が来て枠が光る。
// 行き先が無ければ「行き先がありません」と「閉じる」だけ
import {
  aiAuth,
  BOOK_SCREEN_URL,
  expect,
  joinedAiAuth,
  type Page,
  stagesUrl,
  test,
  urlPlace,
  urlStages,
} from "./fixtures"
import { aiPerform } from "./helpers/ai"
import { addBox, items } from "./helpers/paper"
import { fromMenu } from "./helpers/stage-menu"
import { storedBooks } from "./helpers/stored"

const leftPanel = (page: Page) => page.getByRole("complementary", { name: "左サイドパネル" })
const mailbox = async (page: Page) =>
  (
    await (
      await page.request.get("/api/ai/records?kind=%40matomezu%2Fbase%3Amail", { headers: await joinedAiAuth() })
    ).json()
  ).records as {
    id: string
    seenAt?: string
    visitedAt?: string
  }[]

// 画面を開き、窓が見ているブックの id を返す
async function ready(page: Page): Promise<string> {
  const ai = await joinedAiAuth()
  await page.goto(BOOK_SCREEN_URL)
  await page.bringToFront()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toHaveProperty("stage")
  return ((await (await page.request.get("/api/ai/view", { headers: ai })).json()) as { book: string }).book
}

test("AI が手紙を送るとマーキーとしおりが出て、未読の数が出る。しおりを押すとダイアログで本文が見え、開くで行き先の箱を見せ、鳥と光る枠が来て去る。AI はどちらも見たと知れる", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const book = await ready(page)
  await addBox(page, 900, 600, "遠く")
  await addBox(page, 700, 600, "隣")
  const box = (await items(page).filter({ hasText: "遠く" }).getAttribute("data-item"))!
  const next = (await items(page).filter({ hasText: "隣" }).getAttribute("data-item"))!
  await aiPerform(page, {
    action: "@matomezu/base:mail-send",
    args: {
      from: "D64",
      title: "見てください",
      body: "箱を直しました",
      to: { book, ids: [box, next] },
    },
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
  // 1 画面なら、閉じる・開く・分割で開く
  await expect(dialog.getByRole("button")).toHaveText(["閉じる", "開く", "分割で開く"])
  await dialog.getByRole("button", { name: "開く", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(async () => !!(await mailbox(page))[0]?.visitedAt).toBe(true)
  const stage = (await page.locator("[data-stage]").boundingBox())!
  const b = (await items(page).filter({ hasText: "遠く" }).boundingBox())!
  expect(b.x).toBeGreaterThan(stage.x)
  expect(b.x + b.width).toBeLessThan(stage.x + stage.width)
  // 行き先の物に鳥が来て、行き先の物それぞれの枠が光り、鳥が去ると枠も消える
  await expect(page.locator("[data-mail-bird]")).toBeVisible()
  await expect(page.locator("[data-anchor-frame]")).toHaveCount(2)
  await expect(page.locator("[data-mail-bird]")).toHaveCount(0, { timeout: 10_000 })
  await expect(page.locator("[data-anchor-frame]")).toHaveCount(0)
})

test("1 画面で「分割で開く」は、右に分けたステージで行き先を開き、ブラウザの戻る 1 回で分ける前に戻る", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const book = await ready(page)
  await addBox(page, 300, 300, "右の箱")
  const box = (await items(page).filter({ hasText: "右の箱" }).getAttribute("data-item"))!
  await aiPerform(page, {
    action: "@matomezu/base:mail-send",
    args: { from: "a", title: "右へ", to: { book, ids: [box] } },
  })
  await page.getByRole("button", { name: "右へ" }).click()
  await page.getByRole("dialog", { name: "右へ" }).getByRole("button", { name: "分割で開く" }).click()
  const stages = page.locator("[data-stage]")
  await expect(stages).toHaveCount(2)
  await expect(stages.nth(1).locator("[data-item]").filter({ hasText: "右の箱" })).toBeVisible()
  await expect(stages.nth(1).locator("[data-mail-bird]")).toBeVisible()
  await page.goBack()
  await expect(stages).toHaveCount(1)
})

test("2 画面なら「左に開く」「右に開く」で、Enter はダイアログを出したステージの側で開く", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const book = await ready(page)
  await addBox(page, 300, 300, "二つの箱")
  const box = (await items(page).filter({ hasText: "二つの箱" }).getAttribute("data-item"))!
  await page.goto(stagesUrl([{ book }, { book: null }], 1))
  const stages = page.locator("[data-stage]")
  await expect(stages).toHaveCount(2)
  await aiPerform(page, {
    action: "@matomezu/base:mail-send",
    args: { from: "a", title: "二つ", to: { book, ids: [box] } },
  })
  await page.getByRole("button", { name: "二つ" }).click()
  const dialog = page.getByRole("dialog", { name: "二つ" })
  await expect(dialog.getByRole("button")).toHaveText(["閉じる", "左に開く", "右に開く"])
  // カレントは右のステージなので、Enter は右に開く
  await page.keyboard.press("Enter")
  await expect(dialog).toHaveCount(0)
  await expect(stages.nth(1).locator("[data-item]").filter({ hasText: "二つの箱" })).toBeVisible()
  await expect(stages.nth(1).locator("[data-mail-bird]")).toBeVisible()
})

test("しおりは古い順に 5 つまで並べ、残りは「ほか n 件」にまとめ、押すと郵便箱が開く。片づけば次が出る。郵便箱の行を押すとダイアログが開き、取消は確かめてから消す", async ({
  page,
}) => {
  await ready(page)
  for (const n of [1, 2, 3, 4, 5])
    await aiPerform(page, {
      action: "@matomezu/base:mail-send",
      args: { from: "a", title: `題${n}` },
    })
  for (const n of [1, 2, 3, 4, 5]) await expect(page.getByRole("button", { name: `題${n}` })).toBeVisible()
  await expect(page.getByRole("button", { name: /^ほか/ })).toHaveCount(0)
  await aiPerform(page, { action: "@matomezu/base:mail-send", args: { from: "a", title: "題6" } })
  const many = page.getByRole("button", { name: "ほか 1 件" })
  await expect(many).toBeVisible()
  await expect(page.getByRole("button", { name: "題6" })).toHaveCount(0)
  // 1 通を見て片づけると、次の 1 通が出る
  await page.getByRole("button", { name: "題1" }).click()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("button", { name: "題6" })).toBeVisible()
  await expect(many).toHaveCount(0)
  await aiPerform(page, { action: "@matomezu/base:mail-send", args: { from: "a", title: "題7" } })
  await expect(many).toBeVisible()
  await many.click()
  await expect(leftPanel(page).getByRole("tab", { name: /郵便箱/ })).toHaveAttribute("aria-selected", "true")
  const rows = leftPanel(page).getByRole("listitem")
  await expect(rows).toHaveCount(7)
  // 新しい順。行を押すとダイアログが開く
  await expect(rows.first()).toContainText("題7")
  await rows.first().getByRole("button").first().click()
  await expect(page.getByRole("dialog", { name: "題7" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog", { name: "題7" })).toHaveCount(0)
  // ダイアログを閉じても、郵便箱は開いたまま
  await leftPanel(page).getByRole("button", { name: "題1を取り消す" }).click()
  await leftPanel(page).getByRole("group", { name: "取り消しますか？" }).getByRole("button", { name: "取消" }).click()
  await expect(rows).toHaveCount(6)
})

test("参加済みの送り手の鳥を郵便ごとに表示し、受信や退室でもしおりの色を保つ", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const userAction = async (action: string, args: object, on?: object) => {
    const response = await page.request.post("/api/perform", { data: { actions: [{ action, args, on }] } })
    expect(await response.json()).toMatchObject({ ok: true })
  }
  const joined = await page.request.post("/api/ai/join", {
    headers: aiAuth(),
    data: { ai: "claude", model: "e2e", env: "e2e", link: crypto.randomUUID(), sessionId: crypto.randomUUID() },
  })
  const { participant } = (await joined.json()) as { participant: string }
  expect(participant).toBeTruthy()
  // 参加要求のしおりは封筒で、ダイアログを閉じても残り、受け入れると消える
  const request = page.getByRole("button", { name: "AI エージェントから参加要求が届きました" })
  await expect(request.locator("svg")).toBeVisible()
  await request.click()
  await page.keyboard.press("Escape")
  await expect(request).toBeVisible()
  await userAction(
    "@matomezu/base:participant-accept",
    { newWorkroom: { name: "郵便を送る部屋", bird: "inko", palette: "orange" } },
    { record: participant },
  )
  await expect(request).toHaveCount(0)
  const ai = { ...aiAuth(), "X-Matomezu-Participant": participant }
  const send = async (title: string) => {
    const response = await page.request.post("/api/ai/perform", {
      headers: ai,
      data: { action: "@matomezu/base:mail-send", args: { from: "同じ表示名", title } },
    })
    expect(await response.json()).toMatchObject({ ok: true })
  }
  await userAction("@matomezu/base:mail-send", { from: "同じ表示名", title: "封筒の郵便" })
  const envelope = page.getByRole("button", { name: "封筒の郵便" })
  await expect(envelope.locator("svg")).toBeVisible()
  const background = "background-color"
  const envelopeColor = await envelope.evaluate(node => getComputedStyle(node).backgroundColor)

  await send("鳥の郵便")
  const bird = page.getByRole("button", { name: "鳥の郵便", exact: true })
  await expect(bird.locator("img")).toBeVisible()
  const birdColor = "rgb(239, 138, 50)" // 送り手が選んだ配色の旗の色
  await expect(bird).toHaveCSS(background, birdColor)
  await send("もう一通の鳥の郵便")
  await expect(page.getByRole("button", { name: "もう一通の鳥の郵便" }).locator("img")).toBeVisible()
  await expect(envelope).toHaveCSS(background, envelopeColor)
  await expect(bird).toHaveCSS(background, birdColor)

  await userAction("@matomezu/base:participant-remove", {}, { record: participant })
  await expect(bird.locator("svg")).toBeVisible()
  await expect(bird).toHaveCSS(background, birdColor)
  await page.reload()
  await expect(bird.locator("svg")).toBeVisible()
  await expect(bird).toHaveCSS(background, birdColor)
  await expect(envelope).toHaveCSS(background, envelopeColor)
})

test("行き先の無くなった手紙は、ダイアログに「行き先がありません」と出て、ボタンは閉じるだけ", async ({ page }) => {
  const book = await ready(page)
  await aiPerform(page, {
    action: "@matomezu/base:mail-send",
    args: { from: "a", title: "消えた所", to: { book, ids: ["nothing"] } },
  })
  await page.getByRole("button", { name: "消えた所" }).click()
  const dialog = page.getByRole("dialog", { name: "消えた所" })
  await expect(dialog).toContainText("行き先がありません")
  await expect(dialog.getByRole("button")).toHaveText(["閉じる"])
  await page.keyboard.press("Enter")
  await expect(dialog).toHaveCount(0)
})

test("開くを使わなくても、行き先が画面に出ていれば行き先を見たことになる（郵便そのものは見ていないまま）", async ({
  page,
}) => {
  const book = await ready(page)
  await aiPerform(page, {
    action: "@matomezu/base:mail-send",
    args: { from: "a", title: "今のブック", to: { book } },
  })
  await expect.poll(async () => !!(await mailbox(page))[0]?.visitedAt).toBe(true)
  expect((await mailbox(page))[0]?.seenAt).toBeUndefined()
})

test("しおりに乗せると、待たずに自前の吹き出しで題が出て、離すと消える（標準の title は使わない）", async ({
  page,
}) => {
  await ready(page)
  await aiPerform(page, {
    action: "@matomezu/base:mail-send",
    args: { from: "a", title: "吹き出しの題" },
  })
  const bookmark = page.getByRole("button", { name: "吹き出しの題" })
  await expect(bookmark).toBeVisible()
  await expect(bookmark).not.toHaveAttribute("title", /.+/)
  const tip = page.getByText("吹き出しの題", { exact: true })
  await expect(tip).toBeHidden()
  await bookmark.hover()
  await expect(tip).toBeVisible({ timeout: 300 })
  const [b, t] = [await bookmark.boundingBox(), await tip.boundingBox()]
  expect(t!.y).toBeGreaterThan(b!.y + b!.height)
  await page.mouse.move(10, 400)
  await expect(tip).toBeHidden()
})

test("郵便箱から開いたダイアログは、「閉じる」でも「開く」でも郵便箱を残し、「郵便箱も閉じる」ならダイアログと郵便箱を一緒に閉じる。しおりから開いたときは「郵便箱も閉じる」が出ない", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const book = await ready(page)
  await addBox(page, 300, 300, "行き先の箱")
  const box = (await items(page).filter({ hasText: "行き先の箱" }).getAttribute("data-item"))!
  await aiPerform(page, {
    action: "@matomezu/base:mail-send",
    args: { from: "a", title: "残す", to: { book, ids: [box] } },
  })
  // しおりから開く: 郵便箱は閉じているので「郵便箱も閉じる」は出ない
  await page.getByRole("button", { name: "残す" }).click()
  const dialog = page.getByRole("dialog", { name: "残す" })
  await expect(dialog.getByRole("button")).toHaveText(["閉じる", "開く", "分割で開く"])
  await dialog.getByRole("button", { name: "閉じる" }).click()
  await expect(dialog).toHaveCount(0)
  // 郵便箱から開く
  await (await fromMenu(page, "左サイドパネルを開く")).click()
  await expect(leftPanel(page)).toBeVisible()
  const open = async () => {
    await leftPanel(page).getByRole("listitem").first().getByRole("button").first().click()
    await expect(dialog).toBeVisible()
  }
  await open()
  await expect(dialog.getByRole("button")).toHaveText(["郵便箱も閉じる", "閉じる", "開く", "分割で開く"])
  // 4 つのボタンはダイアログの幅に収まり、1 行に並ぶ
  const boxes = await dialog.getByRole("button").evaluateAll(els => els.map(e => e.getBoundingClientRect()))
  const frame = await dialog.boundingBox()
  expect(new Set(boxes.map(r => Math.round(r.top))).size).toBe(1)
  expect(Math.min(...boxes.map(r => r.left))).toBeGreaterThanOrEqual(frame?.x ?? 0)
  expect(Math.max(...boxes.map(r => r.right))).toBeLessThanOrEqual((frame?.x ?? 0) + (frame?.width ?? 0))
  // 「閉じる」をクリックしても、郵便箱は残る
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(leftPanel(page)).toBeVisible()
  // 「開く」でも、郵便箱は残る
  await open()
  await dialog.getByRole("button", { name: "開く", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(leftPanel(page)).toBeVisible()
  // 「郵便箱も閉じる」で、ダイアログと郵便箱を一緒に閉じる
  await open()
  await dialog.getByRole("button", { name: "郵便箱も閉じる" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(leftPanel(page)).toHaveCount(0)
})

test("「開く」は、行き先のブックを新しいブックスクリーンで開き、見ていたブックのスクリーンは後ろに残る", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const book = await ready(page)
  const other = ((await storedBooks(page.request)) as { id: string }[]).find(b => b.id !== book)?.id
  expect(other).toBeDefined()
  await aiPerform(page, {
    action: "@matomezu/base:mail-send",
    args: { from: "a", title: "別のブック", to: { book: other } },
  })
  await page.getByRole("button", { name: "別のブック" }).click()
  await page.getByRole("dialog", { name: "別のブック" }).getByRole("button", { name: "開く", exact: true }).click()
  // 見ていたブックのスクリーンは閉じずに残り、行き先のブックのスクリーンがカレントスクリーンになる
  await expect.poll(() => urlStages(page)[0]?.b).toBe(other)
  expect(
    urlPlace(page)
      ?.s.filter(x => x.g)
      .map(x => x.g?.l[0]?.b),
  ).toEqual([book, other])
})
