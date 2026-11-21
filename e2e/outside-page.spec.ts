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
