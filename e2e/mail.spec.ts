// 郵便: AI が手紙を送ると、フォーカスのある窓にマーキーが流れ、画面の上からしおりがぶら下がる。フッタの郵便箱のボタン（封筒）に未読の数が出る。
// しおりか郵便箱のボタンで、ブックスクリーンの下の段に郵便箱のスクリーンが開く。受信トレイの行を選ぶと右に本文が見え（見たことになる）、「開く」などで行き先へ移る（行き先を見たことになる）。
// 行き先の物には鳥が来て枠が光る。開いても郵便箱は閉じない。行き先が無ければ「行き先がありません」と出て、行き先のボタンは出ない
import {
  aiAuth,
  BOOK_SCREEN_URL,
  CONTROL_CENTER_URL,
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

// 郵便箱の画面と、その受信トレイの行・選んだ郵便
const mailboxPane = (page: Page) => page.getByRole("region", { name: "郵便箱" })
const rows = (page: Page) => mailboxPane(page).getByRole("listitem")
const letter = (page: Page) => mailboxPane(page).locator("article")
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
  const view = (await (await page.request.get("/api/ai/view", { headers: ai })).json()) as { entry: { id: string } }
  return view.entry.id
}

test("AI が手紙を送るとマーキーとしおりが出て、封筒に未読の数が出る。しおりを押すと下の段に郵便箱が開いてその郵便を選び、開くで行き先の箱を見せ、鳥と光る枠が来て去る。郵便箱は開いたまま。AI はどちらも見たと知れる", async ({
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
      body: "箱を**直しました**",
      to: { book, ids: [box, next] },
    },
  })
  await expect(page.getByRole("status").filter({ hasText: "郵便が届きました: 見てください" })).toBeVisible()
  const bookmark = page.getByRole("button", { name: "見てください", exact: true })
  await expect(bookmark).toBeVisible()
  const count = (await fromMenu(page, "郵便箱")).locator("[data-count]")
  await expect(count).toHaveText("1")
  await page.mouse.move(10, 10)
  await bookmark.click()
  await expect(mailboxPane(page)).toBeVisible()
  await expect(letter(page).getByRole("heading", { name: "見てください" })).toBeVisible()
  await expect(letter(page)).toContainText("D64")
  // 本文はマークダウン
  await expect(letter(page).locator("strong")).toHaveText("直しました")
  // 見たことになり、しおりは消える
  await expect.poll(async () => !!(await mailbox(page))[0]?.seenAt).toBe(true)
  await expect(bookmark).toHaveCount(0)
  // 1 画面なら、開く・分割で開く
  await expect(letter(page).getByRole("button")).toHaveText(["開く", "分割で開く"])
  await letter(page).getByRole("button", { name: "開く", exact: true }).click()
  await expect.poll(async () => !!(await mailbox(page))[0]?.visitedAt).toBe(true)
  await expect(mailboxPane(page)).toBeVisible()
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

test("1 画面で「分割で開く」は、上の段で右に分けたステージに行き先を開く", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const book = await ready(page)
  await addBox(page, 300, 300, "右の箱")
  const box = (await items(page).filter({ hasText: "右の箱" }).getAttribute("data-item"))!
  await aiPerform(page, {
    action: "@matomezu/base:mail-send",
    args: { from: "a", title: "右へ", to: { book, ids: [box] } },
  })
  await page.getByRole("button", { name: "右へ", exact: true }).click()
  await letter(page).getByRole("button", { name: "分割で開く" }).click()
  const stages = page.locator("[data-stage]")
  await expect(stages).toHaveCount(2)
  await expect(stages.nth(1).locator("[data-item]").filter({ hasText: "右の箱" })).toBeVisible()
  await expect(stages.nth(1).locator("[data-mail-bird]")).toBeVisible()
  await expect(mailboxPane(page)).toBeVisible()
})

test("2 画面なら「左に開く」「右に開く」", async ({ page }) => {
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
  await page.getByRole("button", { name: "二つ", exact: true }).click()
  await expect(letter(page).getByRole("button")).toHaveText(["左に開く", "右に開く"])
  await letter(page).getByRole("button", { name: "右に開く" }).click()
  await expect(stages.nth(1).locator("[data-item]").filter({ hasText: "二つの箱" })).toBeVisible()
  await expect(stages.nth(1).locator("[data-mail-bird]")).toBeVisible()
})

test("しおりは古い順に 5 つまで並べ、残りは「ほか n 件」にまとめ、押すと郵便箱が開く。片づけば次が出る。受信トレイは新しい順で、チェックした郵便をゴミ箱から確かめてまとめて消す", async ({
  page,
}) => {
  await ready(page)
  for (const n of [1, 2, 3, 4, 5])
    await aiPerform(page, {
      action: "@matomezu/base:mail-send",
      args: { from: "a", title: `題${n}` },
    })
  for (const n of [1, 2, 3, 4, 5]) await expect(page.getByRole("button", { name: `題${n}`, exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: /^ほか/ })).toHaveCount(0)
  await aiPerform(page, { action: "@matomezu/base:mail-send", args: { from: "a", title: "題6" } })
  const many = page.getByRole("button", { name: "ほか 1 件", exact: true })
  await expect(many).toBeVisible()
  await expect(page.getByRole("button", { name: "題6", exact: true })).toHaveCount(0)
  // 1 通を見て片づけると、次の 1 通が出る
  await page.getByRole("button", { name: "題1", exact: true }).click()
  await expect(page.getByRole("button", { name: "題6", exact: true })).toBeVisible()
  await expect(many).toHaveCount(0)
  await page.getByRole("button", { name: "郵便箱を閉じる" }).click()
  await expect(mailboxPane(page)).toHaveCount(0)
  await aiPerform(page, { action: "@matomezu/base:mail-send", args: { from: "a", title: "題7" } })
  await expect(many).toBeVisible()
  await many.click()
  // 何も選ばずに開く
  await expect(rows(page)).toHaveCount(7)
  await expect(letter(page)).toHaveCount(0)
  // 新しい順。行を押すと右に出る
  await expect(rows(page).first()).toContainText("題7")
  await rows(page).first().getByRole("button").click()
  await expect(letter(page).getByRole("heading", { name: "題7" })).toBeVisible()
  // ゴミ箱は、チェックするまで押せない
  const trash = mailboxPane(page).getByRole("button", { name: "チェックした郵便を消す" })
  await expect(trash).toBeDisabled()
  await mailboxPane(page).getByRole("checkbox", { name: "題1 をチェック" }).check()
  await mailboxPane(page).getByRole("checkbox", { name: "題2 をチェック" }).check()
  await trash.click()
  const asking = page.getByRole("alertdialog", { name: "2 通の郵便を消しますか？" })
  await asking.getByRole("button", { name: "キャンセル" }).click()
  await expect(rows(page)).toHaveCount(7)
  await trash.click()
  await asking.getByRole("button", { name: "消す" }).click()
  await expect(rows(page)).toHaveCount(5)
  await expect(trash).toBeDisabled()
})

test("フッタの封筒で郵便箱を開け閉めし、受信トレイの中では ↑↓ で選ぶ行を移して見たことにし、Esc で閉じる", async ({
  page,
}) => {
  await ready(page)
  for (const n of [1, 2])
    await aiPerform(page, { action: "@matomezu/base:mail-send", args: { from: "a", title: `行${n}` } })
  const envelope = await fromMenu(page, "郵便箱")
  await envelope.click()
  await expect(mailboxPane(page)).toBeVisible()
  await expect(envelope).toHaveAttribute("aria-pressed", "true")
  await rows(page).first().getByRole("button").click()
  await expect(letter(page).getByRole("heading", { name: "行2" })).toBeVisible()
  await page.keyboard.press("ArrowDown")
  await expect(letter(page).getByRole("heading", { name: "行1" })).toBeVisible()
  await expect.poll(async () => (await mailbox(page)).every(m => !!m.seenAt)).toBe(true)
  await page.keyboard.press("Escape")
  await expect(mailboxPane(page)).toHaveCount(0)
  await (await fromMenu(page, "郵便箱")).click()
  await expect(mailboxPane(page)).toBeVisible()
  await (await fromMenu(page, "郵便箱")).click()
  await expect(mailboxPane(page)).toHaveCount(0)
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
  await userAction(
    "@matomezu/base:participant-accept",
    { newWorkroom: { name: "郵便を送る部屋", bird: "inko", palette: "orange" } },
    { record: participant },
  )
  const ai = { ...aiAuth(), "X-Matomezu-Participant": participant }
  const send = async (title: string) => {
    const response = await page.request.post("/api/ai/perform", {
      headers: ai,
      data: { action: "@matomezu/base:mail-send", args: { from: "同じ表示名", title } },
    })
    expect(await response.json()).toMatchObject({ ok: true })
  }
  await userAction("@matomezu/base:mail-send", { from: "同じ表示名", title: "封筒の郵便" })
  const envelope = page.getByRole("button", { name: "封筒の郵便", exact: true })
  await expect(envelope.locator("svg")).toBeVisible()
  const background = "background-color"
  const envelopeColor = await envelope.evaluate(node => getComputedStyle(node).backgroundColor)

  await send("鳥の郵便")
  const bird = page.getByRole("button", { name: "鳥の郵便", exact: true })
  await expect(bird.locator("img")).toBeVisible()
  const birdColor = "rgb(239, 138, 50)" // 送り手が選んだ配色の旗の色
  await expect(bird).toHaveCSS(background, birdColor)
  await send("もう一通の鳥の郵便")
  await expect(page.getByRole("button", { name: "もう一通の鳥の郵便", exact: true }).locator("img")).toBeVisible()
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

test("行き先の無くなった手紙は、郵便箱に「行き先がありません」と出て、行き先のボタンは出ない", async ({ page }) => {
  const book = await ready(page)
  await aiPerform(page, {
    action: "@matomezu/base:mail-send",
    args: { from: "a", title: "消えた所", to: { book, ids: ["nothing"] } },
  })
  await page.getByRole("button", { name: "消えた所", exact: true }).click()
  await expect(letter(page)).toContainText("行き先がありません")
  await expect(letter(page).getByRole("button")).toHaveCount(0)
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
  const bookmark = page.getByRole("button", { name: "吹き出しの題", exact: true })
  await expect(bookmark).toBeVisible()
  await expect(bookmark).not.toHaveAttribute("title", /.+/)
  // 受信トレイ（コントロールセンターの、隠した郵便箱の画面）の行は数えない
  const tip = page.getByText("吹き出しの題", { exact: true }).filter({ visible: true })
  await expect(tip).toBeHidden()
  await bookmark.hover()
  await expect(tip).toBeVisible({ timeout: 300 })
  const [b, t] = [await bookmark.boundingBox(), await tip.boundingBox()]
  expect(t!.y).toBeGreaterThan(b!.y + b!.height)
  await page.mouse.move(10, 400)
  await expect(tip).toBeHidden()
})

test("「開く」は、行き先のブックを上の段に新しいブックスクリーンで開き、見ていたブックのスクリーンは後ろに残る。郵便箱は下の段のまま", async ({
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
  await page.getByRole("button", { name: "別のブック", exact: true }).click()
  await letter(page).getByRole("button", { name: "開く", exact: true }).click()
  // 見ていたブックのスクリーンは閉じずに残り、行き先のブックのスクリーンがカレントスクリーンになる
  await expect.poll(() => urlStages(page)[0]?.b).toBe(other)
  expect(
    urlPlace(page)
      ?.s.filter(x => x.g)
      .map(x => x.g?.l[0]?.b),
  ).toEqual([book, other])
  await expect(mailboxPane(page)).toBeVisible()
})

test("フッタの封筒で郵便箱のスクリーンを開くと、コンテンツエリアに郵便箱を出していたコントロールセンターはプロジェクトに戻る。戻る 1 回で両方が戻る", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const book = ((await storedBooks(page.request)) as { id: string }[])[0]?.id
  await page.goto(CONTROL_CENTER_URL)
  await page.bringToFront()
  await aiPerform(page, { action: "@matomezu/base:mail-send", args: { from: "a", title: "行き先", to: { book } } })
  const tile = (name: string) => page.getByRole("button", { name, exact: true }).filter({ visible: true }).first()
  const panes = mailboxPane(page).locator("visible=true")
  // コンテンツエリアに郵便箱を出し、郵便の行き先を窓いっぱいに開いて、フッタの封筒で郵便箱のスクリーンを出す
  await tile("郵便箱").click()
  await panes
    .getByRole("listitem")
    .getByRole("button", { name: /行き先/ })
    .first()
    .click()
  await panes.locator("article").getByRole("button", { name: "開く", exact: true }).click()
  await expect(panes).toHaveCount(0)
  await (await fromMenu(page, "郵便箱")).click()
  await expect(panes).toHaveCount(1)
  // 戻る 1 回で、郵便箱のスクリーンが閉じ、コントロールセンターのコンテンツエリアも郵便箱のまま
  await page.goBack()
  await expect(panes).toHaveCount(0)
  await (await fromMenu(page, "コントロールセンター")).click()
  await expect(tile("郵便箱")).toHaveAttribute("aria-pressed", "true")
  // もう一度開いた所から封筒を押すと、コントロールセンターはプロジェクトに戻る
  await page.goBack()
  await (await fromMenu(page, "郵便箱")).click()
  await expect(panes).toHaveCount(1)
  await page.getByRole("button", { name: "郵便箱を閉じる" }).filter({ visible: true }).click()
  await (await fromMenu(page, "コントロールセンター")).click()
  await expect(tile("郵便箱")).toHaveAttribute("aria-pressed", "false")
  await expect(tile("プロジェクト")).toHaveAttribute("aria-pressed", "true")
})
