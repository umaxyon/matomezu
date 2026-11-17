// 読めないページ: 今の機能台帳に無いタイプのページを持つブックも開ける。読めないページは、ページタブに名前が出て、開くと読めないことだけを見せ、
// 何もできない。ほかのページは変えられ、読めないページの残したデータは変わらない
import { drawingPage, testBook } from "../test/lineup"
import { BOOK_SCREEN_URL, expect, test } from "./fixtures"
import { addBox, items } from "./helpers/paper"
import { fromMenu } from "./helpers/stage-menu"
import { storedBook } from "./helpers/stored"

// 機能台帳に無いタイプのページ（外したプラグインのページのつもり。中身はそのタイプだけが読める）
const gone = {
  kind: "page",
  id: "gone-1",
  type: "@gone/plugin:sheet",
  title: "外したタイプ",
  paper: "@matomezu/base:a4",
  orientation: "landscape",
  cells: [{ id: "c1", text: "残す中身" }],
}
const mixed = { ...testBook("mixed", "混ざったブック", [drawingPage("mixed-p1")]) }
const book = { ...mixed, lineup: [...mixed.lineup, gone] }

test.use({ books: [book] })

test("読めないページは、ページタブに名前が出て、開くと読めないことと理由だけを見せる。右クリックのメニューは出ず、印刷プレビューは開けず、読み直しても開いたまま", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  const tab = page.getByRole("tab", { name: "外したタイプ" })
  await expect(tab).toBeVisible()
  await expect(page.getByRole("tab")).toHaveCount(2)
  await tab.click()
  await expect(tab).toHaveAttribute("aria-selected", "true")
  const notice = page.locator("[data-unreadable-page]")
  await expect(notice).toContainText("このページは読めません")
  await expect(notice).toContainText("ページのタイプ @gone/plugin:sheet がありません")
  await tab.click({ button: "right" })
  await expect(page.getByRole("menu")).toHaveCount(0)
  // 印刷プレビューは開けない（Mod+P でも開かない）
  await expect(await fromMenu(page, "印刷プレビュー")).toBeDisabled()
  await page.keyboard.press("Escape")
  await page.keyboard.press("ControlOrMeta+p")
  await expect(tab).toBeVisible()
  // 読み直しても、同じ読めないページを開いている
  await page.reload()
  await expect(page.getByRole("tab", { name: "外したタイプ" })).toHaveAttribute("aria-selected", "true")
  await expect(page.locator("[data-unreadable-page]")).toContainText("このページは読めません")
})

test("読めないページのあるブックでも、ほかのページは変えられる。読めないページの残したデータと並びの位置は変わらない", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await expect(page.getByRole("tab", { name: "外したタイプ" })).toBeVisible()
  await addBox(page, 200, 200, "箱")
  await expect(items(page)).toHaveCount(1)
  await expect
    .poll(async () => {
      const stored = await storedBook(page.request, "mixed")
      return (stored?.lineup[0]?.items ?? []).length
    })
    .toBe(1)
  const stored = await storedBook(page.request, "mixed")
  expect(stored.lineup[1]).toEqual(gone)
  // 読み直しても同じ
  await page.reload()
  await expect(page.getByRole("tab", { name: "外したタイプ" })).toBeVisible()
  await expect(items(page)).toHaveCount(1)
})
