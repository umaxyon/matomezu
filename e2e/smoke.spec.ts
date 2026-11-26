import { BOOK_SCREEN_URL, expect, test } from "./fixtures"
import { browserMenuStopped } from "./helpers/browser-menu"
import { stillBox } from "./helpers/motion"
import { addFromTabs, openNewBookDialog } from "./helpers/new-book"
import { openGeneral } from "./helpers/settings"
import { lowerLibrary, splitWith } from "./helpers/split"
import { fromMenu, menuOf } from "./helpers/stage-menu"

test("下の行のどこに乗せても、ブックの名前のメニューがせり上がり、下の行から離れると下がる", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const trigger = page.locator('button[aria-haspopup="menu"]').first()
  // ページタブの右の空いた所に乗せる（名前のボタンには乗せない）
  const tabs = (await page.getByRole("tablist").first().boundingBox())!
  await page.mouse.move(tabs.x + tabs.width - 20, tabs.y + tabs.height / 2)
  await expect(trigger).toHaveAttribute("aria-expanded", "true")
  // 下の行からメニューへ動いても下がらず、メニューのボタンを押せる
  const open = menuOf(trigger).getByRole("button", { name: "書庫を開く" })
  await open.hover()
  await expect(trigger).toHaveAttribute("aria-expanded", "true")
  // 紙の真ん中へ離れると下がる
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  await page.mouse.move(paper.x + paper.width / 2, paper.y + paper.height / 2)
  await expect(trigger).toHaveAttribute("aria-expanded", "false")
})

test("分割すると、右のステージは何も開かず、下に出た書庫のスクリーンでブックを選ぶと右に紙が出る", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const papers = page.getByRole("img", { name: "紙" })
  await expect(papers).toHaveCount(1)
  await (await fromMenu(page, "画面を分割")).click()
  const right = page.getByRole("region", { name: "ステージ" }).nth(1)
  await expect(right.getByRole("combobox")).toHaveCount(0)
  await expect(papers).toHaveCount(1)
  await lowerLibrary(page).getByRole("button", { name: "週次の振り返り" }).dblclick()
  await expect(papers).toHaveCount(2)
  const [left, r] = [await papers.nth(0).boundingBox(), await papers.nth(1).boundingBox()]
  expect(r!.x).toBeGreaterThan(left!.x)
  await expect(page.getByRole("tablist").nth(1)).toHaveAttribute("aria-label", "週次の振り返り")
})

test("ダイアログの中で押し始めて外で離しても閉じず、外側を押して離すと閉じる", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  await (await fromMenu(page, "ページの設定")).click()
  const dialog = page.getByRole("dialog", { name: "ページの設定" })
  const box = (await dialog.getByRole("textbox").first().boundingBox())!
  await page.mouse.move(box.x + 8, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(2, 2, { steps: 4 })
  await page.mouse.up()
  await expect(dialog).toBeVisible()
  await page.mouse.click(2, 2)
  await expect(dialog).toBeHidden()
})

test("ダイアログは Esc で閉じ、ブックは変わらない", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  await (await fromMenu(page, "ページの設定")).click()
  const dialog = page.getByRole("dialog", { name: "ページの設定" })
  await expect(dialog).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("tablist")).toHaveAttribute("aria-label", "まとめ図の構想")
})

test("分割して下に出た書庫のスクリーンの「ブック新規作成」で作ると、右のステージにそのブックが開く", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await (await fromMenu(page, "画面を分割")).click()
  await openNewBookDialog(page)
  await page.keyboard.type("右で作った図")
  await page.keyboard.press("Enter")
  await expect(page.getByRole("dialog", { name: "新しいブック" })).toBeHidden()
  await expect(page.getByRole("tablist").nth(1)).toHaveAttribute("aria-label", "右で作った図")
})

test("分割した右のステージを閉じると、左のステージが画面全体に広がる", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const full = await page.getByRole("region", { name: "ステージ" }).boundingBox()
  await (await fromMenu(page, "画面を分割")).click()
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(2)
  await page.getByRole("button", { name: "ステージを閉じる" }).nth(1).click()
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(1)
  await expect(page.getByRole("button", { name: "ステージを閉じる" })).toHaveCount(0)
  await expect(page.getByRole("img", { name: "紙" })).toHaveCount(1)
  // 下の書庫のスクリーンが右へ出ていき終えてから伸びる（伸び始めるまでは止まって見える）
  await expect
    .poll(async () => (await page.getByRole("region", { name: "ステージ" }).boundingBox())?.height)
    .toBe(full?.height)
  expect(await stillBox(page.getByRole("region", { name: "ステージ" }))).toEqual(full)
})

test("ハンドの道具ではドラッグで紙がずれ、ずらせるのは紙の周りの余白までで止まる", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
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
  await page.goto(BOOK_SCREEN_URL)
  const before = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  await addFromTabs(page)
  const dialog = page.getByRole("dialog", { name: /^新しい/ })
  await expect(dialog.getByLabel("ページの名前")).toBeFocused()
  await dialog.getByLabel("向き").selectOption("portrait")
  await page.keyboard.press("Enter")
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("tab")).toHaveText(["ページ 1", "ページ 2"])
  const after = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  expect(after.height).toBeGreaterThan(before.height)
  await expect(page.getByRole("tab", { name: "ページ 2" })).toHaveAttribute("aria-selected", "true")
})

test("ページが多くてタブが横にあふれているとき、開いたページのタブが見える所まで送られ、タブの上でホイールを回すと横にスクロールする", async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 600 })
  await page.goto(BOOK_SCREEN_URL)
  // タブは縮んで「…」になってから、横にあふれる
  for (let i = 0; i < 24; i++) {
    await addFromTabs(page)
    await page.keyboard.press("Enter")
    await expect(page.getByRole("dialog", { name: /^新しい/ })).toBeHidden()
  }
  const tabs = page.getByRole("tablist").first()
  expect(await tabs.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true)
  // 足したページはタブを押さずに開くが、そのタブが見える所まで並びが送られている
  const box = (await tabs.boundingBox())!
  const last = (await tabs.getByRole("tab", { name: "ページ 25" }).boundingBox())!
  expect(last.x).toBeGreaterThanOrEqual(box.x)
  expect(last.x + last.width).toBeLessThanOrEqual(box.x + box.width + 1)
  await tabs.getByRole("tab", { name: "ページ 1", exact: true }).click()
  await expect.poll(() => tabs.evaluate(el => el.scrollLeft)).toBe(0)
  await tabs.hover()
  await page.mouse.wheel(0, 200)
  await expect.poll(() => tabs.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
})

test("分割して右で同じブックを開くと右にもタブがあり、右で足したページは右だけで開く", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  await splitWith(page, "まとめ図の構想")
  const right = page.getByRole("region", { name: "ステージ" }).nth(1)
  const lists = page.getByRole("tablist")
  await expect(lists).toHaveCount(2)
  await addFromTabs(lists.nth(1))
  await page
    .getByRole("dialog", { name: /^新しい/ })
    .getByRole("button", { name: "作成" })
    .click()
  await expect(lists.nth(0).getByRole("tab", { selected: true })).toHaveText("ページ 1")
  await expect(lists.nth(1).getByRole("tab", { selected: true })).toHaveText("ページ 2")
  // 右のタブは、右のステージの真下で、閉じるとブックの名前の枠（156px）と置き場所のフォルダの絵の右にある。フォルダの絵は名前の枠のすぐ右に詰めて置く
  const bar = (await lists.nth(1).boundingBox())!
  const stage = (await right.boundingBox())!
  const close = (await page.locator("[data-footer-close]").nth(1).boundingBox())!
  const place = (await page
    .getByRole("button", { name: /^置き場所: / })
    .nth(1)
    .boundingBox())!
  expect(bar.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1)
  expect(place.x).toBeGreaterThanOrEqual(stage.x + close.width + 156)
  expect(place.x).toBeLessThan(stage.x + close.width + 156 + 2)
  expect(place.width).toBeLessThan(24)
  // フォルダの絵の左（名前の枠から）と右（タブから）の余白はそろい、絵はタブの縦の中央に在る
  const svg = (await page
    .getByRole("button", { name: /^置き場所: / })
    .nth(1)
    .locator("svg")
    .boundingBox())!
  const tab = (await lists.nth(1).getByRole("tab").first().boundingBox())!
  expect(Math.abs(svg.x - place.x - (tab.x - (svg.x + svg.width)))).toBeLessThanOrEqual(1)
  expect(Math.abs(svg.y + svg.height / 2 - (tab.y + tab.height / 2))).toBeLessThanOrEqual(1)
})

test("在るブックと同じ名前では作れず、ダイアログの中に「同じ名前があります」が出て、名前を変えると作れる", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await (await fromMenu(page, "画面を分割")).click()
  const dialog = await openNewBookDialog(page)
  await page.keyboard.type("まとめ図の構想")
  await page.keyboard.press("Enter")
  await expect(dialog.getByText("同じ名前があります")).toBeVisible()
  await page.keyboard.type(" 2")
  await page.keyboard.press("Enter")
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("tablist").nth(1)).toHaveAttribute("aria-label", "まとめ図の構想 2")
})

test("下に出た書庫のスクリーンの「ブック新規作成」で作ると空のブックが開き、ページを作ると最初のタブと紙が出る", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await (await fromMenu(page, "画面を分割")).click()
  const dialog = await openNewBookDialog(page)
  await expect(dialog.getByRole("button", { name: "作成" })).toBeDisabled()
  await page.keyboard.type("新しい図")
  await page.keyboard.press("Enter")
  await expect(dialog).toBeHidden()
  await page.getByRole("button", { name: "ステージを閉じる" }).first().click()
  await expect(page.getByRole("tablist")).toHaveAttribute("aria-label", "新しい図")
  await expect(page.getByRole("img", { name: "紙" })).toHaveCount(0)
  await addFromTabs(page, "図面")
  await page
    .getByRole("dialog", { name: /^新しい/ })
    .getByRole("button", { name: "作成" })
    .click()
  await expect(page.getByRole("tab")).toHaveText(["ページ 1"])
  await expect(page.getByRole("img", { name: "紙" })).toHaveCount(1)
  // 作ったブックは、「書庫を開く」で下に出た書庫のスクリーンにも出る
  await (await fromMenu(page, "書庫を開く")).click()
  await expect(lowerLibrary(page).getByRole("button", { name: "新しい図" })).toBeVisible()
})

test("設定画面の「全体」で言語とスキンを変えると、画面がすぐに変わる", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const general = await openGeneral(page)
  await general.getByLabel("スキン").selectOption("@matomezu/base:light")
  await expect(page.locator("html")).toHaveAttribute("data-skin", "@matomezu/base:light")
  await general.getByLabel("言語").selectOption("matomezu:en")
  await expect(page.getByRole("tab", { name: "General" })).toBeVisible()
  await expect(page.locator("html")).toHaveAttribute("lang", "en")
})

test("ブックの名前のボタンにマウスを乗せるとメニューがせり上がり、離れると下がる。押しても出る", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const trigger = page.getByRole("button", { name: "まとめ図の構想" })
  const menu = menuOf(trigger)
  await expect(menu).toBeHidden()
  await trigger.hover()
  await expect(menu).toBeVisible()
  await page.mouse.move(600, 300)
  await expect(menu).toBeHidden()
  await trigger.dispatchEvent("click")
  await expect(menu).toBeVisible()
  // 下の行はステージの下にある
  // 名前の枠（鍵・鳥と名前のボタンを入れる）は 156px
  const footer = (await page.locator("[data-book-name]").first().boundingBox())!
  const stage = (await page.getByRole("region", { name: "ステージ" }).boundingBox())!
  expect(footer.y).toBeGreaterThanOrEqual(stage.y + stage.height)
  expect(footer.width).toBe(156)
})

test("分割すると、ツールボックスの無いステージでも下の行の左に閉じるボタンがある。画面は縦にはみ出さない", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await (await fromMenu(page, "画面を分割")).click()
  // 何も開いていないステージのブックの名前のボタンは空。空でも下の行からはみ出さない
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBe(0)
  const right = page.getByRole("region", { name: "ステージ" }).nth(1)
  const close = (await page.getByRole("button", { name: "ステージを閉じる" }).nth(1).boundingBox())!
  const box = (await right.boundingBox())!
  expect(close.y + close.height).toBeGreaterThan(box.y + box.height - 40)
  expect(close.x).toBeLessThan(box.x + 40)
})

test.describe("ブラウザの言語が英語のとき", () => {
  test.use({ locale: "en-US" })
  test("画面の文言が英語になる", async ({ page }) => {
    await page.goto(BOOK_SCREEN_URL)
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
    await (await fromMenu(page, "Split screen")).click()
    await expect(page.getByRole("list", { name: "Contents of Library" }).locator("visible=true")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(await fromMenu(page, "Open library")).toBeVisible()
  })
})

test("図面の画面を右クリックすると押した位置にメニューが出て、設定を押すと設定のダイアログが開く。外を押すと閉じる", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  const paper = page.getByRole("img", { name: "紙" })
  const box = (await paper.boundingBox())!
  await page.mouse.click(box.x + 30, box.y + 40, { button: "right" })
  const menu = page.getByRole("menu")
  await expect(menu).toBeVisible()
  const at = (await menu.boundingBox())!
  expect(Math.round(at.x)).toBe(Math.round(box.x + 30))
  expect(Math.round(at.y)).toBe(Math.round(box.y + 40))
  // メニューの外（メニューより右下）を押す
  await page.mouse.click(at.x + at.width + 100, at.y + at.height + 100)
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
  await page.goto(BOOK_SCREEN_URL)
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
  await page.goto(BOOK_SCREEN_URL)
  const stages = page.getByRole("region", { name: "ステージ" })
  const full = (await stages.boundingBox())!
  await splitWith(page, "画面の構成")
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
  await splitWith(page, "画面の構成")
  await expect(stages).toHaveCount(2)
  expect(Math.abs((await leftWidth()) - full.width * 0.3)).toBeLessThan(3)
  await divider.dblclick()
  expect(Math.abs((await leftWidth()) - full.width / 2)).toBeLessThan(2)
})

test("分割すると、カレントのステージの下の行だけ色が少し変わり、もう片方を押すとそちらに移る", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  await splitWith(page, "画面の構成")
  const stages = page.getByRole("region", { name: "ステージ" })
  await expect(stages).toHaveCount(2)
  const bottoms = page.locator("main > [data-current]")
  const current = () => bottoms.evaluateAll(cols => cols.map(c => c.getAttribute("data-current")))
  // 右に開いたので、右がカレント。左を押すと左へ移る
  expect(await current()).toEqual(["false", "true"])
  await stages.nth(0).click({ position: { x: 40, y: 120 } })
  expect(await current()).toEqual(["true", "false"])
  const bg = (i: number) =>
    bottoms
      .nth(i)
      .locator(":scope > div")
      .nth(2)
      .evaluate(el => getComputedStyle(el).backgroundColor)
  expect(await bg(0)).not.toBe(await bg(1))
  const accent = (i: number) =>
    bottoms
      .nth(i)
      .locator("[data-book-name]")
      .first()
      .evaluate(el => getComputedStyle(el).boxShadow)
  expect(await accent(0)).not.toBe("none")
  expect(await accent(1)).toBe("none")
})

test("ダイアログ（幕も）の右クリックではブラウザのメニューを出さず、テキストFormの中では出す", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  await (await fromMenu(page, "ページの設定")).click()
  const dialog = page.getByRole("dialog", { name: "ページの設定" })
  await expect(dialog).toBeVisible()
  expect(await browserMenuStopped(dialog)).toBe(true)
  expect(await browserMenuStopped(dialog.getByRole("textbox").first())).toBe(false)
})
