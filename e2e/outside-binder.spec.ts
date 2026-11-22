// ブックの外のバインダ（書庫ホームに直に置いたスライドのバインダ）を、ステージで開く
import { BOOK_SCREEN_DEF, expect, stagesUrl, test, urlCurrentScreen, urlStages } from "./fixtures"

const slide = (id: string, title: string) => ({
  kind: "page",
  id,
  type: "@matomezu/slide-page:slide",
  title,
  paper: "@matomezu/base:a4",
  orientation: "landscape",
})
const BINDER = {
  kind: "binder",
  id: "n1",
  title: "発表スライド",
  pageType: "@matomezu/slide-page:slide",
  lineup: [slide("n1a", "表紙"), slide("n1b", "本題")],
}

test.use({ outsidePages: [BINDER] })

test("書庫の画面でブックの外のバインダを 2 回押すと、1 枚目で開く。下の行はバインダの名前と置き場所で、ページ一覧を押すとスライドが替わる", async ({
  page,
}) => {
  await page.goto("/")
  await page.bringToFront()
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  await page.getByRole("list", { name: "書庫 の中身" }).getByRole("button", { name: "発表スライド" }).dblclick()
  await expect.poll(() => urlCurrentScreen(page)).toBe(BOOK_SCREEN_DEF)
  await expect.poll(() => urlStages(page).map(s => [s.b, s.p])).toEqual([[null, "n1a"]])
  await expect(page.locator(`button[aria-haspopup="menu"]`, { hasText: "発表スライド" })).toBeVisible()
  await expect(page.getByRole("button", { name: "置き場所: 書庫" })).toBeVisible()
  await expect(page.getByRole("tab")).toHaveCount(0)
  // ページ一覧は、押して替えるだけ（＋は出さない）
  const list = page.getByRole("navigation", { name: "ページ一覧" })
  await expect(list.getByRole("button", { name: "表紙" })).toHaveAttribute("aria-current", "page")
  await expect(list.getByRole("button", { name: "ページを追加" })).toHaveCount(0)
  await list.getByRole("button", { name: "本題" }).click()
  await expect.poll(() => urlStages(page).map(s => [s.b, s.p])).toEqual([[null, "n1b"]])
  await expect(list.getByRole("button", { name: "本題" })).toHaveAttribute("aria-current", "page")
})

test("ブックを名指さずページを名指す場所の URL は、そのページを入れているブックの外のバインダを、そのページで開く", async ({
  page,
}) => {
  await page.goto(stagesUrl([{ book: null, page: "n1b" }]))
  await expect(page.getByRole("button", { name: "発表スライド" })).toBeVisible()
  const list = page.getByRole("navigation", { name: "ページ一覧" })
  await expect(list.getByRole("button", { name: "本題" })).toHaveAttribute("aria-current", "page")
})
