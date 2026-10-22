import { expect, type Page, test } from "@playwright/test"

const items = (page: Page) => page.locator("[data-item]")

// 箱を置こうとして (x, y) で押し、開いた追加のダイアログでキャプションを入れて追加する
async function addBox(page: Page, x: number, y: number, caption = "") {
  await page.mouse.click(x, y)
  const dialog = page.getByRole("dialog", { name: "ボックスの追加" })
  await dialog.getByLabel("キャプション").fill(caption)
  await dialog.getByRole("button", { name: "追加" }).click()
  await expect(dialog).toBeHidden()
}

// 紙の左上から (x, y) の画面の座標
async function onPaper(page: Page, x: number, y: number) {
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  return { x: paper.x + x, y: paper.y + y }
}

test("箱のツールを押すとポインタに点線の箱が付き、紙の上で押して追加のダイアログで追加すると、そこに置かれて選ばれ、道具は選択に戻る", async ({
  page,
}) => {
  await page.goto("/")
  await page.getByRole("button", { name: "箱" }).click()
  await expect(page.getByRole("button", { name: "箱" })).toHaveAttribute("aria-pressed", "true")
  const at = await onPaper(page, 200, 150)
  await page.mouse.move(at.x, at.y)
  const ghost = page.locator("[data-fits]")
  await expect(ghost).toHaveAttribute("data-fits", "true")
  // 点線の箱の左上は、ポインタから左へ 16px、上へ 12px
  const g = (await ghost.boundingBox())!
  expect(Math.round(at.x - g.x)).toBe(16)
  expect(Math.round(at.y - g.y)).toBe(12)
  await addBox(page, at.x, at.y, "見出し")
  await expect(items(page)).toHaveCount(1)
  await expect(items(page)).toHaveAttribute("data-selected", "true")
  await expect(items(page)).toHaveText("見出し")
  await expect(ghost).toHaveCount(0)
  await expect(page.getByRole("button", { name: "箱" })).toHaveAttribute("aria-pressed", "false")
  await expect(page.getByRole("button", { name: "選択ツール" })).toBeVisible()
})

test("紙からはみ出す所では点線の箱が薄くなり、押しても置かない。Escape で取り消す", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "箱" }).click()
  const at = await onPaper(page, 5, 5)
  await page.mouse.move(at.x, at.y)
  await expect(page.locator("[data-fits]")).toHaveAttribute("data-fits", "false")
  await page.mouse.down()
  await page.mouse.up()
  await expect(items(page)).toHaveCount(0)
  await page.keyboard.press("Escape")
  await expect(page.locator("[data-fits]")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "箱" })).toHaveAttribute("aria-pressed", "false")
})

test("選択の道具で箱をドラッグすると動き、何も無い所を押すと選択が外れる。ハンドの道具では箱ごと紙がずれる", async ({
  page,
}) => {
  await page.goto("/")
  await page.getByRole("button", { name: "箱" }).click()
  const at = await onPaper(page, 200, 150)
  await addBox(page, at.x, at.y)
  const box = items(page)
  const before = (await box.boundingBox())!
  await page.mouse.move(before.x + 20, before.y + 20)
  await page.mouse.down()
  await page.mouse.move(before.x + 120, before.y + 70, { steps: 5 })
  await page.mouse.up()
  const after = (await box.boundingBox())!
  expect(Math.round(after.x - before.x)).toBe(100)
  expect(Math.round(after.y - before.y)).toBe(50)
  const empty = await onPaper(page, 600, 500)
  await page.mouse.click(empty.x, empty.y)
  await expect(box).toHaveAttribute("data-selected", "false")

  await page.getByRole("button", { name: "選択ツール" }).click()
  await page.getByRole("button", { name: "付け替えツール" }).click()
  const paper = page.getByRole("img", { name: "紙" })
  const p0 = (await paper.boundingBox())!
  await page.mouse.move(after.x + 20, after.y + 20)
  await page.mouse.down()
  await page.mouse.move(after.x - 80, after.y - 80, { steps: 5 })
  await page.mouse.up()
  const p1 = (await paper.boundingBox())!
  const moved = (await box.boundingBox())!
  expect(p1.y).toBeLessThan(p0.y)
  expect(Math.round(moved.x - after.x)).toBe(Math.round(p1.x - p0.x))
  expect(Math.round(moved.y - after.y)).toBe(Math.round(p1.y - p0.y))
})

test("追加のダイアログは見出しの右にキャンセルと追加を並べ、キャンセルでは置かない。区切り線は本文を書くと押せて入り、Enter で追加する", async ({
  page,
}) => {
  await page.goto("/")
  await page.getByRole("button", { name: "箱" }).click()
  const at = await onPaper(page, 200, 150)
  await page.mouse.click(at.x, at.y)
  const dialog = page.getByRole("dialog", { name: "ボックスの追加" })
  const title = (await dialog.getByRole("heading", { name: "ボックスの追加" }).boundingBox())!
  const cancel = (await dialog.getByRole("button", { name: "キャンセル" }).boundingBox())!
  const add = (await dialog.getByRole("button", { name: "追加" }).boundingBox())!
  expect(Math.abs(cancel.y + cancel.height / 2 - (title.y + title.height / 2))).toBeLessThan(4)
  expect(cancel.x).toBeGreaterThan(title.x + title.width)
  expect(add.x).toBeGreaterThan(cancel.x)
  await expect(dialog.getByLabel("キャプション")).toBeFocused()
  await dialog.getByRole("button", { name: "キャンセル" }).click()
  await expect(dialog).toBeHidden()
  await expect(items(page)).toHaveCount(0)
  await expect(page.getByRole("button", { name: "箱" })).toHaveAttribute("aria-pressed", "false")

  await page.getByRole("button", { name: "箱" }).click()
  await page.mouse.click(at.x, at.y)
  const rule = dialog.getByRole("switch", { name: "区切り線" })
  await expect(rule).toBeDisabled()
  await dialog.getByLabel("本文").fill("一行目\n二行目")
  await expect(rule).toHaveAttribute("aria-checked", "true")
  await rule.click()
  await expect(rule).toHaveAttribute("aria-checked", "false")
  await dialog.getByLabel("キャプション").fill("見出し")
  await dialog.getByLabel("キャプション").press("Enter")
  await expect(dialog).toBeHidden()
  await expect(items(page)).toHaveCount(1)
  await expect(items(page).locator("hr")).toHaveCount(0)
  await expect(items(page)).toContainText("一行目")
})

test("選択の道具で箱をダブルクリックすると、今の中身の入った編集のダイアログが開き、確定で変わり、キャンセルでは変わらない", async ({
  page,
}) => {
  await page.goto("/")
  await page.getByRole("button", { name: "箱" }).click()
  const at = await onPaper(page, 200, 150)
  await addBox(page, at.x, at.y, "前")
  const box = items(page)
  const dialog = page.getByRole("dialog", { name: "ボックスの編集" })
  await box.dblclick()
  await expect(dialog.getByLabel("キャプション")).toHaveValue("前")
  await expect(dialog.getByLabel("キャプション")).toBeFocused()
  await dialog.getByLabel("キャプション").fill("取りやめ")
  await dialog.getByRole("button", { name: "キャンセル" }).click()
  await expect(box).toHaveText("前")

  await box.dblclick()
  await dialog.getByLabel("キャプション").fill("後")
  await dialog.getByLabel("本文").fill("本文")
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  await expect(box).toContainText("後")
  await expect(box).toContainText("本文")
  await expect(box.locator("hr")).toHaveCount(1)
  // 本文の欄は縦にだけ伸ばせる
  await box.dblclick()
  await expect(dialog.getByLabel("本文")).toHaveCSS("resize", "vertical")
})

test("選んだ箱は Delete で消える。ダイアログの入力欄の中の Delete では消えない", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "箱" }).click()
  const at = await onPaper(page, 200, 150)
  await addBox(page, at.x, at.y, "消す")
  await items(page).dblclick()
  const dialog = page.getByRole("dialog", { name: "ボックスの編集" })
  await dialog.getByLabel("キャプション").press("Delete")
  await dialog.getByRole("button", { name: "キャンセル" }).click()
  await expect(items(page)).toHaveCount(1)
  await page.keyboard.press("Delete")
  await expect(items(page)).toHaveCount(0)
})

test("箱を右クリックすると選ばれ、設定・区切り線・削除のメニューが出る。設定で編集のダイアログ、削除で消える", async ({
  page,
}) => {
  await page.goto("/")
  for (const [x, caption] of [
    [200, "一"],
    [450, "二"],
  ] as const) {
    await page.getByRole("button", { name: "箱" }).click()
    const at = await onPaper(page, x, 150)
    await addBox(page, at.x, at.y, caption)
  }
  const second = items(page).filter({ hasText: "二" })
  await items(page).filter({ hasText: "一" }).click({ button: "right" })
  const menu = page.getByRole("menu")
  await expect(menu.getByRole("menuitem")).toHaveText(["設定", "削除Delete"])
  await expect(menu.getByRole("menuitem", { name: "削除" }).locator("kbd")).toHaveText("Delete")
  await expect(menu.locator("hr")).toHaveCount(1)
  await expect(items(page).filter({ hasText: "一" })).toHaveAttribute("data-selected", "true")
  await expect(second).toHaveAttribute("data-selected", "false")
  await menu.getByRole("menuitem", { name: "設定" }).click()
  const dialog = page.getByRole("dialog", { name: "ボックスの編集" })
  await expect(dialog.getByLabel("キャプション")).toHaveValue("一")
  await dialog.getByRole("button", { name: "キャンセル" }).click()

  await second.click({ button: "right" })
  await menu.getByRole("menuitem", { name: "削除" }).click()
  await expect(items(page)).toHaveText(["一"])
})

test("キーは割り当ての表で効く: 本文の欄の Enter は改行、キャプションの欄の Enter で決める、メニューは Escape で閉じる", async ({
  page,
}) => {
  await page.goto("/")
  await page.getByRole("button", { name: "箱" }).click()
  const at = await onPaper(page, 200, 150)
  await page.mouse.click(at.x, at.y)
  const dialog = page.getByRole("dialog", { name: "ボックスの追加" })
  const body = dialog.getByLabel("本文")
  await body.click()
  await page.keyboard.type("一")
  await page.keyboard.press("Enter")
  await page.keyboard.type("二")
  await expect(body).toHaveValue("一\n二")
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("キャプション").press("Enter")
  await expect(dialog).toBeHidden()
  await expect(items(page)).toHaveCount(1)

  await items(page).click({ button: "right" })
  await expect(page.getByRole("menu")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menu")).toBeHidden()
  await expect(items(page)).toHaveCount(1)
})

const BODY =
  "matomezu は図を描く道具です。「箱」の本文は、幅に合わせて折り返し、行の数だけ箱が縦に伸びます。Noto Sans JP で描きます。"

// 本文を入れた箱を置き、選んだままにする
async function addBodyBox(page: Page) {
  await page.getByRole("button", { name: "箱" }).click()
  const at = await onPaper(page, 120, 120)
  await page.mouse.click(at.x, at.y)
  const dialog = page.getByRole("dialog", { name: "ボックスの追加" })
  await dialog.getByLabel("キャプション").fill("見出し")
  await dialog.getByLabel("本文").fill(BODY)
  await dialog.getByRole("button", { name: "追加" }).click()
  await expect(dialog).toBeHidden()
}

// 紙の上の 1px が画面の何 px か
async function zoomOf(page: Page) {
  return (await page.getByRole("img", { name: "紙" }).boundingBox())!.width / 1123
}

test("本文は折り返した行ごとに描き、描いた字の幅は core の計算（フォントの表）と 1px 未満で合う", async ({ page }) => {
  const { textWidth } = await import("../web/src/core/text/text")
  await page.goto("/")
  await addBodyBox(page)
  await page.evaluate(() => document.fonts.ready)
  const lines = page.locator("[data-item] [data-line]")
  expect(await lines.count()).toBeGreaterThan(2)
  const zoom = await zoomOf(page)
  const drawn = await lines.evaluateAll(els =>
    els.map(el => {
      const range = document.createRange()
      range.selectNodeContents(el)
      return { text: el.textContent ?? "", width: range.getBoundingClientRect().width }
    }),
  )
  expect(
    drawn
      .map(d => d.text)
      .join("")
      .replace(/ /g, ""),
  ).toBe(BODY.replace(/ /g, ""))
  expect(await page.evaluate(() => document.fonts.check('13px "Noto Sans JP"'))).toBe(true)
  for (const d of drawn) {
    expect(Math.abs(d.width / zoom - textWidth(d.text, { size: 13, weight: 400 }))).toBeLessThan(1)
  }
})

test("選んだ箱の左右の辺と四隅でポインタが横向きと斜めの矢印になり、右の辺を右へドラッグすると幅が広がって行が減る", async ({
  page,
}) => {
  await page.goto("/")
  await addBodyBox(page)
  const box = page.locator("[data-item]")
  const grips = box.locator("[data-grip]")
  await expect(grips).toHaveCount(6)
  const cursor = (at: string) => box.locator(`[data-grip="${at}"]`).evaluate(el => getComputedStyle(el).cursor)
  expect(await cursor("right")).toBe("ew-resize")
  expect(await cursor("top-left")).toBe("nwse-resize")
  expect(await cursor("bottom-left")).toBe("nesw-resize")
  const before = (await box.boundingBox())!
  const lines = await box.locator("[data-line]").count()
  const grip = (await box.locator('[data-grip="bottom-right"]').boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x + grip.width / 2 + 150, grip.y + grip.height / 2 + 30, { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => (await box.boundingBox())!.width).toBeGreaterThan(before.width + 140)
  const after = (await box.boundingBox())!
  expect(Math.abs(after.x - before.x)).toBeLessThan(1)
  expect(await box.locator("[data-line]").count()).toBeLessThan(lines)
  expect(after.height).toBeLessThan(before.height)
})

test("ダイアログで本文の最大の行数を選ぶと、超えた分を … で切る", async ({ page }) => {
  await page.goto("/")
  await addBodyBox(page)
  await page.locator("[data-item]").dblclick()
  const dialog = page.getByRole("dialog", { name: "ボックスの編集" })
  await dialog.getByLabel("最大行数").selectOption("2")
  await dialog.getByRole("button", { name: "確定" }).click()
  const lines = page.locator("[data-item] [data-line]")
  await expect(lines).toHaveCount(2)
  await expect(lines.nth(1)).toHaveText(/…$/)
})
