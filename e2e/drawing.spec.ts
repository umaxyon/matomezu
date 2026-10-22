import { expect, type Page, test } from "@playwright/test"

const items = (page: Page) => page.locator("[data-item]")

// 箱を置こうとして (x, y) で押し、開いた追加のダイアログでキャプションを入れて追加する
async function addBox(page: Page, x: number, y: number, caption = "") {
  await page.mouse.click(x, y)
  const dialog = page.getByRole("dialog", { name: "ボックスの追加" })
  await dialog.getByLabel("キャプション", { exact: true }).fill(caption)
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
  await expect(dialog.getByLabel("キャプション", { exact: true })).toBeFocused()
  await dialog.getByRole("button", { name: "キャンセル" }).click()
  await expect(dialog).toBeHidden()
  await expect(items(page)).toHaveCount(0)
  await expect(page.getByRole("button", { name: "箱" })).toHaveAttribute("aria-pressed", "false")

  await page.getByRole("button", { name: "箱" }).click()
  await page.mouse.click(at.x, at.y)
  const rule = dialog.getByRole("switch", { name: "区切り線" })
  await expect(rule).toBeDisabled()
  await dialog.getByLabel("本文", { exact: true }).fill("一行目\n二行目")
  await expect(rule).toHaveAttribute("aria-checked", "true")
  await rule.click()
  await expect(rule).toHaveAttribute("aria-checked", "false")
  await dialog.getByLabel("キャプション", { exact: true }).fill("見出し")
  await dialog.getByLabel("キャプション", { exact: true }).press("Enter")
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
  await expect(dialog.getByLabel("キャプション", { exact: true })).toHaveValue("前")
  await expect(dialog.getByLabel("キャプション", { exact: true })).toBeFocused()
  await dialog.getByLabel("キャプション", { exact: true }).fill("取りやめ")
  await dialog.getByRole("button", { name: "キャンセル" }).click()
  await expect(box).toHaveText("前")

  await box.dblclick()
  await dialog.getByLabel("キャプション", { exact: true }).fill("後")
  await dialog.getByLabel("本文", { exact: true }).fill("本文")
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  await expect(box).toContainText("後")
  await expect(box).toContainText("本文")
  await expect(box.locator("hr")).toHaveCount(1)
  // 本文の欄は縦にだけ伸ばせる
  await box.dblclick()
  await expect(dialog.getByLabel("本文", { exact: true })).toHaveCSS("resize", "vertical")
})

test("選んだ箱は Delete で消える。ダイアログの入力欄の中の Delete では消えない", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "箱" }).click()
  const at = await onPaper(page, 200, 150)
  await addBox(page, at.x, at.y, "消す")
  await items(page).dblclick()
  const dialog = page.getByRole("dialog", { name: "ボックスの編集" })
  await dialog.getByLabel("キャプション", { exact: true }).press("Delete")
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
  await expect(dialog.getByLabel("キャプション", { exact: true })).toHaveValue("一")
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
  const body = dialog.getByLabel("本文", { exact: true })
  await body.click()
  await page.keyboard.type("一")
  await page.keyboard.press("Enter")
  await page.keyboard.type("二")
  await expect(body).toHaveValue("一\n二")
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("キャプション", { exact: true }).press("Enter")
  await expect(dialog).toBeHidden()
  await expect(items(page)).toHaveCount(1)

  await items(page).click({ button: "right" })
  await expect(page.getByRole("menu")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menu")).toBeHidden()
  await expect(items(page)).toHaveCount(1)
})

const BODY =
  "matomezu は図を描く道具です。「箱」の本文は、幅に合わせて折り返し、高さに収まらない分は切ります。Noto Sans JP で描きます。"

// 本文を入れた箱を置き、選んだままにする
async function addBodyBox(page: Page) {
  await page.getByRole("button", { name: "箱" }).click()
  const at = await onPaper(page, 120, 120)
  await page.mouse.click(at.x, at.y)
  const dialog = page.getByRole("dialog", { name: "ボックスの追加" })
  await dialog.getByLabel("キャプション", { exact: true }).fill("見出し")
  await dialog.getByLabel("本文", { exact: true }).fill(BODY)
  await dialog.getByRole("button", { name: "追加" }).click()
  await expect(dialog).toBeHidden()
}

// 紙の上の 1px が画面の何 px か
async function zoomOf(page: Page) {
  return (await page.getByRole("img", { name: "紙" }).boundingBox())!.width / 1123
}

test("本文は折り返した行ごとに描き（置いたときは 5 行まで）、描いた字の幅は core の計算（フォントの表）と 1px 未満で合う", async ({
  page,
}) => {
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
  const shown = drawn.map(d => d.text.replace(/…$/, "")).join("")
  expect(BODY.replace(/ /g, "").startsWith(shown.replace(/ /g, ""))).toBe(true)
  expect(await page.evaluate(() => document.fonts.check('13px "Noto Sans JP"'))).toBe(true)
  for (const d of drawn) {
    expect(Math.abs(d.width / zoom - textWidth(d.text, { size: 13, weight: 400 }))).toBeLessThan(1)
  }
})

// つかむ所の真ん中を押して (dx, dy) だけドラッグする
async function dragGrip(page: Page, at: string, dx: number, dy: number) {
  const grip = (await page.locator(`[data-item] [data-grip="${at}"]`).boundingBox())!
  const x = grip.x + grip.width / 2
  const y = grip.y + grip.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 5 })
  await page.mouse.up()
}

test("選んだ箱の四辺と四隅でポインタが矢印になる。右下の角をドラッグすると幅と高さが変わり、左上はそのまま", async ({
  page,
}) => {
  await page.goto("/")
  await addBodyBox(page)
  const box = page.locator("[data-item]")
  await expect(box.locator("[data-grip]")).toHaveCount(8)
  const cursor = (at: string) => box.locator(`[data-grip="${at}"]`).evaluate(el => getComputedStyle(el).cursor)
  expect(await cursor("right")).toBe("ew-resize")
  expect(await cursor("bottom")).toBe("ns-resize")
  expect(await cursor("top-left")).toBe("nwse-resize")
  expect(await cursor("bottom-left")).toBe("nesw-resize")
  const before = (await box.boundingBox())!
  await dragGrip(page, "bottom-right", 150, 60)
  await expect.poll(async () => (await box.boundingBox())!.width).toBeGreaterThan(before.width + 140)
  const after = (await box.boundingBox())!
  expect(after.height).toBeGreaterThan(before.height + 50)
  expect(Math.abs(after.x - before.x)).toBeLessThan(1)
  expect(Math.abs(after.y - before.y)).toBeLessThan(1)
})

test("下の辺を上へ縮めると本文は収まる行だけになって … で切れ、さらに縮めると本文と区切り線が消えてキャプションだけが残る", async ({
  page,
}) => {
  await page.goto("/")
  await addBodyBox(page)
  const lines = page.locator("[data-item] [data-line]")
  await expect(lines).toHaveCount(5)
  await expect(lines.nth(4)).toHaveText(/…$/)
  const zoom = await zoomOf(page)
  await dragGrip(page, "bottom", 0, -36 * zoom)
  await expect(lines).toHaveCount(3)
  await expect(lines.nth(2)).toHaveText(/…$/)
  await dragGrip(page, "bottom", 0, -200 * zoom)
  await expect(lines).toHaveCount(0)
  await expect(page.locator("[data-item] hr")).toHaveCount(0)
  await expect(page.locator("[data-item]")).toHaveText("見出し")
})

test("置いた箱の幅はキャプションに合わせ、20 字までは切れずに出る。20 字を超えると、20 字と … が見える幅で切れる", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(() => document.fonts.ready)
  const caption = (i: number) => page.locator("[data-item]").nth(i).locator("[data-align]").first()
  const cut = (i: number) => caption(i).evaluate(el => el.scrollWidth > el.clientWidth)
  for (const [i, text, y] of [
    [0, "あいうえおかきくけこさしすせそたちつてと", 100],
    [1, "あいうえおかきくけこさしすせそたちつてとなにぬねの", 200],
  ] as const) {
    await page.getByRole("button", { name: "箱" }).click()
    const at = await onPaper(page, 100, y)
    await addBox(page, at.x, at.y, text)
    await page.evaluate(() => document.fonts.ready)
    expect(await cut(i)).toBe(i === 1)
  }
  const [a, b] = [
    (await page.locator("[data-item]").nth(0).boundingBox())!,
    (await page.locator("[data-item]").nth(1).boundingBox())!,
  ]
  expect(b.width).toBeGreaterThan(a.width)
  expect(b.width - a.width).toBeLessThan(20)
})

test("編集でキャプションを長くすると、20 字が見える幅まで箱が右へ広がる", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "箱" }).click()
  const at = await onPaper(page, 100, 100)
  await addBox(page, at.x, at.y, "短い")
  const box = page.locator("[data-item]")
  const before = (await box.boundingBox())!
  await box.dblclick()
  const dialog = page.getByRole("dialog", { name: "ボックスの編集" })
  await dialog.getByLabel("キャプション", { exact: true }).fill("あいうえおかきくけこさしすせそたちつてと")
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect.poll(async () => (await box.boundingBox())!.width).toBeGreaterThan(before.width * 2)
  expect(Math.abs((await box.boundingBox())!.x - before.x)).toBeLessThan(1)
  expect(
    await box
      .locator("div")
      .nth(1)
      .evaluate(el => el.scrollWidth > el.clientWidth),
  ).toBe(false)
})

test("ダイアログでキャプションと本文の寄せを選ぶと、箱の中の文がその寄せになる。既定はキャプションが中央、本文が左", async ({
  page,
}) => {
  await page.goto("/")
  await addBodyBox(page)
  const box = page.locator("[data-item]")
  const align = (i: number) =>
    box
      .locator("[data-align]")
      .nth(i)
      .evaluate(el => getComputedStyle(el).textAlign)
  expect([await align(0), await align(1)]).toEqual(["center", "left"])
  await box.dblclick()
  const dialog = page.getByRole("dialog", { name: "ボックスの編集" })
  await expect(
    dialog.getByRole("group", { name: "キャプションの寄せ" }).getByRole("radio", { name: "中央寄せ" }),
  ).toBeChecked()
  await dialog
    .getByRole("group", { name: "キャプションの寄せ" })
    .getByRole("radio", { name: "左寄せ" })
    .check({ force: true })
  await dialog.getByRole("group", { name: "本文の寄せ" }).getByRole("radio", { name: "右寄せ" }).check({ force: true })
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  expect([await align(0), await align(1)]).toEqual(["left", "right"])
})

test("ダイアログで箱のテーマを付箋紙にすると黄色の付箋になって右上が折り返り、ブックのテーマに戻すと元の見た目に戻る", async ({
  page,
}) => {
  await page.goto("/")
  await addBodyBox(page)
  const box = page.locator("[data-item] [data-body]")
  const look = () =>
    box.evaluate(el => ({
      fill: getComputedStyle(el).backgroundColor,
      fold: getComputedStyle(el, "::after").width,
    }))
  expect(await look()).toEqual({ fill: "rgb(255, 255, 255)", fold: "0px" })
  const choose = async (label: string) => {
    await page.locator("[data-item]").dblclick()
    const dialog = page.getByRole("dialog", { name: "ボックスの編集" })
    await dialog.getByLabel("テーマ").selectOption({ label })
    await dialog.getByRole("button", { name: "確定" }).click()
    await expect(dialog).toBeHidden()
  }
  await choose("付箋紙")
  expect(await look()).toEqual({ fill: "rgb(255, 243, 166)", fold: "12px" })
  await choose("ブックのテーマ")
  expect(await look()).toEqual({ fill: "rgb(255, 255, 255)", fold: "0px" })
})

test("編集のダイアログでテーマと寄せを選ぶと、確定の前から箱に出る。キャンセルで元に戻り、確定でそのままになる", async ({
  page,
}) => {
  await page.goto("/")
  await addBodyBox(page)
  const box = page.locator("[data-item] [data-body]")
  const fill = () => box.evaluate(el => getComputedStyle(el).backgroundColor)
  const bodyAlign = () =>
    page
      .locator("[data-item] [data-align]")
      .nth(1)
      .evaluate(el => getComputedStyle(el).textAlign)
  const dialog = page.getByRole("dialog", { name: "ボックスの編集" })
  const choose = async () => {
    await page.locator("[data-item]").dblclick()
    await dialog.getByLabel("テーマ").selectOption({ label: "付箋紙" })
    await dialog
      .getByRole("group", { name: "本文の寄せ" })
      .getByRole("radio", { name: "右寄せ" })
      .check({ force: true })
    await expect.poll(fill).toBe("rgb(255, 243, 166)")
    expect(await bodyAlign()).toBe("right")
  }
  await choose()
  await dialog.getByRole("button", { name: "キャンセル" }).click()
  await expect.poll(fill).toBe("rgb(255, 255, 255)")
  expect(await bodyAlign()).toBe("left")
  await choose()
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  expect(await fill()).toBe("rgb(255, 243, 166)")
  expect(await bodyAlign()).toBe("right")
})

test("編集のダイアログの色のボタンでポップアップを開き、テーマの色を選ぶと箱がその色になる。Escape はポップアップだけを閉じ、キャンセルで元に戻る", async ({
  page,
}) => {
  await page.goto("/")
  await addBodyBox(page)
  const box = page.locator("[data-item] [data-body]")
  const look = () =>
    box.evaluate(el => ({ fill: getComputedStyle(el).backgroundColor, text: getComputedStyle(el).color }))
  const dialog = page.getByRole("dialog", { name: "ボックスの編集" })
  const picker = page.getByRole("dialog", { name: "色を選ぶ" })
  await page.locator("[data-item]").dblclick()
  await dialog.getByRole("button", { name: "色", exact: true }).click()
  await picker.getByRole("button", { name: "テーマの色 1" }).click()
  await expect.poll(look).toEqual({ fill: "rgb(59, 130, 246)", text: "rgb(255, 255, 255)" })
  await page.keyboard.press("Escape")
  await expect(picker).toBeHidden()
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "キャンセル" }).click()
  await expect.poll(look).toEqual({ fill: "rgb(255, 255, 255)", text: "rgb(27, 27, 31)" })
})

test("テーマの色はテーマを変えるとそのテーマの色になり、値の欄に書いた色はどのテーマでもその色。なしで元の塗りに戻る", async ({
  page,
}) => {
  await page.goto("/")
  await addBodyBox(page)
  const box = page.locator("[data-item] [data-body]")
  const fill = () => box.evaluate(el => getComputedStyle(el).backgroundColor)
  const dialog = page.getByRole("dialog", { name: "ボックスの編集" })
  const picker = page.getByRole("dialog", { name: "色を選ぶ" })
  const edit = async (change: () => Promise<void>) => {
    await page.locator("[data-item]").dblclick()
    await change()
    await dialog.getByRole("button", { name: "確定" }).click()
    await expect(dialog).toBeHidden()
  }
  await edit(async () => {
    await dialog.getByRole("button", { name: "色", exact: true }).click()
    await picker.getByRole("button", { name: "テーマの色 1" }).click()
  })
  expect(await fill()).toBe("rgb(59, 130, 246)")
  await edit(() =>
    dialog
      .getByLabel("テーマ")
      .selectOption({ label: "付箋紙" })
      .then(() => {}),
  )
  expect(await fill()).toBe("rgb(207, 226, 255)")
  await edit(async () => {
    await dialog.getByRole("button", { name: "色", exact: true }).click()
    await picker.getByLabel("色の値（#rrggbb）").fill("#1e3a8a")
    await picker.getByLabel("色の値（#rrggbb）").press("Enter")
    await expect(dialog).toBeVisible()
  })
  expect(await fill()).toBe("rgb(30, 58, 138)")
  await edit(() =>
    dialog
      .getByLabel("テーマ")
      .selectOption({ label: "ブックのテーマ" })
      .then(() => {}),
  )
  expect(await fill()).toBe("rgb(30, 58, 138)")
  await edit(async () => {
    await dialog.getByRole("button", { name: "色", exact: true }).click()
    await picker.getByRole("button", { name: "なし" }).click()
  })
  expect(await fill()).toBe("rgb(255, 255, 255)")
})

test("設定のダイアログでブックのテーマと紙の色を選ぶと、確定の前から紙と中の箱に出る。キャンセルで戻り、確定でそのままになる", async ({
  page,
}) => {
  await page.goto("/")
  await addBodyBox(page)
  const paper = page.getByRole("img", { name: "紙" })
  const box = page.locator("[data-item] [data-body]")
  const look = async () => ({
    paper: await paper.evaluate(el => getComputedStyle(el).backgroundColor),
    box: await box.evaluate(el => getComputedStyle(el).backgroundColor),
  })
  const dialog = page.getByRole("dialog", { name: "ブックの設定" })
  const choose = async () => {
    const at = (await paper.boundingBox())!
    await page.mouse.click(at.x + 600, at.y + 400, { button: "right" })
    await page.getByRole("menu").getByRole("menuitem", { name: "ブックの設定" }).click()
    await dialog.getByLabel("テーマ").selectOption({ label: "付箋紙" })
    await expect.poll(look).toEqual({ paper: "rgb(244, 239, 228)", box: "rgb(255, 243, 166)" })
    await dialog.getByRole("button", { name: "紙の色" }).click()
    await page.getByRole("dialog", { name: "色を選ぶ" }).getByRole("button", { name: "#eff6ff" }).click()
    await page.keyboard.press("Escape")
    await expect.poll(look).toEqual({ paper: "rgb(239, 246, 255)", box: "rgb(255, 243, 166)" })
  }
  await choose()
  await dialog.getByRole("button", { name: "キャンセル" }).click()
  await expect.poll(look).toEqual({ paper: "rgb(255, 255, 255)", box: "rgb(255, 255, 255)" })
  await choose()
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  expect(await look()).toEqual({ paper: "rgb(239, 246, 255)", box: "rgb(255, 243, 166)" })
})

test("ブックの名前の欄のメニューからブックの設定を開いて名前を変えると、欄の名前が変わる。空の間は確定できない", async ({
  page,
}) => {
  await page.goto("/")
  const trigger = page.locator("button[aria-expanded]").first()
  await trigger.hover()
  await trigger.locator("xpath=following-sibling::div[1]").getByRole("button", { name: "ブックの設定" }).click()
  const dialog = page.getByRole("dialog", { name: "ブックの設定" })
  const name = dialog.getByLabel("ブックの名前")
  await expect(name).toHaveValue("まとめ図の構想")
  await name.fill("  ")
  await expect(dialog.getByRole("button", { name: "確定" })).toBeDisabled()
  await name.fill("新しい名前")
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  await expect(trigger).toHaveText("新しい名前")
})

test("箱の右の辺を右の箱へ向けて広げると、手を離したときに右の箱が押されて右へずれる", async ({ page }) => {
  await page.goto("/")
  for (const [x, caption] of [
    [120, "左"],
    [260, "右"],
  ] as const) {
    await page.getByRole("button", { name: "箱" }).click()
    const at = await onPaper(page, x, 120)
    await addBox(page, at.x, at.y, caption)
  }
  const boxes = page.locator("[data-item]")
  const before = (await boxes.nth(1).boundingBox())!
  await boxes.nth(0).click()
  await dragGrip(page, "right", 120, 0)
  await expect.poll(async () => (await boxes.nth(1).boundingBox())!.x).toBeGreaterThan(before.x)
  // 押された箱は、広げた箱の右の端から間隔の下限（8px）先。縦には動かない
  const left = (await boxes.nth(0).boundingBox())!
  const after = (await boxes.nth(1).boundingBox())!
  const zoom = await zoomOf(page)
  expect(Math.abs(after.x - (left.x + left.width + 8 * zoom))).toBeLessThan(1)
  expect(Math.abs(after.y - before.y)).toBeLessThan(1)
})

test("ドラッグ中はほかの箱が薄くなって動かず、右の箱に浅く入れて離すと手前へ戻る。半分入れるとその場で入れ替わり、離すと入れ替わった並びになる", async ({
  page,
}) => {
  await page.goto("/")
  for (const [x, caption] of [
    [120, "左"],
    [260, "右"],
  ] as const) {
    await page.getByRole("button", { name: "箱" }).click()
    const at = await onPaper(page, x, 120)
    await addBox(page, at.x, at.y, caption)
  }
  const zoom = await zoomOf(page)
  const left = page.locator("[data-item]", { hasText: "左" })
  const right = page.locator("[data-item]", { hasText: "右" })
  const x = async (box: typeof left) => (await box.boundingBox())!.x
  const drag = async (dx: number, during?: () => Promise<void>) => {
    const b = (await left.boundingBox())!
    await page.mouse.move(b.x + 20, b.y + 20)
    await page.mouse.down()
    await page.mouse.move(b.x + 20 + dx, b.y + 20, { steps: 8 })
    await during?.()
    await page.mouse.up()
  }
  const start = { left: await x(left), right: await x(right) }
  const touch = start.right - start.left - 64 * zoom // 左の箱の右の端が、右の箱の左の端に来るまで
  // 浅く（16px）入れる: ドラッグ中、右の箱は薄くなって動かない。離すと左の箱は右の箱の手前（間隔 8px）へ戻る
  await drag(touch + 16 * zoom, async () => {
    await expect(right).toHaveAttribute("data-look", "faded")
    await expect(left).toHaveAttribute("data-look", "lifted")
    expect(await x(right)).toBe(start.right)
  })
  await expect(right).not.toHaveAttribute("data-look")
  await expect.poll(() => x(left)).toBeCloseTo(start.right - 8 * zoom - 64 * zoom, 0)
  expect(await x(right)).toBe(start.right)
  // 半分（32px）より深く入れる: ドラッグ中にその場で入れ替わり、離すと右の箱は左の箱のいた所、左の箱は右の箱のいた所へ
  const near = await x(left)
  await drag(start.right - near - 64 * zoom + 40 * zoom, async () => {
    await expect.poll(() => x(right)).toBeCloseTo(near, 0)
  })
  await expect.poll(() => x(left)).toBeCloseTo(start.right, 0)
  expect(await x(right)).toBeCloseTo(near, 0)
})

test("箱を右へ広げて、押した右の箱が紙の右の端で詰まると、右の箱が縮んで収まる（キャプションが切れない幅まで）", async ({
  page,
}) => {
  await page.goto("/")
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  const zoom = await zoomOf(page)
  for (const [x, caption] of [
    [120, "左"],
    [260, "右"],
  ] as const) {
    await page.getByRole("button", { name: "箱" }).click()
    const at = await onPaper(page, x, 120)
    await addBox(page, at.x, at.y, caption)
  }
  const right = page.locator("[data-item]", { hasText: "右" })
  // 右の箱を広げて、紙の右の端の近くまで伸ばす
  await right.click()
  await dragGrip(page, "right", paper.x + paper.width - 20 * zoom - (await right.boundingBox())!.x - 64 * zoom, 0)
  const wide = (await right.boundingBox())!
  expect(wide.width).toBeGreaterThan(400 * zoom)
  // 左の箱を右へ大きく広げる: 右の箱は押されて縮む。右の端は紙の中、幅はキャプションが切れない幅（64）以上
  const left = page.locator("[data-item]", { hasText: "左" })
  await left.click()
  await dragGrip(page, "right", 300 * zoom, 0)
  await expect.poll(async () => (await right.boundingBox())!.width).toBeLessThan(wide.width - 100 * zoom)
  const after = (await right.boundingBox())!
  expect(after.x + after.width).toBeLessThanOrEqual(paper.x + paper.width + 0.5)
  expect(after.width).toBeGreaterThanOrEqual(64 * zoom - 0.5)
})
