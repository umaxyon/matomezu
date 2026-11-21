// スライドのバインダのページ一覧（ステージの左の縦の列）: サムネイルを並べ、押して開く・ドラッグで並べ替え・右クリックで ここに追加・複製・削除（確認つき）。ページタブには、バインダが 1 つのタブで出る
import { SLIDE, testBinder, testBook, testPage, withSlide } from "../test/lineup"
import { BOOK_SCREEN_URL, expect, test } from "./fixtures"

const page3 = (id: string, title: string) =>
  withSlide(testPage(SLIDE, id, { title, paper: "@matomezu/base:ratio-16x9" }), [
    {
      id: `${id}-t`,
      x: 80,
      y: 60,
      item: "@matomezu/slide:slide-text",
      w: 500,
      h: 80,
      props: { text: `${title}の文字`, fontSize: 48 },
    },
  ])

test.use({
  books: [
    testBook("b1", "スライド", [
      testBinder("b1-slides", "スライド", SLIDE, page3("p1", "一枚目"), page3("p2", "二枚目"), page3("p3", "三枚目")),
    ]),
  ],
})

test("ページ一覧はサムネイルを縦に並べ、ページタブにはバインダが 1 つのタブで出る。押したページが開く", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  const list = page.locator("[data-page-list]")
  await expect(list).toBeVisible()
  await expect(page.getByRole("tab")).toHaveText(["スライド"])
  const pages = list.locator("[data-page]")
  await expect(pages).toHaveCount(3)
  await expect(pages.nth(0).locator("button")).toHaveAttribute("aria-current", "page")
  await expect(pages.nth(1)).toContainText("二枚目の文字") // サムネイルに中身が描かれる
  await pages.nth(1).locator("button").click()
  await expect(pages.nth(1).locator("button")).toHaveAttribute("aria-current", "page")
  await expect(page.locator('[data-item="p2-t"]').first()).toBeVisible()
})

test("サムネイルをドラッグして並べ替える", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const pages = page.locator("[data-page-list] [data-page]")
  await expect(pages).toHaveCount(3)
  const from = (await pages.nth(0).boundingBox())!
  const to = (await pages.nth(2).boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height - 2, { steps: 8 })
  await page.mouse.up()
  await expect(pages.nth(2).locator("button")).toHaveAttribute("aria-label", "一枚目")
  await expect(pages.nth(0).locator("button")).toHaveAttribute("aria-label", "二枚目")
})

test("右クリックで、ここに追加・複製・削除ができる（削除は確認つき）", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const pages = page.locator("[data-page-list] [data-page]")
  await pages.nth(0).locator("button").click({ button: "right" })
  await page.getByRole("menuitem", { name: "ここに追加" }).click()
  await expect(pages).toHaveCount(4)
  await expect(pages.nth(1).locator("button")).toHaveAttribute("aria-label", "（無題）")
  await pages.nth(0).locator("button").click({ button: "right" })
  await page.getByRole("menuitem", { name: "複製" }).click()
  await expect(pages).toHaveCount(5)
  await expect(pages.nth(1)).toContainText("一枚目の文字")
  await pages.nth(1).locator("button").click({ button: "right" })
  await page.getByRole("menuitem", { name: "削除…" }).click()
  const dialog = page.getByRole("dialog", { name: "ページを削除" })
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "削除" }).click()
  await expect(pages).toHaveCount(4)
})

test.describe("ロック中のページ", () => {
  test.use({
    books: [
      testBook("b1", "スライド", [
        testBinder("b1-slides", "スライド", SLIDE, page3("p1", "一枚目"), { ...page3("p2", "二枚目"), locked: true }),
      ]),
    ],
  })

  test("ロック中のページには鍵の印が付き、右クリックの複製と削除は灰色になる", async ({ page }) => {
    await page.goto(BOOK_SCREEN_URL)
    const pages = page.locator("[data-page-list] [data-page]")
    await expect(pages.nth(1).getByRole("img", { name: "ロック中" })).toBeVisible()
    await expect(pages.nth(0).getByRole("img", { name: "ロック中" })).toHaveCount(0)
    await pages.nth(1).locator("button").click({ button: "right" })
    await expect(page.getByRole("menuitem", { name: "複製" })).toBeDisabled()
    await expect(page.getByRole("menuitem", { name: "削除…" })).toBeDisabled()
    await page.keyboard.press("Escape")
    await pages.nth(0).locator("button").click({ button: "right" })
    await expect(page.getByRole("menuitem", { name: "複製" })).toBeEnabled()
    await expect(page.getByRole("menuitem", { name: "削除…" })).toBeEnabled()
  })
})

test.describe("空のバインダ", () => {
  test.use({
    books: [
      {
        id: "b1",
        title: "スライド",
        lineup: [{ kind: "binder", id: "f1", title: "スライド", pageType: "@matomezu/slide-page:slide", lineup: [] }],
      },
    ],
  })

  test("ページ一覧の＋で、ダイアログ無しで「（無題）」のページを足せる", async ({ page }) => {
    await page.goto(BOOK_SCREEN_URL)
    const pages = page.locator("[data-page-list] [data-page]")
    await expect(pages).toHaveCount(0)
    await page.getByRole("navigation", { name: "ページ一覧" }).getByRole("button", { name: "ページを足す" }).click()
    await expect(pages).toHaveCount(1)
    await expect(pages.nth(0).locator("button")).toHaveAttribute("aria-label", "（無題）")
  })
})

test("スライドのタブの右クリックの「設定…」で紙のサイズを変えると、全部のサムネイルの形が変わる。「削除…」で確かめてから、スライドごと消える", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  const thumbs = page.locator("[data-page-list] [data-page] button")
  await expect(thumbs).toHaveCount(3)
  const ratios = () =>
    thumbs.evaluateAll(els =>
      els.map(el => {
        const r = el.getBoundingClientRect()
        return Math.round((r.height / r.width) * 100)
      }),
    )
  const before = await ratios()
  expect(new Set(before).size).toBe(1)
  const tab = page.getByRole("tab", { name: "スライド" })
  await tab.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "設定…" }).click()
  const dialog = page.getByRole("dialog", { name: "スライドの設定" })
  await dialog.getByLabel("紙のサイズ").selectOption("@matomezu/base:a4")
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  await expect.poll(async () => (await ratios()).every(r => r !== before[0])).toBe(true)
  expect(new Set(await ratios()).size).toBe(1)

  await tab.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "削除…" }).click()
  const confirm = page.getByRole("dialog", { name: "スライドを削除" })
  await expect(confirm).toContainText("スライドと中のページが消えます")
  await confirm.getByRole("button", { name: "削除" }).click()
  await expect(page.getByRole("tab")).toHaveCount(0)
})
