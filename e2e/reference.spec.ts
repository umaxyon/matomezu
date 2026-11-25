// 参照エントリ: ほかのブックのページを指すタブを押すと、指す先のページが見るだけで描かれる（道具も選択も始まらない）。
// タブの右クリックの「参照元へ移動」で指す先のブックのページが開き、「削除」でタブが消える（指す先はそのまま）
import { drawingPage, testBook } from "../test/lineup"
import { bookScreenUrl, expect, test } from "./fixtures"
import { addBox } from "./helpers/paper"

test.use({
  // 2 冊の並びは、値と設定の組 [値, {}] で渡す（そのままだと 2 冊目を設定と読む）
  books: [
    [
      testBook("ref-a", "元のブック", [drawingPage("ref-a1", { title: "全体図" })]),
      testBook("ref-b", "置いたブック", [
        drawingPage("ref-b1", { title: "設計" }),
        { kind: "reference", id: "ref-r1", of: { kind: "page", id: "ref-a1" } },
      ]),
    ],
    {},
  ],
})

test("参照のタブを押すと指す先のページが見るだけで描かれ、右クリックで参照元へ移動・削除ができる", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(bookScreenUrl("ref-a", "ref-a1"))
  await addBox(page, 200, 150, "元の箱")

  await page.goto(bookScreenUrl("ref-b", "ref-b1"))
  const tab = page.getByRole("tab", { name: "全体図" })
  await expect(tab).toBeVisible()
  await tab.click()
  await expect(tab).toHaveAttribute("aria-selected", "true")
  const shown = page.locator('[data-reference="shown"]')
  await expect(shown).toContainText("元の箱")
  await expect(page.locator("[data-page-tabs]").first()).toHaveScreenshot("reference-tab.png", { maxDiffPixels: 50 })

  // 参照元へ移動: 元のブックのページが開く
  await tab.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "参照元へ移動" }).click()
  await expect(page.getByRole("tablist", { name: "元のブック" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "全体図" })).toHaveAttribute("aria-selected", "true")

  // 削除: タブが消え、隣のタブが開く
  await page.goto(bookScreenUrl("ref-b", "ref-b1"))
  await page.getByRole("tab", { name: "全体図" }).click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "削除" }).click()
  await expect(page.getByRole("tab", { name: "全体図" })).toHaveCount(0)
  await expect(page.getByRole("tab", { name: "設計" })).toBeVisible()
})
