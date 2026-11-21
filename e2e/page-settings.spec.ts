import { BOOK_SCREEN_URL, expect, test } from "./fixtures"
import { addFromTabs } from "./helpers/new-book"
import { addBodyBox, addBox, onPaper } from "./helpers/paper"

test("ページの設定のダイアログでテーマと紙の色を選ぶと、確定の前から紙と中の箱に出る。キャンセルで戻り、確定でそのままになる", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await addBodyBox(page)
  const paper = page.getByRole("img", { name: "紙" })
  const surface = page.locator("[data-paper-surface]") // 紙の白い面（紙の面のレイヤー）
  const box = page.locator("[data-item] [data-valign]")
  const look = async () => ({
    paper: await surface.evaluate(el => getComputedStyle(el).backgroundColor),
    box: await box.evaluate(el => getComputedStyle(el).backgroundColor),
  })
  const dialog = page.getByRole("dialog", { name: "ページの設定" })
  const choose = async () => {
    const at = (await paper.boundingBox())!
    await page.mouse.click(at.x + 600, at.y + 400, { button: "right" })
    await page.getByRole("menu").getByRole("menuitem", { name: "ページの設定" }).click()
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

test("紙の右クリックの「ブックの設定」で名前を変えると、ブックの名前のボタンの名前が変わる。空の間は確定できない", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  const trigger = page.locator('button[aria-haspopup="menu"]').first()
  const empty = await onPaper(page, 900, 600)
  await page.mouse.click(empty.x, empty.y, { button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "ブックの設定" }).click()
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

test("紙の右クリックの「ページの設定」でページの名前を変えると、ページタブの名前が変わる。空の間は確定できない", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  const tab = page.getByRole("tab", { selected: true })
  const before = await tab.textContent()
  const empty = await onPaper(page, 900, 600)
  await page.mouse.click(empty.x, empty.y, { button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "ページの設定" }).click()
  const dialog = page.getByRole("dialog", { name: "ページの設定" })
  const name = dialog.getByLabel("ページの名前")
  await expect(name).toHaveValue(before!)
  await name.fill("  ")
  await expect(dialog.getByRole("button", { name: "確定" })).toBeDisabled()
  await name.fill("表紙")
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  await expect(tab).toHaveText("表紙")
})

test("「ページの設定」で紙を A3 にすると紙が大きくなる。形が入らない紙を選ぶと知らせを出して確定できない", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await addBox(page, 900, 120, "右")
  const surface = page.locator("[data-paper-surface]")
  const before = (await surface.boundingBox())!
  const empty = await onPaper(page, 900, 600)
  await page.mouse.click(empty.x, empty.y, { button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "ページの設定" }).click()
  const dialog = page.getByRole("dialog", { name: "ページの設定" })
  // 右に置いた箱は A5 に入らない
  await dialog.getByLabel("紙のサイズ").selectOption({ label: "A5" })
  await expect(dialog.getByRole("alert")).toContainText("形が紙に入りません")
  await expect(dialog.getByRole("button", { name: "確定" })).toBeDisabled()
  await dialog.getByLabel("紙のサイズ").selectOption({ label: "A3" })
  await expect(dialog.getByRole("alert")).toHaveCount(0)
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  await expect.poll(async () => (await surface.boundingBox())!.width).toBeGreaterThan(before.width)
})

test("「ページの設定」で可変ページにして上下左右へ増やすと、上下左右に空きの印刷区画が出て、区切りの破線が引かれる（中身は 印刷区画 1 つ分ずつずれるが、箱は画面の同じ所のまま）。破線はフッタメニューのボタンで隠せる", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await addBox(page, 200, 200, "元")
  const origin = page.locator("[data-item]").filter({ hasText: "元" })
  const before = (await origin.boundingBox())!
  const empty = await onPaper(page, 900, 600)
  await page.mouse.click(empty.x, empty.y, { button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "ページの設定" }).click()
  const dialog = page.getByRole("dialog", { name: "ページの設定" })
  await dialog.getByRole("switch", { name: "可変ページにする" }).click()
  // 増やす向きの既定は右と下。上下左右に変える
  const toward = dialog.getByLabel("増やす向き")
  await expect(toward).toHaveValue("right-down")
  await toward.selectOption({ label: "上下左右" })
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  // 左と上の空き・中身・右と下の空きで 3×3。中身は 印刷区画 1 つ分ずつずれるが、画面ではパンを合わせるので同じ所
  await expect(page.locator("[data-print-areas]")).toHaveAttribute("data-print-areas", "3x3")
  await expect(page.locator("[data-print-areas] line")).toHaveCount(4)
  const kept = (await origin.boundingBox())!
  expect(Math.abs(kept.x - before.x)).toBeLessThan(1)
  expect(Math.abs(kept.y - before.y)).toBeLessThan(1)
  // フッタメニューのボタンで、区切りの線を隠して、また見せる
  const tabs = (await page.getByRole("tablist").first().boundingBox())!
  await page.mouse.move(tabs.x + tabs.width - 20, tabs.y + tabs.height / 2)
  const toggle = page.getByRole("button", { name: "印刷区画の区切り" })
  await expect(toggle).toHaveAttribute("aria-pressed", "true")
  await toggle.click()
  await expect(page.locator("[data-print-areas]")).toHaveCount(0)
  await toggle.click()
  await expect(page.locator("[data-print-areas]")).toHaveCount(1)
  // 「ページの設定」で可変ページをやめると、空きを詰めて紙 1 枚に戻る（中身は 1 つ目の印刷区画に入るので確定できる）
  await page.mouse.click(empty.x, empty.y, { button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "ページの設定" }).click()
  await dialog.getByRole("switch", { name: "可変ページにする" }).click()
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator("[data-print-areas]")).toHaveCount(0)
})

test("上下左右へ増やす可変ページを開くと、左上の空きの印刷区画でなく中身の載った印刷区画の左上が見え、「初めの位置に戻す」もそこへ戻す。読み直すと、見ていた所のまま", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await addBox(page, 200, 200, "元")
  const box = page.locator("[data-item]").filter({ hasText: "元" })
  const before = (await box.boundingBox())!
  const empty = await onPaper(page, 900, 600)
  await page.mouse.click(empty.x, empty.y, { button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "ページの設定" }).click()
  const dialog = page.getByRole("dialog", { name: "ページの設定" })
  await dialog.getByRole("switch", { name: "可変ページにする" }).click()
  await dialog.getByLabel("増やす向き").selectOption({ label: "上下左右" })
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator("[data-print-areas]")).toHaveAttribute("data-print-areas", "3x3")
  // ほかのページを開いてから戻ると、箱の載った印刷区画の左上が表示領域の左上に来る（箱は、紙 1 枚のときと同じ所に見える）
  await addFromTabs(page)
  await page.keyboard.press("Enter")
  await page.getByRole("tab", { name: "ページ 1" }).click()
  const at = async () => (await box.boundingBox())!
  await expect
    .poll(async () => Math.abs((await at()).x - before.x) + Math.abs((await at()).y - before.y))
    .toBeLessThan(1)
  // 左上へずらしてから戻すと、同じ所へ戻る
  await page.mouse.move(empty.x, empty.y)
  await page.mouse.wheel(-3000, -3000)
  await expect.poll(async () => (await at()).x).toBeGreaterThan(before.x + 100)
  await page.getByRole("button", { name: "初めの位置に戻す" }).click()
  await expect
    .poll(async () => Math.abs((await at()).x - before.x) + Math.abs((await at()).y - before.y))
    .toBeLessThan(1)
  // 左上の端へずらして読み直すと、URL の位置（左上の端）のまま
  await page.mouse.move(empty.x, empty.y)
  await page.mouse.wheel(-3000, -3000)
  await expect.poll(async () => (await at()).x).toBeGreaterThan(before.x + 100)
  const corner = await at()
  await page.reload()
  await expect(box).toBeVisible()
  await expect
    .poll(async () => Math.abs((await at()).x - corner.x) + Math.abs((await at()).y - corner.y))
    .toBeLessThan(1)
})
