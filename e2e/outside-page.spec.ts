// ブックの外のページ（書庫ホームに直に置いたページ）を、ステージで開く
import { expect, stagesUrl, test } from "./fixtures"

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
