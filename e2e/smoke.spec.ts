import { expect, type Page, test } from "@playwright/test"

// i 番目のステージの下の行のブックの名前のボタンにマウスを乗せ、せり上がったメニューの中のボタンを返す
async function fromMenu(page: Page, name: string, i = 0) {
  const trigger = page.locator('button[aria-haspopup="menu"]').nth(i)
  await trigger.hover()
  return trigger.locator("xpath=following-sibling::div[1]").getByRole("button", { name })
}

test("分割すると、右のステージは何も開かず真ん中でブックを選べ、選ぶと右に紙が出る", async ({ page }) => {
  await page.goto("/")
  const papers = page.getByRole("img", { name: "紙" })
  await expect(papers).toHaveCount(1)
  await (await fromMenu(page, "画面を分割")).click()
  const right = page.getByRole("region", { name: "ステージ" }).nth(1)
  await expect(right.getByText("ブックを選択してください")).toBeVisible()
  await expect(papers).toHaveCount(1)
  const input = right.getByRole("combobox", { name: "ブックを探す" })
  await input.click()
  await input.pressSequentially("振り返り")
  await expect(right.getByRole("option")).toHaveText(["週次の振り返り"])
  await input.press("Enter")
  await expect(papers).toHaveCount(2)
  const [left, r] = [await papers.nth(0).boundingBox(), await papers.nth(1).boundingBox()]
  expect(r!.x).toBeGreaterThan(left!.x)
  await expect(page.getByRole("tablist").nth(1)).toHaveAttribute("aria-label", "週次の振り返り")
})

test("タブの左のボタンでダイアログが開き、打った文字で絞り込んで選ぶと、そのステージで開く", async ({ page }) => {
  await page.goto("/")
  await (await fromMenu(page, "ブックを開く")).click()
  const dialog = page.getByRole("dialog", { name: "ブックを開く" })
  await expect(dialog).toBeVisible()
  const input = dialog.getByRole("combobox", { name: "ブックを探す" })
  await expect(input).toBeFocused()
  await page.keyboard.type("design")
  await expect(dialog.getByRole("option")).toHaveText(["Design Notes"])
  await page.keyboard.press("Enter")
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("tablist")).toHaveAttribute("aria-label", "Design Notes")
})

test("絞り込んで候補が減っても、探すテキストFormの位置は変わらない（ステージの真ん中とダイアログ）", async ({
  page,
}) => {
  await page.goto("/")
  await (await fromMenu(page, "画面を分割")).click()
  const stage = page.getByRole("region", { name: "ステージ" }).nth(1)
  await (await fromMenu(page, "ブックを開く")).click()
  const dialog = page.getByRole("dialog", { name: "ブックを開く" })
  for (const place of [dialog, stage]) {
    const input = place.getByRole("combobox", { name: "ブックを探す" })
    const before = await input.boundingBox()
    await input.fill("振り返り")
    await expect(place.getByRole("option")).toHaveText(["週次の振り返り"])
    expect(await input.boundingBox()).toEqual(before)
    await input.fill("当てはまらない言葉")
    await expect(place.getByText("当てはまるブックはありません")).toBeVisible()
    expect(await input.boundingBox()).toEqual(before)
    if (place === dialog) await page.keyboard.press("Escape")
  }
})

test("ダイアログは Esc で閉じ、ブックは変わらない", async ({ page }) => {
  await page.goto("/")
  await (await fromMenu(page, "ブックを開く")).click()
  const dialog = page.getByRole("dialog", { name: "ブックを開く" })
  await expect(dialog).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("tablist")).toHaveAttribute("aria-label", "まとめ図の構想")
})

test("マスターのボタンで、カレントのステージがマスターの画面になり、ブックを開くと紙に戻る", async ({ page }) => {
  await page.goto("/")
  await (await fromMenu(page, "ホーム")).click()
  await expect(page.getByRole("region", { name: "マスター" })).toBeVisible()
  await expect(page.getByRole("img", { name: "紙" })).toHaveCount(0)
  await expect(page.getByRole("tablist")).toHaveCount(0)
  await (await fromMenu(page, "ブックを開く")).click()
  await page.keyboard.type("残課題")
  await page.keyboard.press("Enter")
  await expect(page.getByRole("img", { name: "紙" })).toHaveCount(1)
  await expect(page.getByRole("tablist")).toHaveAttribute("aria-label", "残課題")
})

test("分割した右のステージで探すテキストFormからマスターを選ぶと、右にマスターが開く", async ({ page }) => {
  await page.goto("/")
  await (await fromMenu(page, "画面を分割")).click()
  const right = page.getByRole("region", { name: "ステージ" }).nth(1)
  await expect(right.getByRole("option").first()).toHaveText("マスター")
  await right.getByRole("option", { name: "マスター" }).click()
  await expect(right.getByRole("region", { name: "マスター" })).toBeVisible()
  await expect(page.getByRole("img", { name: "紙" })).toHaveCount(1)
  await expect(await fromMenu(page, "ホーム", 1)).toHaveAttribute("aria-pressed", "true")
})

test("分割した右のステージを閉じると、左のステージが画面全体に広がる", async ({ page }) => {
  await page.goto("/")
  const full = await page.getByRole("region", { name: "ステージ" }).boundingBox()
  await (await fromMenu(page, "画面を分割")).click()
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(2)
  await page.getByRole("button", { name: "ステージを閉じる" }).nth(1).click()
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(1)
  await expect(page.getByRole("button", { name: "ステージを閉じる" })).toHaveCount(0)
  await expect(page.getByRole("img", { name: "紙" })).toHaveCount(1)
  expect(await page.getByRole("region", { name: "ステージ" }).boundingBox()).toEqual(full)
})

test("ハンドの道具ではドラッグで紙がずれ、ずらせるのは紙の周りの余白までで止まる", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "選択ツール" }).click()
  await page.getByRole("button", { name: "付け替えツール" }).click()
  await expect(page.getByRole("button", { name: "ハンドツール" })).toBeVisible()
  const paper = page.getByRole("img", { name: "紙" })
  const stage = page.getByRole("region", { name: "ステージ" })
  const before = (await paper.boundingBox())!
  const box = (await stage.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 2000, box.y + box.height / 2 - 2000, { steps: 5 })
  await page.mouse.up()
  const after = (await paper.boundingBox())!
  expect(after.y).toBeLessThan(before.y)
  // 下の余白が見えきったところで止まる
  const bottomGap = box.y + box.height - (after.y + after.height)
  expect(bottomGap).toBeGreaterThan(80)
  expect(bottomGap).toBeLessThan(96)
})

test("＋で開くダイアログでページを作るとタブが増え、そのページが選ばれ、選んだ紙になる", async ({ page }) => {
  await page.goto("/")
  const before = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  await page.getByRole("button", { name: "ページを足す" }).click()
  const dialog = page.getByRole("dialog", { name: "新しいページ" })
  await expect(dialog.getByLabel("ページの名前")).toBeFocused()
  await dialog.getByLabel("向き").selectOption("portrait")
  await page.keyboard.press("Enter")
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("tab")).toHaveText(["ページ 1", "ページ 2"])
  const after = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  expect(after.height).toBeGreaterThan(before.height)
  await expect(page.getByRole("tab", { name: "ページ 2" })).toHaveAttribute("aria-selected", "true")
})

test("ページが多くてタブが横にあふれているとき、タブの上でホイールを回すと横にスクロールする", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 600 })
  await page.goto("/")
  // タブは縮んで「…」になってから、横にあふれる
  for (let i = 0; i < 24; i++) {
    await page.getByRole("button", { name: "ページを足す" }).click()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("dialog", { name: "新しいページ" })).toBeHidden()
  }
  const tabs = page.getByRole("tablist").first()
  expect(await tabs.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true)
  const before = await tabs.evaluate(el => el.scrollLeft)
  await tabs.hover()
  await page.mouse.wheel(0, 200)
  await expect.poll(() => tabs.evaluate(el => el.scrollLeft)).toBeGreaterThan(before)
})

test("分割して右で同じブックを開くと右にもタブがあり、右で足したページは右だけで開く", async ({ page }) => {
  await page.goto("/")
  await (await fromMenu(page, "画面を分割")).click()
  const right = page.getByRole("region", { name: "ステージ" }).nth(1)
  await right.getByRole("option", { name: "まとめ図の構想" }).click()
  const lists = page.getByRole("tablist")
  await expect(lists).toHaveCount(2)
  await lists.nth(1).getByRole("button", { name: "ページを足す" }).click()
  await page.getByRole("dialog", { name: "新しいページ" }).getByRole("button", { name: "作成" }).click()
  await expect(lists.nth(0).getByRole("tab", { selected: true })).toHaveText("ページ 1")
  await expect(lists.nth(1).getByRole("tab", { selected: true })).toHaveText("ページ 2")
  // 右のタブは、右のステージの真下で、ブックの名前のボタン（156px）の右にある
  const bar = (await lists.nth(1).boundingBox())!
  const stage = (await right.boundingBox())!
  expect(bar.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1)
  expect(bar.x).toBeGreaterThanOrEqual(stage.x + 156)
  expect(bar.x).toBeLessThan(stage.x + 180)
})

test("マスターで新しいブックを作ると空のブックが開き、ページを作ると最初のタブと紙が出る", async ({ page }) => {
  await page.goto("/")
  await (await fromMenu(page, "ホーム")).click()
  await page.getByRole("button", { name: "新しいブック" }).click()
  const dialog = page.getByRole("dialog", { name: "新しいブック" })
  await expect(dialog.getByRole("button", { name: "作成" })).toBeDisabled()
  await page.keyboard.type("新しい図")
  await page.keyboard.press("Enter")
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("tablist")).toHaveAttribute("aria-label", "新しい図")
  await expect(page.getByRole("img", { name: "紙" })).toHaveCount(0)
  await page.getByRole("button", { name: "ページを作る" }).click()
  await page.getByRole("dialog", { name: "新しいページ" }).getByRole("button", { name: "作成" }).click()
  await expect(page.getByRole("tab")).toHaveText(["ページ 1"])
  await expect(page.getByRole("img", { name: "紙" })).toHaveCount(1)
  // 作ったブックは探すテキストFormにも出る
  await (await fromMenu(page, "ブックを開く")).click()
  await page.keyboard.type("新しい")
  await expect(page.getByRole("dialog", { name: "ブックを開く" }).getByRole("option")).toHaveText(["新しい図"])
})

test("マスターの設定で言語とスキンを変えると、画面がすぐに変わる", async ({ page }) => {
  await page.goto("/")
  await (await fromMenu(page, "ホーム")).click()
  await page.getByLabel("スキン").selectOption("@matomezu/base:light")
  await expect(page.locator("html")).toHaveAttribute("data-skin", "@matomezu/base:light")
  await page.getByLabel("言語").selectOption("matomezu:en")
  await expect(page.getByRole("button", { name: "New book" })).toBeVisible()
  await expect(page.locator("html")).toHaveAttribute("lang", "en")
})

test("ブックの名前のボタンにマウスを乗せるとメニューがせり上がり、離れると下がる。押しても出る", async ({ page }) => {
  await page.goto("/")
  const trigger = page.getByRole("button", { name: "まとめ図の構想" })
  const menu = trigger.locator("xpath=following-sibling::div[1]")
  await expect(menu).toBeHidden()
  await trigger.hover()
  await expect(menu).toBeVisible()
  await page.mouse.move(600, 300)
  await expect(menu).toBeHidden()
  await trigger.dispatchEvent("click")
  await expect(menu).toBeVisible()
  // 下の行はステージの下にあり、上の行（ツールボックス）より細い
  const footer = (await trigger.boundingBox())!
  const tools = (await page.getByRole("toolbar", { name: "ツール" }).boundingBox())!
  const stage = (await page.getByRole("region", { name: "ステージ" }).boundingBox())!
  expect(footer.y).toBeGreaterThanOrEqual(stage.y + stage.height)
  expect(footer.height).toBeLessThan(tools.height)
  expect(footer.width).toBe(156)
})

test("分割すると、ツールボックスの無いステージでも右上に閉じるボタンがある。画面は縦にはみ出さない", async ({
  page,
}) => {
  await page.goto("/")
  await (await fromMenu(page, "画面を分割")).click()
  // 何も開いていないステージのブックの名前のボタンは空。空でも下の行からはみ出さない
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBe(0)
  const right = page.getByRole("region", { name: "ステージ" }).nth(1)
  const close = (await page.getByRole("button", { name: "ステージを閉じる" }).nth(1).boundingBox())!
  const box = (await right.boundingBox())!
  expect(close.y).toBeLessThan(box.y + 20)
  expect(close.x + close.width).toBeGreaterThan(box.x + box.width - 20)
})

test.describe("ブラウザの言語が英語のとき", () => {
  test.use({ locale: "en-US" })
  test("画面の文言が英語になる", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
    await (await fromMenu(page, "Split screen")).click()
    await expect(page.getByText("Select a book")).toBeVisible()
    await expect(page.getByRole("combobox", { name: "Search books" })).toHaveAttribute(
      "placeholder",
      "Search by book name",
    )
  })
})

test("図面の画面を右クリックすると押した位置にメニューが出て、設定を押すと設定のダイアログが開く。外を押すと閉じる", async ({
  page,
}) => {
  await page.goto("/")
  const paper = page.getByRole("img", { name: "紙" })
  const box = (await paper.boundingBox())!
  await page.mouse.click(box.x + 30, box.y + 40, { button: "right" })
  const menu = page.getByRole("menu")
  await expect(menu).toBeVisible()
  const at = (await menu.boundingBox())!
  expect(Math.round(at.x)).toBe(Math.round(box.x + 30))
  expect(Math.round(at.y)).toBe(Math.round(box.y + 40))
  await page.mouse.click(box.x + 200, box.y + 200)
  await expect(menu).toHaveCount(0)
  await page.mouse.click(box.x + 30, box.y + 40, { button: "right" })
  await menu.getByRole("menuitem", { name: "ブックの設定" }).click()
  await expect(menu).toHaveCount(0)
  const dialog = page.getByRole("dialog", { name: "ブックの設定" })
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "キャンセル" }).click()
  await expect(dialog).toHaveCount(0)
})

test("右クリックのメニューは、窓の右下で開いても窓の中に収まる", async ({ page }) => {
  await page.goto("/")
  const size = page.viewportSize()!
  const stage = (await page.getByRole("region", { name: "ステージ" }).boundingBox())!
  await page.mouse.click(stage.x + stage.width - 4, stage.y + stage.height - 4, { button: "right" })
  const at = (await page.getByRole("menu").boundingBox())!
  expect(at.x + at.width).toBeLessThanOrEqual(size.width)
  expect(at.y + at.height).toBeLessThanOrEqual(size.height)
})

test("分割の境目をドラッグすると左右の幅が変わり、分割をやめて分け直してもその幅。境目のダブルクリックで真ん中に戻る", async ({
  page,
}) => {
  await page.goto("/")
  const stages = page.getByRole("region", { name: "ステージ" })
  const full = (await stages.boundingBox())!
  await (await fromMenu(page, "画面を分割")).click()
  await expect(stages).toHaveCount(2)
  const leftWidth = async () => (await stages.nth(0).boundingBox())!.width
  expect(Math.abs((await leftWidth()) - full.width / 2)).toBeLessThan(2)
  const divider = page.locator("[data-divider]")
  const at = (await divider.boundingBox())!
  const color = () => divider.evaluate(el => getComputedStyle(el).backgroundImage)
  await page.mouse.move(at.x + at.width / 2, at.y + 200)
  expect(await color()).toBe("none")
  await page.mouse.down()
  expect(await color()).not.toBe("none")
  await page.mouse.move(full.x + full.width * 0.3, at.y + 200, { steps: 5 })
  await page.mouse.up()
  expect(Math.abs((await leftWidth()) - full.width * 0.3)).toBeLessThan(3)
  await page.getByRole("button", { name: "ステージを閉じる" }).nth(1).click()
  await expect(stages).toHaveCount(1)
  await (await fromMenu(page, "画面を分割")).click()
  await expect(stages).toHaveCount(2)
  expect(Math.abs((await leftWidth()) - full.width * 0.3)).toBeLessThan(3)
  await divider.dblclick()
  expect(Math.abs((await leftWidth()) - full.width / 2)).toBeLessThan(2)
})

test("分割すると、カレントのステージの下の行だけ色が少し変わり、もう片方を押すとそちらに移る", async ({ page }) => {
  await page.goto("/")
  await (await fromMenu(page, "画面を分割")).click()
  const stages = page.getByRole("region", { name: "ステージ" })
  await expect(stages).toHaveCount(2)
  const bottoms = page.locator("main > [data-current]")
  const current = () => bottoms.evaluateAll(cols => cols.map(c => c.getAttribute("data-current")))
  expect(await current()).toEqual(["true", "false"])
  await stages.nth(1).click({ position: { x: 20, y: 20 } })
  expect(await current()).toEqual(["false", "true"])
  const bg = (i: number) =>
    bottoms
      .nth(i)
      .locator(":scope > div")
      .nth(2)
      .evaluate(el => getComputedStyle(el).backgroundColor)
  expect(await bg(0)).not.toBe(await bg(1))
  const accent = (i: number) =>
    page
      .getByRole("button", { name: /まとめ図の構想|ブックのメニュー/ })
      .nth(i)
      .evaluate(el => getComputedStyle(el).boxShadow)
  expect(await accent(0)).toBe("none")
  expect(await accent(1)).not.toBe("none")
})

// locator の物に右クリック（contextmenu）を送り、既定の動き（ブラウザのメニュー）が止められたかを返す
const browserMenuStopped = (target: import("@playwright/test").Locator) =>
  target.evaluate(el => !el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })))

test("ブックを選ぶ画面と、ブックを開くダイアログ（幕も）の右クリックではブラウザのメニューを出さず、テキストFormの中では出す", async ({
  page,
}) => {
  await page.goto("/")
  await (await fromMenu(page, "画面を分割")).click()
  const stage = page.getByRole("region", { name: "ステージ" }).nth(1)
  await expect(stage.getByText("ブックを選択してください")).toBeVisible()
  expect(await browserMenuStopped(stage)).toBe(true)
  expect(await browserMenuStopped(stage.getByRole("option").first())).toBe(true)
  expect(await browserMenuStopped(stage.getByRole("combobox", { name: "ブックを探す" }))).toBe(false)
  await (await fromMenu(page, "ブックを開く")).click()
  const dialog = page.getByRole("dialog", { name: "ブックを開く" })
  await expect(dialog).toBeVisible()
  expect(await browserMenuStopped(dialog)).toBe(true)
  expect(await browserMenuStopped(dialog.getByRole("option").first())).toBe(true)
  expect(await browserMenuStopped(dialog.getByRole("combobox", { name: "ブックを探す" }))).toBe(false)
})
