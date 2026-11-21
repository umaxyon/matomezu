import { BOOK_SCREEN_URL, expect, type Page, test } from "./fixtures"
import { addBox, items, onPaper, zoomOf } from "./helpers/paper"

test("選択の道具で、選んでいない箱にポインタを乗せると四辺に〇が出る。〇から相手の箱へドラッグして離すと、終点に矢印の付いた線が引かれる。何も無い所や Escape では引かない", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  for (const [x, caption] of [
    [150, "始"],
    [550, "終"],
  ] as const) {
    await addBox(page, x, 150, caption)
  }
  const empty = await onPaper(page, 600, 500)
  await page.mouse.click(empty.x, empty.y) // 選択を外す
  const start = items(page).filter({ hasText: "始" })
  const end = items(page).filter({ hasText: "終" })
  const s = (await start.boundingBox())!
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2)
  const ports = start.locator("[data-port]")
  await expect(ports).toHaveCount(4)
  // 選んだ箱には出さない
  await start.click()
  await expect(ports).toHaveCount(0)
  await page.mouse.click(empty.x, empty.y)
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2)
  const right = start.locator('[data-port="r"]')
  const r = (await right.boundingBox())!
  const e = (await end.boundingBox())!
  // 何も無い所で離すと引かない
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
  await page.mouse.down()
  await page.mouse.move(empty.x, empty.y, { steps: 5 })
  await page.mouse.up()
  await expect(page.locator("[data-item]:not([data-shape])")).toHaveCount(0)
  // Escape で取りやめ
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2)
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
  await page.mouse.down()
  await page.mouse.move(e.x + 10, e.y + e.height / 2, { steps: 5 })
  await expect(end).toHaveAttribute("data-target", "true")
  await page.keyboard.press("Escape")
  await expect(end).toHaveAttribute("data-target", "false")
  await page.mouse.up()
  await expect(page.locator("[data-item]:not([data-shape])")).toHaveCount(0)
  // 相手の箱の上で離すと引く。引いている間は、引ける相手が強調される
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2)
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
  await page.mouse.down()
  await page.mouse.move(e.x + 10, e.y + e.height / 2, { steps: 5 })
  await expect(end).toHaveAttribute("data-target", "true")
  await page.mouse.up()
  const line = page.locator("[data-item]:not([data-shape])")
  await expect(line).toHaveCount(1)
  await expect(line.locator("path")).toHaveCount(1) // 終点の矢印
  // 始点は〇の辺の真ん中（始の右の辺）、終点は離した所に近い終の左の辺
  const pts = (await line.locator("polyline").last().getAttribute("points"))!.split(" ")
  expect(pts).toHaveLength(2)
  expect(pts[0]!.split(",")[1]).toBe(pts[1]!.split(",")[1])
})

test("〇から線を引いている途中にホイールで紙をずらしても、引いている線の先はポインタの所にある", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  await addBox(page, 150, 150, "始")
  const empty = await onPaper(page, 600, 500)
  await page.mouse.click(empty.x, empty.y) // 選択を外す
  const start = items(page).filter({ hasText: "始" })
  const s = (await start.boundingBox())!
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2)
  const r = (await start.locator('[data-port="r"]').boundingBox())!
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
  await page.mouse.down()
  const to = { x: s.x + 300, y: s.y + 120 }
  await page.mouse.move(to.x, to.y, { steps: 5 })
  const paper = page.getByRole("img", { name: "紙" })
  const before = (await paper.boundingBox())!
  await page.mouse.wheel(0, 120)
  await expect.poll(async () => (await paper.boundingBox())!.y).not.toBe(before.y)
  await page.mouse.move(to.x + 1, to.y, { steps: 1 })
  // 線の先（紙の上）を画面の上に直すと、ポインタの所
  const p = (await paper.boundingBox())!
  const zoom = await zoomOf(page)
  const tip = page.locator("svg line").last()
  const x2 = Number(await tip.getAttribute("x2"))
  const y2 = Number(await tip.getAttribute("y2"))
  expect(Math.abs(p.x + x2 * zoom - (to.x + 1))).toBeLessThan(2)
  expect(Math.abs(p.y + y2 * zoom - to.y)).toBeLessThan(2)
  await page.mouse.up()
})

test("〇から同じ箱へ戻して離すと、自分に戻る線が引かれる", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  await addBox(page, 300, 250, "輪")
  const empty = await onPaper(page, 700, 600)
  await page.mouse.click(empty.x, empty.y)
  const box = items(page).filter({ hasText: "輪" })
  const b = (await box.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  const top = (await box.locator('[data-port="t"]').boundingBox())!
  await page.mouse.move(top.x + 10, top.y + 10)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width - 8, b.y + 8, { steps: 5 })
  await page.mouse.up()
  const line = page.locator("[data-item]:not([data-shape])")
  await expect(line).toHaveCount(1)
  expect((await line.locator("polyline").last().getAttribute("points"))!.split(" ").length).toBeGreaterThan(8)
})

// 箱 from の右の〇から、箱 to の左の辺の近くへ引く
async function drawLine(page: Page, from: string, to: string) {
  const a = items(page).filter({ hasText: from })
  const b = (await items(page).filter({ hasText: to }).boundingBox())!
  const s = (await a.boundingBox())!
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2)
  const r = (await a.locator('[data-port="r"]').boundingBox())!
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + 10, b.y + b.height / 2, { steps: 5 })
  await page.mouse.up()
}

test("ロック中のページでは、箱にポインタを乗せても線を引く〇が出ず、選んだ線の両端に丸が出ない", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  for (const [x, caption] of [
    [150, "始"],
    [550, "終"],
  ] as const) {
    await addBox(page, x, 150, caption)
  }
  const empty = await onPaper(page, 600, 500)
  await page.mouse.click(empty.x, empty.y)
  await drawLine(page, "始", "終")
  const line = page.locator("[data-item]:not([data-shape])")
  const ends = line.locator("circle[data-end]")
  // 線の最初の区間の真ん中を押して選ぶ
  const pts = (await line.locator("polyline").last().getAttribute("points"))!
    .split(" ")
    .map(p => p.split(",").map(Number))
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  const zoom = await zoomOf(page)
  const onLine = {
    x: paper.x + ((pts[0]![0]! + pts[1]![0]!) / 2) * zoom,
    y: paper.y + ((pts[0]![1]! + pts[1]![1]!) / 2) * zoom,
  }
  await page.mouse.click(onLine.x, onLine.y)
  await expect(ends).toHaveCount(2)
  // ページの設定の見出しの鍵でロックする
  await page.mouse.click(empty.x, empty.y, { button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "ページの設定" }).click()
  const dialog = page.getByRole("dialog", { name: "ページの設定" })
  await dialog.getByRole("button", { name: "ページをロックする" }).click()
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toHaveCount(0)
  await page.mouse.click(onLine.x, onLine.y)
  await expect(line).toHaveAttribute("data-selected", "true")
  await expect(ends).toHaveCount(0)
  await page.mouse.click(empty.x, empty.y)
  const start = items(page).filter({ hasText: "始" })
  const s = (await start.boundingBox())!
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2)
  await expect(start.locator("[data-port]")).toHaveCount(0)
})

test("線をダブルクリックすると線の編集のダイアログが開き、線の種類と端の形を変えて確定すると線が変わる。「線を消す」で消える", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  for (const [x, y, caption] of [
    [150, 150, "始"],
    [550, 350, "終"],
  ] as const) {
    await addBox(page, x, y, caption)
  }
  const empty = await onPaper(page, 900, 600)
  await page.mouse.click(empty.x, empty.y)
  await drawLine(page, "始", "終")
  const line = page.locator("[data-item]:not([data-shape])")
  await expect(line).toHaveCount(1)
  await line.locator("polyline").last().dispatchEvent("dblclick")
  const dialog = page.getByRole("dialog", { name: "線の編集" })
  await expect(dialog).toBeVisible()
  // 始点と終点の形を選ぶ入力Formは 1 行に並ぶ
  const startHead = (await dialog.getByLabel("始点の形").boundingBox())!
  const endHead = (await dialog.getByLabel("終点の形").boundingBox())!
  expect(Math.abs(startHead.y - endHead.y)).toBeLessThan(2)
  await dialog.getByRole("radio", { name: "破線" }).check({ force: true })
  // 下書き: 確定の前から破線で見せる
  await expect(line.locator("polyline").first()).toHaveAttribute("data-dashed", "true")
  await dialog.getByLabel("終点の形").selectOption("")
  await dialog.getByLabel("キャプション", { exact: true }).fill("申請")
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  await expect(line.locator("polyline").first()).toHaveAttribute("data-dashed", "true")
  await expect(line.locator("path")).toHaveCount(0)
  await expect(line).toContainText("申請")
  // 右クリックのメニューの「設定」でも開き、「線を消す」で消える
  await line.locator("polyline").last().dispatchEvent("contextmenu")
  const menu = page.getByRole("menu")
  await expect(menu.getByRole("menuitem")).toHaveText(["設定", "削除Delete", "AIに伝言", "AIに示す"])
  await menu.getByRole("menuitem", { name: "設定" }).click()
  await dialog.getByRole("button", { name: "線を消す" }).click()
  await expect(dialog).toBeHidden()
  await expect(line).toHaveCount(0)
})

test("紙の右クリックの「ページの設定」で、線の既定の通り方を直線にすると、確定の前から、斜めに離れた箱どうしの線が 2 点の直線になる", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  for (const [x, y, caption] of [
    [150, 150, "始"],
    [550, 350, "終"],
  ] as const) {
    await addBox(page, x, y, caption)
  }
  const empty = await onPaper(page, 900, 600)
  await page.mouse.click(empty.x, empty.y)
  await drawLine(page, "始", "終")
  const points = page.locator("[data-item]:not([data-shape]) polyline").last()
  await expect.poll(async () => (await points.getAttribute("points"))!.split(" ").length).toBeGreaterThan(2)
  await page.mouse.click(empty.x, empty.y, { button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "ページの設定" }).click()
  const dialog = page.getByRole("dialog", { name: "ページの設定" })
  // 既定は折れ線
  await expect(dialog.getByRole("radio", { name: "折れ線" })).toBeChecked()
  await dialog.getByRole("radio", { name: "直線" }).check({ force: true })
  await expect.poll(async () => (await points.getAttribute("points"))!.split(" ").length).toBe(2) // ダイアログの下書き
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect.poll(async () => (await points.getAttribute("points"))!.split(" ").length).toBe(2)
})

test("選んだ線の両端に丸が出る。終点の丸を別の箱へ運んで離すとつなぎ替わり、折れ線の途中の区間をつまむと横にずれる", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  for (const [x, y, caption] of [
    [150, 150, "始"],
    [550, 250, "終"],
    [550, 500, "先"],
  ] as const) {
    await addBox(page, x, y, caption)
  }
  const empty = await onPaper(page, 900, 650)
  await page.mouse.click(empty.x, empty.y)
  await drawLine(page, "始", "終")
  const line = page.locator("[data-item]:not([data-shape])")
  const hit = line.locator("polyline").last()
  const pointsOf = async () => (await hit.getAttribute("points"))!.split(" ").map(p => p.split(",").map(Number))
  // 線を押して選ぶと、両端に丸
  const before = await pointsOf()
  const mid = before[1]!
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  const zoom = await zoomOf(page)
  const screen = ([x, y]: number[]) => ({ x: paper.x + x! * zoom, y: paper.y + y! * zoom })
  const onLine = screen([(before[0]![0]! + mid[0]!) / 2, (before[0]![1]! + mid[1]!) / 2])
  await page.mouse.click(onLine.x, onLine.y)
  await expect(line).toHaveAttribute("data-selected", "true")
  await expect(line.locator("circle[data-end]")).toHaveCount(2)
  // 途中の区間（Z 字の縦の区間）を右へ 30 ずらす
  const bend = line.locator("line[data-axis]")
  await expect(bend).toHaveCount(1)
  const b = (await bend.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2 + 30, b.y + b.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => Math.round((await pointsOf())[1]![0]! - mid[0]!)).toBe(Math.round(30 / zoom))
  // 終点の丸を「先」の箱へ運んで離すと、つなぎ替わる
  const end = (await line.locator('circle[data-end="to"]').boundingBox())!
  const target = items(page).filter({ hasText: "先" })
  const t = (await target.boundingBox())!
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2)
  await page.mouse.down()
  await page.mouse.move(t.x + 20, t.y + 10, { steps: 6 })
  await expect(target).toHaveAttribute("data-target", "true")
  await page.mouse.up()
  await expect(target).toHaveAttribute("data-target", "false")
  const last = (await pointsOf()).at(-1)!
  const p = screen(last)
  expect(p.x).toBeGreaterThanOrEqual(t.x - 1)
  expect(p.x).toBeLessThanOrEqual(t.x + t.width + 1)
  expect(p.y).toBeGreaterThanOrEqual(t.y - 1)
  expect(p.y).toBeLessThanOrEqual(t.y + t.height + 1)
})

test("箱をドラッグしている間、つながる線はその箱に付いてくる（〇から引いた線は端が固定なので、端は同じ辺の上）。離したあともつながったまま", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  for (const [x, y, caption] of [
    [150, 150, "始"],
    [500, 150, "終"],
  ] as const) {
    await addBox(page, x, y, caption)
  }
  const empty = await onPaper(page, 900, 650)
  await page.mouse.click(empty.x, empty.y)
  await drawLine(page, "始", "終")
  const hit = page.locator("[data-item]:not([data-shape]) polyline").last()
  const last = async () => (await hit.getAttribute("points"))!.split(" ").at(-1)!.split(",").map(Number)
  const end = items(page).filter({ hasText: "終" })
  const b = (await end.boundingBox())!
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  const zoom = await zoomOf(page)
  await page.mouse.move(b.x + 30, b.y + 20)
  await page.mouse.down()
  await page.mouse.move(b.x + 30, b.y + 220, { steps: 8 })
  // ドラッグ中: 線の終点は、ずらして描いている箱の左の辺の上
  const during = (await end.boundingBox())!
  const p = await last()
  expect(Math.abs(paper.x + p[0]! * zoom - during.x)).toBeLessThan(2)
  expect(paper.y + p[1]! * zoom).toBeGreaterThan(during.y)
  expect(paper.y + p[1]! * zoom).toBeLessThan(during.y + during.height)
  await page.mouse.up()
  const after = (await end.boundingBox())!
  const q = await last()
  expect(paper.x + q[0]! * zoom).toBeGreaterThanOrEqual(after.x - 1)
  expect(paper.y + q[1]! * zoom).toBeGreaterThanOrEqual(after.y - 1)
  expect(paper.y + q[1]! * zoom).toBeLessThanOrEqual(after.y + after.height + 1)
})

test("線のキャプションを押すと線が選ばれ、ドラッグすると線から離れた所へ動く。端の丸を同じ箱のふちに沿って動かすと、端の位置が変わる", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  for (const [x, y, caption] of [
    [150, 150, "始"],
    [550, 150, "終"],
  ] as const) {
    await addBox(page, x, y, caption)
  }
  const empty = await onPaper(page, 900, 650)
  await page.mouse.click(empty.x, empty.y)
  await drawLine(page, "始", "終")
  const line = page.locator("[data-item]:not([data-shape])")
  await line.locator("polyline").last().dispatchEvent("dblclick")
  const dialog = page.getByRole("dialog", { name: "線の編集" })
  await dialog.getByLabel("キャプション", { exact: true }).fill("申請")
  await dialog.getByRole("button", { name: "確定" }).click()
  const label = line.getByText("申請")
  const before = (await label.boundingBox())!
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
  await page.mouse.down()
  await page.mouse.move(before.x + before.width / 2 - 60, before.y + before.height / 2 - 40, { steps: 6 })
  await page.mouse.up()
  await expect(line).toHaveAttribute("data-selected", "true")
  const after = (await label.boundingBox())!
  expect(after.y).toBeLessThan(before.y - 20)
  expect(after.x).toBeLessThan(before.x - 30)
  // 始点の丸を、始の箱の下の辺へ動かす
  const hit = line.locator("polyline").last()
  const first = async () => (await hit.getAttribute("points"))!.split(" ")[0]!
  const was = await first()
  const start = (await line.locator('circle[data-end="from"]').boundingBox())!
  const box = (await items(page).filter({ hasText: "始" }).boundingBox())!
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 4, { steps: 6 })
  await page.mouse.up()
  await expect.poll(first).not.toBe(was)
})

test("線の色は、灰色を紙の色に 4 割混ぜた色。利用者の OS が暗い明暗でも同じ色で、白い紙の上で見える", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  for (const [x, y, caption] of [
    [150, 150, "始"],
    [550, 150, "終"],
  ] as const) {
    await addBox(page, x, y, caption)
  }
  const empty = await onPaper(page, 900, 650)
  await page.mouse.click(empty.x, empty.y)
  await drawLine(page, "始", "終")
  const stroke = page.locator("[data-item]:not([data-shape]) polyline").first()
  // 計算された色を 0〜255 の rgb にする（color-mix の結果は color(srgb …) で返る）
  const rgb = () =>
    stroke.evaluate(el => {
      const c = getComputedStyle(el).stroke
      const n = c.match(/[\d.]+/g)!.map(Number)
      return c.startsWith("color(") ? n.slice(0, 3).map(v => Math.round(v * 255)) : n.slice(0, 3)
    })
  const light = await rgb()
  expect(light).toEqual([189, 189, 197]) // rgb(90, 90, 110) を 4 割、白を 6 割
  await page.emulateMedia({ colorScheme: "dark" })
  expect(await rgb()).toEqual(light)
})

// 線の手直し（途中の区間を動かした折れ目）は、つなぐ両端の形をまとめてドラッグしている最中も、形と一緒に平行に動く
test("手直しした線は、形を全部選んでドラッグしている間も形を保って平行に動く", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  await addBox(page, 100, 150, "始")
  await addBox(page, 500, 350, "終")
  const empty = await onPaper(page, 900, 600)
  await page.mouse.click(empty.x, empty.y)
  const boxes = page.locator("[data-item][data-shape]")
  await drawLine(page, "始", "終")
  const line = page.locator("[data-item]:not([data-shape])")
  await expect(line).toHaveCount(1)
  // 線を選び、途中の縦の区間を右へ動かして手直しする
  const l = (await line.boundingBox())!
  await page.mouse.click(l.x + l.width / 2, l.y + l.height / 2)
  const bend = page.locator("line[data-axis]").first()
  await expect(bend).toBeAttached()
  const b = (await bend.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2, { steps: 5 })
  await page.mouse.up()
  const points = async () => (await line.locator("polyline").first().getAttribute("points"))!
  const parsed = (text: string) =>
    text
      .trim()
      .split(/\s+/)
      .map(p => p.split(",").map(Number) as [number, number])
  const before = parsed(await points())
  // 形を 2 つとも選んでドラッグする（選択の道具で、全体を囲む）
  const from = await onPaper(page, 40, 100)
  const to = await onPaper(page, 900, 600)
  await page.mouse.click(...(Object.values(await onPaper(page, 900, 700)) as [number, number]))
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 5 })
  await page.mouse.up()
  await expect(page.locator('[data-item][data-shape][data-selected="true"]')).toHaveCount(2)
  const a = (await boxes.nth(0).boundingBox())!
  await page.mouse.move(a.x + 20, a.y + 20)
  await page.mouse.down()
  await page.mouse.move(a.x + 20 + 120, a.y + 20, { steps: 6 })
  // 離す前（ドラッグ中）の線の形が、動いた量だけ平行にずれている
  const during = parsed(await points())
  const dx = during[0]![0] - before[0]![0]
  expect(Math.abs(dx)).toBeGreaterThan(50)
  expect(during.length).toBe(before.length)
  for (const [i, p] of during.entries()) {
    expect(p[0]).toBeCloseTo(before[i]![0] + dx, 0)
    expect(p[1]).toBeCloseTo(before[i]![1], 0)
  }
  await page.mouse.up()
})
