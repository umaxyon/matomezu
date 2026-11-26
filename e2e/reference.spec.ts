// 参照エントリ: ほかのブックのページを指すタブを押すと、指す先のページが見るだけで描かれる（道具も選択も始まらない）。
// タブの右クリックの「参照元へ移動」で指す先のブックのページが開き、「削除」でタブが消える（指す先はそのまま）
import { drawingPage, SLIDE, testBinder, testBook, testPage, withSlide } from "../test/lineup"
import { bookScreenUrl, expect, type Page, test } from "./fixtures"
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

// 書庫を開き、ツリーで置いたブックを押して、右の枠にその中身を出す（ツリーの行の「開く／分割で開く」の吹き出しは閉じる）
async function showPlacedBook(page: Page) {
  await page.goto("/")
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  await page
    .getByRole("navigation", { name: "フォルダ" })
    .getByRole("button", { name: "置いたブック", exact: true })
    .click()
  await expect(page.getByRole("menuitem", { name: "分割で開く" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menuitem", { name: "分割で開く" })).toHaveCount(0)
}

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
    await showPlacedBook(page)
    const inside = page.getByRole("list", { name: "置いたブック の中身" })
    await expect(inside.getByRole("button")).toHaveText(["設計", "全体図"])
    const row = inside.getByRole("button", { name: "全体図" })
    await expect(row.locator("[data-reference-icon]")).toBeVisible()
    await expect(inside).toHaveScreenshot("library-reference-row.png", { maxDiffPixels: 50 })
    await row.click({ button: "right" })
    await page.getByRole("menuitem", { name: "参照元へ移動" }).click()
    await expect(page.getByRole("tablist", { name: "元のブック" })).toBeVisible()
  })

  test("参照の行を押すと「開く／分割で開く」の吹き出しが出て、開くとそのブックのその参照が開く", async ({ page }) => {
    await showPlacedBook(page)
    await page.getByRole("list", { name: "置いたブック の中身" }).getByRole("button", { name: "全体図" }).click()
    await expect(page.getByRole("menuitem", { name: "分割で開く" })).toBeVisible()
    await page.getByRole("menuitem", { name: "開く", exact: true }).click()
    await expect(page.getByRole("tablist", { name: "置いたブック" })).toBeVisible()
    await expect(page.getByRole("tab", { name: "全体図" })).toHaveAttribute("aria-selected", "true")
    await expect(page.locator('[data-reference="shown"]')).toBeVisible()
  })

  test("右クリックの削除で確かめずに消え、Ctrl+Z で戻り、Delete キーでも消える", async ({ page }) => {
    await showPlacedBook(page)
    const inside = page.getByRole("list", { name: "置いたブック の中身" })
    await inside.getByRole("button", { name: "全体図" }).click({ button: "right" })
    await page.getByRole("menuitem", { name: "削除" }).click()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(inside.getByRole("button")).toHaveText(["設計"])
    await page.keyboard.press("ControlOrMeta+z")
    await expect(inside.getByRole("button")).toHaveText(["設計", "全体図"])
    await inside.getByRole("button", { name: "全体図" }).click()
    await page.keyboard.press("Escape")
    await page.keyboard.press("Delete")
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(inside.getByRole("button")).toHaveText(["設計"])
  })
})

// 書庫で選んで参照を置く形: 書庫の右クリックの「参照を置く…」で置くブックを選ぶ。ページタブの＋の「参照…」で置く参照を選ぶ
test.describe("書庫で選んで参照を置く", () => {
  test.use({
    books: [
      [
        testBook("ref-ca", "元のブック", [drawingPage("ref-ca1", { title: "全体図" })]),
        testBook("ref-cb", "置くブック", [drawingPage("ref-cb1", { title: "設計" })]),
      ],
      {},
    ],
  })

  const tree = (page: Page) => page.getByRole("navigation", { name: "フォルダ" })
  const band = (page: Page) => page.getByRole("status").filter({ hasText: "を選ぶ" })

  test("右クリックの「参照を置く…」で置くブックを選ぶ帯が出て、選べるブックの［ここに置く］で置き、書庫のまま知らせる。Esc は選ぶのだけやめる", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "書庫", exact: true }).first().click()
    await tree(page).getByRole("button", { name: "元のブック", exact: true }).click()
    await page.keyboard.press("Escape")
    const inside = page.getByRole("list", { name: "元のブック の中身" })
    await inside.getByRole("button", { name: "全体図" }).click({ button: "right" })
    await page.getByRole("menuitem", { name: "参照を置く…" }).click()
    await expect(band(page)).toHaveText(/全体図 の参照を置くブックを選ぶ/)
    // 選んでいる間は、ブックを作るボタンを出さない
    await expect(page.getByRole("button", { name: "ブック新規作成" })).toHaveCount(0)
    // 選べない物は薄い
    await expect(inside.getByRole("button", { name: "全体図" })).toHaveAttribute("data-unchoosable", "true")
    // Esc で選ぶのだけやめる（書庫は開いたまま）
    await inside.getByRole("button", { name: "全体図" }).focus()
    await page.keyboard.press("Escape")
    await expect(band(page)).toHaveCount(0)
    await expect(inside).toBeVisible()

    await inside.getByRole("button", { name: "全体図" }).click({ button: "right" })
    await page.getByRole("menuitem", { name: "参照を置く…" }).click()
    // 指す先の入っているブックは選べない。ほかのブックを押すと［ここに置く］
    await expect(tree(page).getByRole("button", { name: "元のブック", exact: true })).toHaveAttribute(
      "data-unchoosable",
      "true",
    )
    await tree(page).getByRole("button", { name: "置くブック", exact: true }).click()
    await page.getByRole("menuitem", { name: "ここに置く" }).click()
    await expect(page.getByText("置くブック に参照を置きました")).toBeVisible()
    await expect(band(page)).toHaveCount(0)
    await expect(page.getByRole("list", { name: "置くブック の中身" }).getByRole("button")).toHaveText([
      "設計",
      "全体図",
    ])
  })

  test("ページタブの＋の「参照…」で置く参照を選ぶ帯が出て、選べるページの［参照を置く］で書庫を閉じて置いた参照を開く。［取消］は書庫を閉じる", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto(bookScreenUrl("ref-cb", "ref-cb1"))
    const choose = async () => {
      await page.getByRole("button", { name: "ページを足す" }).click()
      await page.getByRole("menuitem", { name: "参照…" }).click()
      await expect(band(page)).toHaveText(/置くブック に置く参照を選ぶ/)
    }
    // ＋のメニューの「参照…」は、ページの種類の行と区切り線で分ける
    await page.getByRole("button", { name: "ページを足す" }).click()
    await expect(page.getByRole("menu").locator("hr + [role=menuitem]")).toHaveText(/参照…/)
    await page.keyboard.press("Escape")
    await choose()
    // 書庫のスクリーンの帯（→ 閉じる・広げる）は、選んでいる間の帯に替わる
    await expect(page.getByRole("button", { name: "広げる", exact: true })).toHaveCount(0)
    await page.getByRole("button", { name: "取消" }).click()
    await expect(band(page)).toHaveCount(0)
    await expect(tree(page)).toHaveCount(0)
    // 外を押して閉じても、選んでいた事は残らない（次に開いた書庫は、いつもの帯）
    await choose()
    await page.getByRole("tab", { name: "設計" }).click()
    await expect(tree(page)).toHaveCount(0)
    await (await fromMenu(page, "書庫を開く")).click()
    await expect(tree(page)).toBeVisible()
    await expect(band(page)).toHaveCount(0)
    await page.keyboard.press("Escape")
    await expect(tree(page)).toHaveCount(0)

    await choose()
    // 置くブックの中のページは選べず、Enter でも開かない
    await tree(page).getByRole("button", { name: "置くブック", exact: true }).click()
    const own = page.getByRole("list", { name: "置くブック の中身" })
    await expect(own.getByRole("button", { name: "設計" })).toHaveAttribute("data-unchoosable", "true")
    await own.getByRole("button", { name: "設計" }).click()
    await page.keyboard.press("Enter")
    await expect(band(page)).toBeVisible()
    // 選べないブックは、押すと中へ入る
    await tree(page).getByRole("button", { name: "元のブック", exact: true }).click()
    await expect(page.getByRole("menuitem", { name: "分割で開く" })).toHaveCount(0)
    await page.getByRole("list", { name: "元のブック の中身" }).getByRole("button", { name: "全体図" }).click()
    await page.getByRole("menuitem", { name: "参照を置く" }).click()
    await expect(tree(page)).toHaveCount(0)
    await expect(page.getByRole("tab", { name: "全体図" })).toHaveAttribute("aria-selected", "true")
    await expect(page.locator('[data-reference="shown"]')).toBeVisible()
  })
})
