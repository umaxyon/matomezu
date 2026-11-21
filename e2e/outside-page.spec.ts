// ブックの外のページ（書庫ホームに直に置いたページ）を、ステージで開く
import { BOOK_SCREEN_DEF, BOOK_SCREEN_URL, expect, stagesUrl, test, urlCurrentScreen, urlStages } from "./fixtures"
import { fromMenu } from "./helpers/stage-menu"

const OUTSIDE = {
  kind: "page",
  id: "o1",
  type: "@matomezu/drawing:drawing",
  title: "ブックの外のページ",
  paper: "@matomezu/base:a4",
  orientation: "landscape",
}

test.use({ outsidePages: [OUTSIDE] })

test("ブックを名指さずページを名指す場所の URL は、ブックの外のページを開く", async ({ page }) => {
  await page.goto(stagesUrl([{ book: null, page: "o1" }]))
  await expect(page.getByRole("img", { name: "紙" })).toHaveCount(1)
  // 下の行の名前は、そのページの名前。ページタブは出ない
  const name = page.getByRole("button", { name: "ブックの外のページ" })
  await expect(name).toBeVisible()
  await expect(page.getByRole("tab")).toHaveCount(0)
})

test("書庫の画面でブックの外のページを 2 回押すと、新しいブックスクリーンで開く", async ({ page }) => {
  await page.goto("/")
  await page.bringToFront()
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  await page.getByRole("list", { name: "書庫 の中身" }).getByRole("button", { name: "ブックの外のページ" }).dblclick()
  await expect.poll(() => urlCurrentScreen(page)).toBe(BOOK_SCREEN_DEF)
  await expect.poll(() => urlStages(page).map(s => [s.b, s.p])).toEqual([[null, "o1"]])
  await expect(page.getByRole("img", { name: "紙" })).toHaveCount(1)
})

test("「画面を分割」で下に出た書庫のスクリーンでブックの外のページを 2 回押すと、右の空のステージに開き、書庫のスクリーンは引っ込む", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await page.bringToFront()
  await (await fromMenu(page, "画面を分割")).click()
  const library = page.getByRole("list", { name: "書庫 の中身" })
  await library.getByRole("button", { name: "ブックの外のページ" }).dblclick()
  await expect(library).toHaveCount(0)
  await expect.poll(() => urlStages(page).map(s => s.p)).toHaveLength(2)
  expect(urlStages(page)[1]).toMatchObject({ b: null, p: "o1" })
  await expect(page.getByRole("button", { name: "ブックの外のページ" })).toBeVisible()
})

test.describe("マークダウンのブックの外のページ", () => {
  test.use({
    outsidePages: [
      { ...OUTSIDE, id: "m1", type: "@matomezu/markdown:markdown", title: "外のメモ", text: "# 猫の話\n\n猫が好き。" },
    ],
  })

  test("原文とプレビューが出て、検索はこのページだけ（ブック全体は選べない）", async ({ page }) => {
    await page.goto(stagesUrl([{ book: null, page: "m1" }]))
    await expect(page.getByRole("region", { name: "プレビュー" })).toContainText("猫の話")
    await page.getByRole("region", { name: "プレビュー" }).click()
    await page.keyboard.press("ControlOrMeta+f")
    const dialog = page.getByRole("dialog", { name: "検索ダイアログ" })
    await expect(dialog).toBeVisible()
    await page.keyboard.type("猫")
    await expect(dialog.locator("[data-search-count]")).toHaveText("1/2")
    await expect(dialog.getByRole("radio")).toHaveCount(1)
  })
})

test.describe("マークダウンのブックの外のページの置換", () => {
  test.use({
    outsidePages: [{ ...OUTSIDE, id: "m1", type: "@matomezu/markdown:markdown", title: "外のメモ", text: "猫と猫" }],
  })

  test("ソースに打て、全部置換と元に戻すが効く", async ({ page }) => {
    await page.goto(stagesUrl([{ book: null, page: "m1" }]))
    await page.getByRole("toolbar", { name: "ペイン" }).getByRole("button", { name: "左右に並べる" }).click()
    const source = page.getByRole("region", { name: "ソース" }).getByRole("textbox")
    await source.click()
    await page.keyboard.press("ControlOrMeta+End")
    await page.keyboard.insertText("と犬")
    await expect(page.getByRole("region", { name: "プレビュー" })).toContainText("猫と猫と犬")
    await page.keyboard.press("ControlOrMeta+Alt+f")
    const dialog = page.getByRole("dialog", { name: "検索ダイアログ" })
    await dialog.getByLabel("探す").fill("猫")
    await dialog.getByLabel("置換").fill("鳥")
    await dialog.getByRole("button", { name: "全部置換" }).click()
    await expect(page.getByRole("region", { name: "プレビュー" })).toContainText("鳥と鳥と犬")
    await page.keyboard.press("Escape")
    await page.getByRole("region", { name: "プレビュー" }).click()
    await page.keyboard.press("ControlOrMeta+z")
    await expect(page.getByRole("region", { name: "プレビュー" })).toContainText("猫と猫と犬")
  })
})
