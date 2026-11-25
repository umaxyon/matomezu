// 参照エントリ: ほかのブックのページを指すタブを押すと、指す先のページが見るだけで描かれる（道具も選択も始まらない）。
// タブの右クリックの「参照元へ移動」で指す先のブックのページが開き、「削除」でタブが消える（指す先はそのまま）
import { drawingPage, SLIDE, testBinder, testBook, testPage, withSlide } from "../test/lineup"
import { bookScreenUrl, expect, test } from "./fixtures"
import { aiPerform } from "./helpers/ai"
import { addBox } from "./helpers/paper"
import { fromMenu } from "./helpers/stage-menu"

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

test("印刷プレビューには参照の指す先のページも並びの所に入り、ダブルクリックでその参照を開く。指す先が見えなければ飛ばす", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(bookScreenUrl("ref-a", "ref-a1"))
  await addBox(page, 200, 150, "元の箱")
  await page.goto(bookScreenUrl("ref-b", "ref-b1"))
  await addBox(page, 200, 150, "Bの箱")
  await (await fromMenu(page, "印刷プレビュー")).click()
  const sheets = page.locator("[data-sheet]")
  await expect(sheets).toHaveCount(2)
  await expect(sheets.nth(0)).toContainText("Bの箱")
  await expect(sheets.nth(1)).toContainText("元の箱")
  // 刷る物にも入る
  await expect(page.locator("[data-print-output]")).toContainText("元の箱")
  await sheets.nth(1).dblclick()
  await expect(page.getByRole("tab", { name: "全体図" })).toHaveAttribute("aria-selected", "true")
  await expect(page.locator('[data-reference="shown"]')).toContainText("元の箱")
  // 指す先のブックをゴミ箱に入れると、印刷プレビューから外れる
  expect(await aiPerform(page, { action: "@matomezu/base:entry-trash", args: { entry: "ref-a" } })).toMatchObject({
    ok: true,
  })
  await page.getByRole("tab", { name: "設計" }).click()
  await (await fromMenu(page, "印刷プレビュー")).click()
  await expect(sheets).toHaveCount(1)
  await expect(sheets.nth(0)).toContainText("Bの箱")
})

// スライドのバインダを指す参照: ページ一覧に指す先のスライドが並び（＋は無い）、押すとそのスライドを見せる
test.describe("バインダを指す参照", () => {
  const slide = (id: string, title: string, text: string) =>
    withSlide(testPage(SLIDE, id, { title }), [
      { id: `${id}-t`, x: 80, y: 60, item: "@matomezu/slide:slide-text", w: 500, h: 80, props: { text, fontSize: 48 } },
    ])
  test.use({
    books: [
      [
        testBook("ref-s", "説明のブック", [
          testBinder("ref-x", "説明", SLIDE, slide("ref-s1", "1", "一枚目"), slide("ref-s2", "2", "二枚目")),
        ]),
        testBook("ref-c", "まとめ", [
          drawingPage("ref-c1", { title: "表紙" }),
          { kind: "reference", id: "ref-r2", of: { kind: "binder", id: "ref-x" } },
        ]),
      ],
      {},
    ],
  })

  test("ページ一覧に指す先のスライドが並び、押すとそのスライドを見せる。＋は無い", async ({ page }) => {
    await page.goto(bookScreenUrl("ref-c", "ref-c1"))
    await page.getByRole("tab", { name: "説明" }).click()
    const shown = page.locator('[data-reference="shown"]')
    await expect(shown).toContainText("一枚目")
    const list = page.locator("[data-page-list]")
    await expect(list.getByRole("button", { name: "2" })).toBeVisible()
    await expect(list.getByRole("button", { name: "ページを足す" })).toHaveCount(0)
    await list.getByRole("button", { name: "2" }).click()
    await expect(shown).toContainText("二枚目")
    await expect(list.getByRole("button", { name: "2" })).toHaveAttribute("aria-current", "page")
  })
})

// 書庫で B の中身を見ると、参照の行が参照のアイコンで並ぶ。右クリックの「参照元へ移動」は指す先を開く
test.describe("書庫の参照の行", () => {
  test.use({
    books: [
      [
        testBook("ref-la", "元のブック", [drawingPage("ref-la1", { title: "全体図" })]),
        testBook("ref-lb", "置いたブック", [
          drawingPage("ref-lb1", { title: "設計" }),
          { kind: "reference", id: "ref-lr", of: { kind: "page", id: "ref-la1" } },
        ]),
      ],
      {},
    ],
  })

  test("参照の行が参照のアイコンで並び、右クリックで参照元へ移動できる", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "書庫", exact: true }).first().click()
    // ツリーでブックを押すと、右の枠にその中身が出る
    await page
      .getByRole("navigation", { name: "フォルダ" })
      .getByRole("button", { name: "置いたブック", exact: true })
      .click()
    const inside = page.getByRole("list", { name: "置いたブック の中身" })
    await expect(inside.getByRole("button")).toHaveText(["設計", "全体図"])
    const row = inside.getByRole("button", { name: "全体図" })
    await expect(row.locator("[data-reference-icon]")).toBeVisible()
    await expect(inside).toHaveScreenshot("library-reference-row.png", { maxDiffPixels: 50 })
    await row.click({ button: "right" })
    await page.getByRole("menuitem", { name: "参照元へ移動" }).click()
    await expect(page.getByRole("tablist", { name: "元のブック" })).toBeVisible()
  })
})
