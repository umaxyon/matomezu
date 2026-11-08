import { aiAuth, BOOK_SCREEN_URL, expect, type Page, test } from "./fixtures"
import { browserMenuStopped } from "./helpers/browser-menu"
import { addList, addRow } from "./helpers/list"
import { panel, writeNote } from "./helpers/note"
import { addBox, items, settled } from "./helpers/paper"
import { openGeneral, settingsDialog } from "./helpers/settings"
import { fromMenu } from "./helpers/stage-menu"

const stands = (page: Page) => page.locator("[data-stand]")

test("箱の右クリックの「AIに伝言」で右サイドパネルが開き、書いて付けると文の始めだけの吹き出しで出る。押すと右サイドパネルに出て、文を直して再送できる。消すと無くなる", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
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
  await page.goto(BOOK_SCREEN_URL)
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

test("伝言の吹き出しと、たたんだ伝言の角の絵の右クリックでは、ブラウザのメニューも紙のメニューも出さない", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await addBox(page, 200, 150, "一")
  await writeNote(page, items(page).filter({ hasText: "一" }), "右クリック")
  const bubble = page.getByRole("button", { name: "伝言を開く" })
  expect(await browserMenuStopped(bubble)).toBe(true)
  await bubble.click({ button: "right" })
  await expect(page.getByRole("menu")).toHaveCount(0)
  await bubble.click()
  await panel(page).getByRole("button", { name: "隠す" }).click()
  const folded = page.locator("button[data-note]")
  await expect(folded).toHaveCount(1)
  expect(await browserMenuStopped(folded)).toBe(true)
  await folded.click({ button: "right" })
  await expect(page.getByRole("menu")).toHaveCount(0)
})

test("吹き出しに乗せると上に「隠す」が出て、はいで角の伝言の絵になる。絵に乗せると「表示」「消す」が出て、表示で吹き出しに戻り、消すで無くなる", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await addBox(page, 200, 150, "一")
  await writeNote(page, items(page).filter({ hasText: "一" }), "隠す")
  const bubble = page.getByRole("group", { name: "伝言", exact: true }).getByRole("button", { name: "伝言を開く" })
  await bubble.hover()
  const hide = page.getByRole("group", { name: "隠す" })
  await expect(hide).toBeVisible()
  // 右端を吹き出しの右端にそろえ、吹き出しの上に出す
  const b = (await bubble.boundingBox())!
  const h = (await hide.boundingBox())!
  expect(h.y + h.height).toBeLessThanOrEqual(b.y)
  expect(Math.abs(h.x + h.width - (b.x + b.width))).toBeLessThan(12)
  await hide.getByRole("button", { name: "はい" }).click()
  await expect(bubble).toHaveCount(0)
  const folded = page.locator("button[data-note]")
  await expect(folded).toHaveCount(1)

  await folded.hover()
  await page.getByRole("group", { name: "表示" }).getByRole("button", { name: "はい" }).click()
  await expect(bubble).toBeVisible()
  await expect(folded).toHaveCount(0)

  await bubble.hover()
  await page.getByRole("group", { name: "隠す" }).getByRole("button", { name: "はい" }).click()
  await folded.hover()
  await page.getByRole("group", { name: "消す" }).getByRole("button", { name: "はい" }).click()
  await expect(stands(page)).toHaveCount(0)
})

test("吹き出しは右に入らなくても左に回さず、物にも重ねない。尾の先は物の右の端のまま、画面の右の端に押されて幅が縮む。縮めきれなければ縁のマークポインタになり、押すと箱が見えて吹き出しに戻る", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await addBox(page, 200, 150, "一")
  const box = items(page).filter({ hasText: "一" })
  await writeNote(page, box, "右の端")
  const bubble = page.getByRole("group", { name: "伝言", exact: true }).getByRole("button", { name: "伝言を開く" })
  await expect(bubble).toBeVisible()
  const stage = page.locator("[data-stage]")
  // 窓の幅を変えて、箱の右の辺からステージの右の端までを room にする（ステージは窓の幅に比例しないので、測って詰める。箱も動くので、合うまで繰り返す）
  const roomTo = async (room: number) => {
    await expect(async () => {
      const b = (await box.boundingBox())!
      const e = (await stage.boundingBox())!
      const over = Math.round(e.x + e.width - (b.x + b.width) - room)
      if (Math.abs(over) > 2) {
        const v = page.viewportSize()!
        await page.setViewportSize({ width: v.width - over, height: v.height })
      }
      expect(Math.abs(over)).toBeLessThanOrEqual(2)
    }).toPass()
  }
  // 箱の右に吹き出しが入らない（180px より狭い）: 吹き出しの左の端は箱の右のまま、右の端が画面の右の端に押されて縮む
  await roomTo(130)
  await expect
    .poll(async () => {
      const r = (await bubble.boundingBox())!
      const e = (await stage.boundingBox())!
      return Math.round(e.x + e.width - (r.x + r.width))
    })
    .toBeLessThanOrEqual(6)
  const r = (await bubble.boundingBox())!
  const nb = (await box.boundingBox())!
  expect(r.width).toBeLessThan(180)
  expect(r.x).toBeGreaterThanOrEqual(nb.x + nb.width)
  // 尾の先は箱の右の端に届く（箱の上に伸びて重ならない）
  const tail = (await bubble.locator("svg").first().boundingBox())!
  expect(tail.x).toBeLessThan(r.x)
  expect(tail.x).toBeGreaterThanOrEqual(nb.x + nb.width - 8)

  // いちばん細い吹き出しより狭くすると、縁のマークポインタになる
  await roomTo(60)
  const pointer = page.getByRole("button", { name: "一を見せる" })
  await expect(pointer).toHaveCount(1)
  await expect(bubble).toHaveCount(0)
  await pointer.click()
  await expect(bubble).toBeVisible()
  await expect(pointer).toHaveCount(0)
})

test("書いている間は Esc で付けずに閉じる", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
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
  await page.goto(BOOK_SCREEN_URL)
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
  await page.goto(BOOK_SCREEN_URL)
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
  await page.goto(BOOK_SCREEN_URL)
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
  await page.goto(BOOK_SCREEN_URL)
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
  await page.goto(BOOK_SCREEN_URL)
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

test("分けた左のステージのリストの行の伝言は、右サイドパネルを開いてステージが広がっても、閉じて狭まっても、行の右に付いたまま", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 700 })
  await page.goto(BOOK_SCREEN_URL)
  const list = await addList(page, "多い")
  await addRow(page, list, "行 1")
  const row = list.getByRole("listitem").first()
  await writeNote(page, row, "見て")
  await (await fromMenu(page, "画面を分割")).click()
  const bubble = page.getByRole("button", { name: "伝言を開く" })
  // 吹き出しの左の端と、行の右の端の差（行の右に付いていれば、すき間の分だけ正）
  const beside = async () =>
    (await bubble.boundingBox())!.x - ((await row.boundingBox())!.x + (await row.boundingBox())!.width)
  await expect.poll(beside).toBeGreaterThan(0)
  await bubble.click()
  await expect(panel(page)).toBeVisible()
  await expect.poll(beside).toBeGreaterThan(0)
  await panel(page).getByRole("button", { name: "右サイドパネルを閉じる" }).click()
  await expect(panel(page)).toHaveCount(0)
  // ステージの幅が縮み終えたあとも、行の右に付き直す（縮む途中の幅で置いたまま残らない）
  await expect.poll(beside).toBeGreaterThan(0)
})

test("分けたステージの境目を左へドラッグして左のステージを狭めると、伝言の吹き出しは右の端に押されて縮み、入らなくなると縁のマークポインタになる。戻すと吹き出しに戻る", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 700 })
  await page.goto(BOOK_SCREEN_URL)
  await addBox(page, 200, 150, "一")
  const box = items(page).filter({ hasText: "一" })
  await writeNote(page, box, "境目に押される")
  await (await fromMenu(page, "画面を分割")).click()
  const bubble = page.getByRole("group", { name: "伝言", exact: true }).getByRole("button", { name: "伝言を開く" })
  const pointer = page.getByRole("button", { name: "一を見せる" })
  await expect(bubble).toBeVisible()
  const full = (await bubble.boundingBox())!.width
  const divider = page.locator("[data-divider]")
  // 境目を、箱の右の端から dx の所へドラッグする
  const dragTo = async (dx: number) => {
    const d = (await divider.boundingBox())!
    const b = (await box.boundingBox())!
    await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width + dx, d.y + d.height / 2, { steps: 5 })
    await page.mouse.up()
  }
  await dragTo(120)
  await expect.poll(async () => (await bubble.boundingBox())?.width ?? 0).toBeLessThan(full)
  const b = (await box.boundingBox())!
  expect((await bubble.boundingBox())!.x).toBeGreaterThanOrEqual(b.x + b.width)
  await dragTo(50)
  await expect(pointer).toHaveCount(1)
  await expect(bubble).toHaveCount(0)
  await divider.dblclick()
  await expect(bubble).toBeVisible()
  await expect(pointer).toHaveCount(0)
})

test("物がステージより広く、見せても吹き出しが入らない間は、縁のマークポインタを押すと伝言が右サイドパネルに開く", async ({
  page,
}) => {
  await page.setViewportSize({ width: 600, height: 600 })
  await page.goto(BOOK_SCREEN_URL)
  await addBox(page, 100, 150, "横に長い見出しの箱です、とても長い見出しの箱です")
  const box = items(page).filter({ hasText: "横に長い" })
  await writeNote(page, box, "広い物")
  const stage = page.locator("[data-stage]")
  const pointer = stage.locator("[data-mark-pointer]")
  // 箱の上で拡大して、箱の幅をステージの幅に近づける
  await expect(async () => {
    const b = (await box.boundingBox())!
    await page.mouse.move(b.x + b.width / 2, b.y + 10)
    await page.keyboard.down("Control")
    await page.mouse.wheel(0, -100)
    await page.keyboard.up("Control")
    await expect(pointer).toHaveAccessibleName("伝言を開く", { timeout: 500 })
  }).toPass()
  // 拡大し終えて止まってから押す
  await settled(page, box)
  await expect(pointer).toHaveAccessibleName("伝言を開く")
  await pointer.click()
  await expect(panel(page).getByLabel("伝言", { exact: true })).toHaveValue("広い物")
})

test("読まれていない伝言は、箱の上の辺が画面の外に出ると、吹き出しが縁のマークポインタ（丸の中に伝言の絵）に替わり、押すと箱が見えて吹き出しに戻る。AI が読んだ伝言は縁に緑の丸のチェックを出す", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 900, height: 480 })
  const ai = aiAuth()
  await page.goto(BOOK_SCREEN_URL)
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
  // 縁には緑の丸のチェックのマークポインタ。押すと箱が見えて角のチェックに戻る
  const read = page.getByRole("button", { name: "一を見せる" })
  await expect(read).toHaveCount(1)
  await expect(read.locator("[data-read-check]")).toHaveCount(1)
  await expect(bubble).toHaveCount(0)
  await read.click()
  await expect(bubble).toHaveAttribute("data-read", "true")
  await expect(read).toHaveCount(0)
})

test("リストの行に付けた AI が読んだ伝言も、リストが画面の左の外に出ると、縁に緑の丸のチェックが残る", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const ai = aiAuth()
  await page.setViewportSize({ width: 560, height: 480 })
  await page.goto(BOOK_SCREEN_URL)
  await page.bringToFront()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toHaveProperty("stage")
  const { book } = (await (await page.request.get("/api/ai/view", { headers: ai })).json()) as { book: string }
  const list = await addList(page, "行のリスト")
  await addRow(page, list, "行 1")
  await writeNote(page, list.getByRole("listitem").first(), "読んで")
  const note = (
    (await (await page.request.get(`/api/ai/books/${book}`, { headers: ai })).json()).annotations as { id: string }[]
  )[0]!.id
  await page.request.post("/api/ai/perform", {
    headers: ai,
    data: { action: "@matomezu/base:note-read", args: { note }, on: { book } },
  })
  const check = page.locator("[data-read-check]")
  await expect(check).toHaveCount(1)
  // 紙を左へずらして、リストを画面の左の外へ出す
  const stage = (await page.locator("[data-stage]").boundingBox())!
  await page.mouse.move(stage.x + stage.width - 20, stage.y + 60)
  await page.mouse.wheel(800, 0)
  await expect
    .poll(async () => {
      const l = (await list.boundingBox())!
      return l.x + l.width
    })
    .toBeLessThan(stage.x)
  const pointer = page.getByRole("button", { name: "行 1を見せる" })
  await expect(pointer).toHaveCount(1)
  await expect(pointer.locator("[data-read-check]")).toHaveCount(1)
  const p = (await pointer.boundingBox())!
  expect(Math.abs(p.x - stage.x - 4)).toBeLessThan(2) // 画面の左の縁に付く
})

test("物の角に 2 つ以上あれば、先頭の 2 つを重ねた絵にまとまり、乗せると広がる吹き出しから 1 つずつ選べる。右サイドパネルがほかの伝言を出している間は、伝言は薄く押せない。びっくりマークは吹き出しの上に「外す？」を出す", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const ai = aiAuth()
  await page.goto(BOOK_SCREEN_URL)
  await page.bringToFront()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toHaveProperty("stage")
  const { book } = (await (await page.request.get("/api/ai/view", { headers: ai })).json()) as { book: string }
  await addBox(page, 200, 200, "二")
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
  // 1 つだけなら、まとめずにその絵（既読のチェック）
  await writeNote(page, two, "古い")
  await readAll()
  await expect(page.locator("[data-read]")).toHaveCount(1)
  await expect(page.locator("[data-corner-count]")).toHaveCount(0)
  // 既読の伝言をもう 1 つ、たたんだ未読の伝言、びっくりマークを足すと 4 つ
  await writeNote(page, two, "新しい")
  await readAll()
  await writeNote(page, two, "たたむ")
  await page.getByRole("button", { name: "伝言を開く" }).and(page.locator(":not([data-read])")).click()
  await panel(page).getByRole("button", { name: "隠す" }).click()
  await page.keyboard.press("Escape")
  await two.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに示す" }).click()
  await page.getByRole("group", { name: "マークを付ける" }).getByRole("button", { name: "びっくりマーク" }).click()
  const stack = page.getByRole("button", { name: "角の 4 件を見る" })
  await expect(stack).toBeVisible()
  await expect(page.locator("[data-read]")).toHaveCount(0)

  // 乗せると吹き出しが、右端を角にそろえて左へ広がり、びっくりマーク・たたんだ伝言・既読の伝言（新しい順）と並ぶ
  await stack.hover()
  const bubble = page.getByRole("group", { name: "角の物" })
  await expect(bubble.getByRole("button")).toHaveCount(4)
  const right = (b: { x: number; width: number }) => b.x + b.width
  expect(Math.abs(right((await bubble.boundingBox())!) - right((await stack.boundingBox())!))).toBeLessThan(1)

  await expect(bubble.getByRole("button").nth(0)).toHaveAccessibleName("びっくりマーク")
  await expect(bubble.getByRole("button").nth(1)).not.toHaveAttribute("data-read")
  await expect(bubble.locator("[data-read]")).toHaveCount(2)
  // 古い既読の伝言を選ぶと、右サイドパネルにその伝言だけが出る
  await bubble.locator("[data-read]").nth(1).click()
  await expect(panel(page).getByLabel("伝言", { exact: true })).toHaveValue("古い")
  // 開いている間は、ほかの伝言は薄く押せない（開いている伝言とマークは押せる）
  await stack.hover()
  await expect(bubble.locator("[data-read]").nth(0)).toBeDisabled()
  await expect(bubble.locator("[data-read]").nth(1)).toBeEnabled()
  await expect(bubble.getByRole("button").nth(1)).toBeDisabled()
  await expect(bubble.getByRole("button").nth(0)).toBeEnabled()
  await page.keyboard.press("Escape")
  await expect(bubble).toHaveCount(0)
  await panel(page).getByRole("button", { name: "右サイドパネルを閉じる" }).click()
  await expect(panel(page)).toHaveCount(0)

  // びっくりマークを押すと、吹き出しの上に「外す？」が出て、はいで外れる（3 つになる）
  await stack.hover()
  await bubble.getByRole("button", { name: "びっくりマーク" }).click()
  const ask = page.getByRole("group", { name: "外す？" })
  await expect(ask).toBeVisible()
  expect((await ask.boundingBox())!.y).toBeLessThan((await bubble.boundingBox())!.y)
  await ask.getByRole("button", { name: "はい" }).click()
  await expect(page.getByRole("button", { name: "角の 3 件を見る" })).toBeVisible()
})

test("角のまとめた絵は、押しても Enter でも開き、離れて少し経つか、ほかを押すと閉じる。上に入れば上に、入らなければ下に広がる（「外す？」も下）。物が画面の外の間は縁の印が 1 つだけで、戻ると乗せて開く", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 900, height: 480 })
  await page.goto(BOOK_SCREEN_URL)
  await addBox(page, 200, 40, "上")
  await addBox(page, 200, 300, "下")
  const fold = async (name: string) => {
    const box = items(page).filter({ hasText: name })
    await writeNote(page, box, `${name}の伝言`)
    await page.getByRole("button", { name: "伝言を開く" }).and(page.locator(":not([data-read])")).last().click()
    await panel(page).getByRole("button", { name: "隠す" }).click()
    await page.keyboard.press("Escape")
    await expect(panel(page)).toHaveCount(0)
    await box.click({ button: "right" })
    await page.getByRole("menu").getByRole("menuitem", { name: "AIに示す" }).click()
    await page.getByRole("group", { name: "マークを付ける" }).getByRole("button", { name: "びっくりマーク" }).click()
  }
  await fold("上")
  await fold("下")
  const stacks = page.getByRole("button", { name: "角の 2 件を見る" })
  await expect(stacks).toHaveCount(2)
  const bubble = page.getByRole("group", { name: "角の物" })
  const lower = stacks.nth(1)

  // 押すと開き（乗せて開いていても閉じない）、ほかを押すと閉じる。下の物は上に広がる
  await lower.click()
  await expect(bubble).toBeVisible()
  expect((await bubble.boundingBox())!.y).toBeLessThan((await lower.boundingBox())!.y)
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  await page.mouse.click(paper.x + 600, paper.y + 420)
  await expect(bubble).toHaveCount(0)
  // Enter でも開く。離れて少し経つと閉じる
  await lower.focus()
  await page.keyboard.press("Enter")
  await expect(bubble).toBeVisible()
  await lower.hover()
  await page.mouse.move(paper.x + 600, paper.y + 420)
  await expect(bubble).toBeVisible()
  await expect(bubble).toHaveCount(0)

  // 上の箱の上の辺を画面の上の端の近くまで寄せると、上に入らないので下に広がる
  const stage = (await page.locator("[data-stage]").boundingBox())!
  const upperBox = items(page).filter({ hasText: "上" })
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height - 20)
  for (let i = 0; i < 40 && (await upperBox.boundingBox())!.y - stage.y > 20; i++) await page.mouse.wheel(0, 10)
  await expect.poll(async () => (await upperBox.boundingBox())!.y - stage.y).toBeLessThan(21)
  expect((await upperBox.boundingBox())!.y).toBeGreaterThan(stage.y)
  const upper = stacks.first()
  await upper.hover()
  await expect(bubble).toBeVisible()
  expect((await bubble.boundingBox())!.y).toBeGreaterThan((await upper.boundingBox())!.y)
  // 下に広がったときは、びっくりマークの「外す？」も吹き出しの下に出る
  await bubble.getByRole("button", { name: "びっくりマーク" }).click()
  const ask = page.getByRole("group", { name: "外す？" })
  await expect(ask).toBeVisible()
  const b = (await bubble.boundingBox())!
  expect((await ask.boundingBox())!.y).toBeGreaterThan(b.y + b.height / 2)
  await page.mouse.move(paper.x + 600, paper.y + 420)
  await expect(bubble).toHaveCount(0)

  // 上の箱が画面の外に出ると、縁の印は 1 つだけ（たたんだ伝言とびっくりマークの両方が印を持つ）。押して戻すと、乗せて開く
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height - 20)
  await page.mouse.wheel(0, 60)
  const pointer = page.getByRole("button", { name: "上を見せる" })
  await expect(pointer).toHaveCount(1)
  await expect(page.getByRole("button", { name: "下を見せる" })).toHaveCount(0)
  await pointer.click()
  await expect(pointer).toHaveCount(0)
  await stacks.first().hover()
  await expect(bubble).toBeVisible()
})

test("設定画面の「コーナーステータスの並び」で、角に出す物の種類を前へ・後ろへ入れ替えると、角の吹き出しの並びもその順になる", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const ai = aiAuth()
  await page.goto(BOOK_SCREEN_URL)
  const general = await openGeneral(page)
  const order = general.getByRole("group", { name: "コーナーステータスの並び" })
  const names = order.getByRole("listitem").locator(":scope > span")
  await expect(names).toHaveText(["びっくりマーク", "たたんだ伝言", "既読の伝言"])
  await expect(order.getByRole("button", { name: "びっくりマークを前へ" })).toBeDisabled()
  await order.getByRole("button", { name: "既読の伝言を前へ" }).click()
  await order.getByRole("button", { name: "既読の伝言を前へ" }).click()
  await expect(names).toHaveText(["既読の伝言", "びっくりマーク", "たたんだ伝言"])
  await order.getByRole("button", { name: "たたんだ伝言を前へ" }).click()
  await expect(names).toHaveText(["既読の伝言", "たたんだ伝言", "びっくりマーク"])
  await settingsDialog(page).getByRole("button", { name: "閉じる" }).click()

  // 既読の伝言とびっくりマークを付けると、既読の伝言が先に並ぶ
  await page.goto(BOOK_SCREEN_URL)
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toHaveProperty("stage")
  const { book } = (await (await page.request.get("/api/ai/view", { headers: ai })).json()) as { book: string }
  await addBox(page, 200, 200, "並")
  const box = items(page).filter({ hasText: "並" })
  await writeNote(page, box, "読む")
  const notes = (await (await page.request.get(`/api/ai/books/${book}`, { headers: ai })).json()).annotations as {
    id: string
  }[]
  for (const n of notes)
    await page.request.post("/api/ai/perform", {
      headers: ai,
      data: { action: "@matomezu/base:note-read", args: { note: n.id }, on: { book } },
    })
  await box.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに示す" }).click()
  await page.getByRole("group", { name: "マークを付ける" }).getByRole("button", { name: "びっくりマーク" }).click()
  const stack = page.getByRole("button", { name: "角の 2 件を見る" })
  await stack.hover()
  const bubble = page.getByRole("group", { name: "角の物" })
  await expect(bubble.getByRole("button").nth(0)).toHaveAttribute("data-read", "true")
  await expect(bubble.getByRole("button").nth(1)).toHaveAccessibleName("びっくりマーク")
  // 既読の伝言のツールチップは「AI既読: 」と文の始め
  await expect(bubble.getByRole("button").nth(0)).toHaveAttribute("title", "AI既読: 読む")
})
