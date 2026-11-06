import { aiAuth, expect, type Page, test } from "./fixtures"
import { addList, addRow } from "./helpers/list"
import { panel, writeNote } from "./helpers/note"
import { leftPanel, openOutbox } from "./helpers/outbox"
import { addBox, items } from "./helpers/paper"

const stands = (page: Page) => page.locator("[data-stand]")

test("箱の右クリックの「AIに伝言」で右サイドパネルが開き、書いて付けると文の始めだけの吹き出しで出る。押すと右サイドパネルに出て、文を直して再送できる。消すと無くなる", async ({
  page,
}) => {
  await page.goto("/")
  await addBox(page, 200, 150, "一")
  const box = items(page).filter({ hasText: "一" })
  await box.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに伝言" }).click()
  const text = panel(page).getByLabel("伝言", { exact: true })
  await expect(text).toBeFocused()
  // 付ける先は名前のバッジで出る（カレントは押されている見た目）
  await expect(panel(page).getByRole("button", { name: "一" })).toHaveAttribute("aria-pressed", "true")
  const add = panel(page).getByRole("button", { name: "付ける" })
  await expect(add).toBeDisabled()
  await text.fill("ここを直してほしい、二行目まで読んでから\n三行目")
  await add.click()
  await expect(panel(page)).toHaveCount(0)

  // 吹き出しは文の始めの 20 字と …
  const bubble = page.getByRole("button", { name: "伝言を開く" })
  await expect(bubble).toHaveText("ここを直してほしい、二行目まで読んでから…")
  await bubble.click()
  const field = panel(page).getByLabel("伝言", { exact: true })
  await expect(field).toHaveValue("ここを直してほしい、二行目まで読んでから\n三行目")
  const save = panel(page).getByRole("button", { name: "再送" })
  await expect(save).toBeDisabled()
  await field.fill("短く")
  await save.click()
  await expect(panel(page)).toHaveCount(0)
  await expect(bubble).toHaveText("短く")
  await bubble.click()
  await panel(page).getByRole("button", { name: "消す" }).click()
  await expect(stands(page)).toHaveCount(0)
  await expect(panel(page)).toHaveCount(0)
})

test("書いている間は、物を押すと付ける先が替わり、Ctrl+クリックで足す（押しても物は動かない）。バッジを押すとカレントが替わる。付けた伝言を開いて付ける先を変えて再送できる。何も無い所を押すと付ける先と選択が外れるが、閉じない（書きかけは残る）", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  await addBox(page, 100, 150, "一")
  await addBox(page, 400, 150, "二")
  const one = items(page).filter({ hasText: "一" })
  const two = items(page).filter({ hasText: "二" })
  await one.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに伝言" }).click()
  const badge = (name: string) => panel(page).getByRole("button", { name, exact: true })
  await panel(page).getByLabel("伝言", { exact: true }).fill("両方")
  const before = (await two.boundingBox())!
  await two.click()
  await expect(badge("二")).toHaveAttribute("aria-pressed", "true")
  await expect(badge("一")).toHaveCount(0)
  const after = (await two.boundingBox())!
  expect(Math.round(after.width)).toBe(Math.round(before.width))
  await page.keyboard.down("Control")
  await one.click()
  await page.keyboard.up("Control")
  await expect(badge("一")).toHaveAttribute("aria-pressed", "true")
  await expect(badge("二")).toHaveAttribute("aria-pressed", "false")
  await badge("二").click()
  await expect(badge("二")).toHaveAttribute("aria-pressed", "true")
  // 書きかけは付ける先を替えても残る
  await expect(panel(page).getByLabel("伝言", { exact: true })).toHaveValue("両方")
  await panel(page).getByRole("button", { name: "付ける" }).click()
  await expect(panel(page)).toHaveCount(0)
  await expect(one).toHaveAttribute("data-selected", "false")
  // 吹き出しはカレント（二）のそば
  const bubble = page.getByRole("button", { name: "伝言を開く" })
  const b = (await bubble.boundingBox())!
  const t = (await two.boundingBox())!
  expect(b.x).toBeGreaterThan(t.x + t.width - 1)
  // 付けた伝言を開くと、付けた先を選んだ状態になる。一だけにして再送すると、吹き出しは一のそばへ
  await bubble.click()
  await expect(badge("一")).toBeVisible()
  await one.click()
  await expect(badge("二")).toHaveCount(0)
  await panel(page).getByRole("button", { name: "再送" }).click()
  await expect(panel(page)).toHaveCount(0)
  const o = (await one.boundingBox())!
  const moved = (await bubble.boundingBox())!
  expect(Math.abs(moved.x - (o.x + o.width))).toBeLessThan(40)
  // 何も無い所を押すと、付ける先と選択が外れるが閉じない。書きかけは残り、付ける先が無いので付けられない
  await two.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに伝言" }).click()
  await panel(page).getByRole("textbox").fill("書きかけ")
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  await page.mouse.click(paper.x + 30, paper.y + 500)
  await expect(two).toHaveAttribute("data-selected", "false")
  await expect(panel(page).getByRole("textbox")).toHaveValue("書きかけ")
  await expect(panel(page).getByRole("button", { name: "付ける" })).toBeDisabled()
  await page.keyboard.press("Escape")
  await expect(panel(page)).toHaveCount(0)
  await expect(bubble).toHaveCount(1)
})

test("書いている間は Esc で付けずに閉じる", async ({ page }) => {
  await page.goto("/")
  await addBox(page, 200, 150, "一")
  const box = items(page).filter({ hasText: "一" })
  await box.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに伝言" }).click()
  await panel(page).getByLabel("伝言", { exact: true }).fill("やめる")
  await panel(page).getByLabel("伝言", { exact: true }).press("Escape")
  await expect(panel(page)).toHaveCount(0)
  await expect(page.getByRole("button", { name: "伝言を開く" })).toHaveCount(0)
})

test("書いている間は付ける先に鳥が出て、付ける先を足すと鳥も増える。鳥を押すと「外す？」が出て、「はい」で付ける先から外れる。最後の 1 羽を外すと閉じる", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  await addBox(page, 100, 150, "一")
  await addBox(page, 400, 150, "二")
  const one = items(page).filter({ hasText: "一" })
  const two = items(page).filter({ hasText: "二" })
  await one.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに伝言" }).click()
  const birds = page.locator("[data-note-bird]")
  await expect(birds).toHaveCount(1)
  await page.keyboard.down("Control")
  await two.click()
  await page.keyboard.up("Control")
  await expect(birds).toHaveCount(2)
  const badge = (name: string) => panel(page).getByRole("button", { name, exact: true })
  await page.locator("[data-note-bird]").first().click()
  await page.getByRole("group", { name: "外す？" }).getByRole("button", { name: "はい" }).click()
  await expect(badge("一")).toHaveCount(0)
  await expect(badge("二")).toHaveAttribute("aria-pressed", "true")
  await expect(birds).toHaveCount(1)
  await birds.first().click()
  await page.getByRole("group", { name: "外す？" }).getByRole("button", { name: "はい" }).click()
  await expect(panel(page)).toHaveCount(0)
  await expect(birds).toHaveCount(0)
})

test("書いている間に別の伝言の吹き出しを押すと、吹き出しの物を押したのと同じに付ける先が替わり、書きかけは残る。Ctrl+クリックなら足す", async ({
  page,
}) => {
  await page.goto("/")
  await addBox(page, 100, 150, "一")
  await addBox(page, 400, 150, "二")
  const one = items(page).filter({ hasText: "一" })
  const two = items(page).filter({ hasText: "二" })
  await writeNote(page, one, "前の伝言")
  await two.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに伝言" }).click()
  const text = panel(page).getByLabel("伝言", { exact: true })
  await text.fill("書きかけ")
  const badge = (name: string) => panel(page).getByRole("button", { name, exact: true })
  const bubble = page.getByRole("button", { name: "伝言を開く" })
  await bubble.click()
  await expect(badge("一")).toHaveAttribute("aria-pressed", "true")
  await expect(badge("二")).toHaveCount(0)
  await expect(text).toHaveValue("書きかけ")
  await two.click()
  await page.keyboard.down("Control")
  await bubble.click()
  await page.keyboard.up("Control")
  await expect(badge("一")).toHaveAttribute("aria-pressed", "true")
  await expect(badge("二")).toHaveCount(1)
  await expect(text).toHaveValue("書きかけ")
})

test("表示領域より高いリストを付ける先にすると、リストの上の辺に乗る鳥が切れない所まで見せる", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  const list = await addList(page, "多い")
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) await addRow(page, list, `行 ${n}`)
  await page.setViewportSize({ width: 1200, height: 230 })
  await list.getByRole("listitem").nth(6).click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに伝言" }).click()
  await expect(panel(page)).toBeVisible()
  // 見出しを押すと付ける先がリストになり、鳥はリストの上の辺に移る
  await list.getByText("多い").first().click()
  const bird = page.getByRole("button", { name: "伝言の鳥" })
  await expect
    .poll(async () => {
      const b = await bird.boundingBox()
      const l = await list.boundingBox()
      return !!b && !!l && b.y >= 0 && Math.abs(b.y + b.height - l.y) < 4
    })
    .toBe(true)
})

test("付ける先がいくつかあるときは、カレントの物に明るい枠が重なる（1 つなら出さない）。カレントを替えると枠も移る", async ({
  page,
}) => {
  await page.goto("/")
  await addBox(page, 200, 150, "一")
  await addBox(page, 500, 150, "二")
  const one = items(page).filter({ hasText: "一" })
  const two = items(page).filter({ hasText: "二" })
  await one.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに伝言" }).click()
  const frame = page.locator("[data-anchor-frame]")
  await expect(frame).toHaveCount(0)
  await two.click({ modifiers: ["ControlOrMeta"] })
  await expect(frame).toHaveCount(1)
  const near = async (thing: typeof one) => {
    const f = (await frame.boundingBox())!
    const t = (await thing.boundingBox())!
    return Math.abs(f.x - t.x) < 4 && Math.abs(f.y - t.y) < 4
  }
  await expect.poll(() => near(two)).toBe(true)
  await panel(page).getByRole("button", { name: "一", exact: true }).click()
  await expect.poll(() => near(one)).toBe(true)
})

test("リストの行に付けた伝言の吹き出しは、リストの幅を変えると行の右に付いて動く", async ({ page }) => {
  await page.goto("/")
  const list = await addList(page, "多い")
  await addRow(page, list, "行 1")
  await writeNote(page, list.getByRole("listitem").first(), "見て")
  const bubble = page.getByRole("button", { name: "伝言を開く" })
  const row = list.getByRole("listitem").first()
  const beside = async () => {
    const b = (await bubble.boundingBox())!
    const r = (await row.boundingBox())!
    return b.x - (r.x + r.width)
  }
  const gap = await beside()
  await list.getByText("多い").first().click()
  const grip = (await list.locator('[data-grip="right"]').boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x + grip.width / 2 + 120, grip.y + grip.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => (await row.boundingBox())!.width).toBeGreaterThan(200)
  await expect.poll(async () => Math.abs((await beside()) - gap)).toBeLessThan(2)
})

test("読まれていない伝言は、箱の上の辺が画面の外に出ると、吹き出しが縁のマークポインタ（丸の中に伝言の絵）に替わり、押すと箱が見えて吹き出しに戻る。AI が読んだ伝言は縁に出ない", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 900, height: 480 })
  const ai = aiAuth()
  await page.goto("/")
  await page.bringToFront()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toHaveProperty("stage")
  const { book } = (await (await page.request.get("/api/ai/view", { headers: ai })).json()) as { book: string }
  await addBox(page, 200, 150, "一")
  await writeNote(page, items(page).filter({ hasText: "一" }), "読んで")
  const bubble = page.getByRole("button", { name: "伝言を開く" })
  await expect(bubble).toHaveText("読んで")
  const stage = (await page.locator("[data-stage]").boundingBox())!
  const away = async () => {
    await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height - 20)
    await page.mouse.wheel(0, 300)
  }
  await away()
  const pointer = page.getByRole("button", { name: "一を見せる" })
  await expect(pointer).toHaveCount(1)
  await expect(bubble).toHaveCount(0)
  const s = (await pointer.boundingBox())!
  expect(s.width).toBe(24)
  expect(Math.abs(s.y - stage.y - 4)).toBeLessThan(2) // 画面の上の縁に付く
  await pointer.click()
  await expect(bubble).toHaveText("読んで")
  await expect(pointer).toHaveCount(0)
  // AI が読むと緑の丸のチェックに替わり、画面の外に出ても縁に出ない
  const note = (
    (await (await page.request.get(`/api/ai/books/${book}`, { headers: ai })).json()).annotations as { id: string }[]
  )[0]!.id
  await page.request.post("/api/ai/perform", {
    headers: ai,
    data: { action: "@matomezu/base:note-read", args: { note }, on: { book } },
  })
  await expect(bubble).toHaveAttribute("data-read", "true")
  await away()
  await expect(page.getByRole("button", { name: "一を見せる" })).toHaveCount(0)
  await expect(bubble).toHaveCount(0) // チェックの丸も、縁に寄せて残さない
})

test("同じ物に既読の伝言が 2 つ以上あれば、チェックを 2 つ重ねて 1 つにまとめ、押すと右サイドパネルに新しい順に並ぶ。古い伝言の別の場所のバッジで、その物が見える", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 900, height: 480 })
  const ai = aiAuth()
  await page.goto("/")
  await page.bringToFront()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toHaveProperty("stage")
  const { book } = (await (await page.request.get("/api/ai/view", { headers: ai })).json()) as { book: string }
  await addBox(page, 200, 150, "二")
  await addBox(page, 420, 150, "遠く")
  const two = items(page).filter({ hasText: "二" })
  const far = items(page).filter({ hasText: "遠く" })
  // 古い伝言は遠くと二に（二をカレントにして、チェックは二に出る）、新しい伝言は二だけに
  await two.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに伝言" }).click()
  await page.keyboard.down("Control")
  await far.click()
  await page.keyboard.up("Control")
  await panel(page).getByRole("button", { name: "二", exact: true }).click()
  await panel(page).getByLabel("伝言", { exact: true }).fill("古い")
  await panel(page).getByRole("button", { name: "付ける" }).click()
  await expect(panel(page)).toHaveCount(0)
  const readAll = async () => {
    const notes = (await (await page.request.get(`/api/ai/books/${book}`, { headers: ai })).json()).annotations as {
      id: string
      props: { readAt?: string }
    }[]
    for (const n of notes.filter(n => !n.props.readAt))
      await page.request.post("/api/ai/perform", {
        headers: ai,
        data: { action: "@matomezu/base:note-read", args: { note: n.id }, on: { book } },
      })
  }
  await readAll()
  const checks = page.locator("[data-read-count]")
  await expect(checks).toHaveAttribute("data-read-count", "one")
  await writeNote(page, two, "新しい")
  await readAll()
  await expect(checks).toHaveCount(1)
  await expect(checks).toHaveAttribute("data-read-count", "many")
  await checks.click()
  const notes = panel(page).locator("[data-note]")
  await expect(notes).toHaveCount(2)
  await expect(notes.nth(0).getByLabel("伝言", { exact: true })).toHaveValue("新しい")
  await expect(notes.nth(1).getByLabel("伝言", { exact: true })).toHaveValue("古い")
  await expect(notes.nth(0).getByRole("button", { name: "再送" })).toBeVisible()
  // 紙をずらして遠くの箱を画面の外へ出し、古い伝言の「遠く」のバッジで、遠くの箱が画面に入る
  const stage = (await page.locator("[data-stage]").boundingBox())!
  const inside = async () => {
    const b = (await far.boundingBox())!
    return (
      b.x > stage.x && b.x + b.width < stage.x + stage.width && b.y > stage.y && b.y + b.height < stage.y + stage.height
    )
  }
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height - 20)
  await page.mouse.wheel(0, 300)
  await expect.poll(inside).toBe(false)
  await notes.nth(1).getByRole("button", { name: "遠く", exact: true }).click()
  await expect
    .poll(async () => {
      const b = (await far.boundingBox())!
      return (
        b.x > stage.x &&
        b.x + b.width < stage.x + stage.width &&
        b.y > stage.y &&
        b.y + b.height < stage.y + stage.height
      )
    })
    .toBe(true)
})

test("送信トレイから古い既読の伝言を開くと、同じ物の既読の伝言が並び、その伝言までスクロールする。開いた伝言を消すと、次に新しい伝言で開いたまま。たたんだ伝言の絵はチェックと重ならない", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 900, height: 480 })
  const ai = aiAuth()
  await page.goto("/")
  await page.bringToFront()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toHaveProperty("stage")
  const { book } = (await (await page.request.get("/api/ai/view", { headers: ai })).json()) as { book: string }
  await addBox(page, 200, 150, "二")
  const two = items(page).filter({ hasText: "二" })
  const readAll = async () => {
    const notes = (await (await page.request.get(`/api/ai/books/${book}`, { headers: ai })).json()).annotations as {
      id: string
      props: { readAt?: string }
    }[]
    for (const n of notes.filter(n => !n.props.readAt))
      await page.request.post("/api/ai/perform", {
        headers: ai,
        data: { action: "@matomezu/base:note-read", args: { note: n.id }, on: { book } },
      })
  }
  await writeNote(page, two, "古い")
  await readAll()
  // 新しい伝言は長くして、右サイドパネルに 2 つが収まらないようにする
  await writeNote(page, two, Array.from({ length: 16 }, (_, i) => `新しい ${i + 1}`).join("\n"))
  await readAll()
  const checks = page.locator("[data-read-count]")
  await expect(checks).toHaveAttribute("data-read-count", "many")

  // 送信トレイの古い伝言の行（下）を押すと、2 つ並び、古い伝言が付ける先のバッジを持ち、そこまでスクロールしている
  await openOutbox(page)
  await leftPanel(page).getByRole("listitem").nth(1).getByRole("button").first().click()
  const notes = panel(page).locator("[data-note]")
  await expect(notes).toHaveCount(2)
  await expect(notes.nth(1).getByLabel("伝言", { exact: true })).toHaveValue("古い")
  await expect(notes.nth(1).getByRole("button", { name: "二", exact: true })).toHaveAttribute("aria-pressed", "true")
  const scrolled = () =>
    notes.nth(1).evaluate(el => {
      let box = el.parentElement
      while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement
      return box?.scrollTop ?? 0
    })
  await expect.poll(scrolled).toBeGreaterThan(0)
  await expect(notes.nth(1)).toBeInViewport()
  await page.keyboard.press("Escape")
  await expect(panel(page)).toHaveCount(0)

  // チェックから開いて最新の伝言を消すと、古い伝言で開いたまま。チェックは 1 つに戻る
  await checks.click()
  await expect(notes).toHaveCount(2)
  await notes.nth(0).getByRole("button", { name: "消す" }).click()
  await expect(notes).toHaveCount(1)
  await expect(notes.nth(0).getByLabel("伝言", { exact: true })).toHaveValue("古い")
  await expect(checks).toHaveAttribute("data-read-count", "one")
  await page.keyboard.press("Escape")
  await expect(panel(page)).toHaveCount(0)

  // 未読の伝言をたたむと、絵はチェックと重ならずに並ぶ
  await writeNote(page, two, "たたむ")
  await page.getByRole("button", { name: "伝言を開く" }).and(page.locator(":not([data-read])")).first().click()
  await panel(page).getByRole("button", { name: "たたむ" }).click()
  await page.keyboard.press("Escape")
  await expect(panel(page)).toHaveCount(0)
  const folded = page.getByRole("button", { name: "伝言を開く" }).and(page.locator(":not([data-read])"))
  await expect(folded).toHaveCount(1)
  const f = (await folded.boundingBox())!
  const c = (await checks.boundingBox())!
  expect(f.x + f.width <= c.x || c.x + c.width <= f.x || f.y + f.height <= c.y || c.y + c.height <= f.y).toBe(true)
})
