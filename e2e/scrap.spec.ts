// スクラップ: 紙の右クリックの「スクラップを切り抜く」で、範囲（はじめはページ全体）と倍率を決めてトレイに入れると、左サイドパネルのスクラップトレイが開く。
// トレイの 1 つを押して紙を押すと、その値のスクラップボックスが置かれ、中に元のページの箱が見える。トレイには残り、× で消える。
// 置いたスクラップボックスをダブルクリックすると設定のダイアログが開き、倍率を変えると大きさが変わる
import { BOOK_SCREEN_URL, expect, type Page, test } from "./fixtures"
import { leftPanel } from "./helpers/outbox"
import { addBox, items, onPaper, paper } from "./helpers/paper"

// フッタメニューを開き、ツールボックスの並びの「スクラップトレイを開く」を押す
async function openScrapTray(page: Page) {
  const tabs = (await page.locator("[data-page-tabs]").first().boundingBox())!
  await page.mouse.move(tabs.x + tabs.width - 20, tabs.y + tabs.height / 2)
  await page.getByRole("button", { name: "スクラップトレイを開く" }).click()
  await expect(leftPanel(page).getByRole("tab", { name: "スクラップトレイ" })).toHaveAttribute("aria-selected", "true")
}

// ページの id はブックをまたいで重ならない（スクラップはページの id だけで指す）。共有の見本はどのブックも p1 なので、ここでは自分のブックを置く
test.use({
  books: [
    {
      type: "@matomezu/drawing:drawing",
      id: "scrap-book",
      title: "まとめ図の構想",
      pages: [{ id: "scrap-page", title: "ページ 1", paper: "@matomezu/base:a4", orientation: "landscape" }],
    },
  ],
})

test("ページを切り抜いてトレイに入れ、トレイから置くと中に元のページが見える。置いてもトレイに残り、× で消える。ダブルクリックで倍率を直せる", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(BOOK_SCREEN_URL)
  await addBox(page, 200, 150, "元の箱")

  // 紙の何も無い所を右クリックして切り抜く。倍率を 25% にしてトレイに入れる
  const empty = await onPaper(page, 700, 500)
  await page.mouse.click(empty.x, empty.y, { button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "スクラップを切り抜く" }).click()
  const cut = page.getByRole("dialog", { name: "スクラップを切り抜く" })
  await expect(cut.locator("[data-scrap-area]")).toBeVisible()
  await cut.getByLabel("倍率").fill("25")
  await expect(cut.locator("[data-scrap-size]")).toHaveText("281 × 199")
  await cut.getByRole("button", { name: "トレイに入れる" }).click()
  await expect(cut).toBeHidden()

  // トレイが開き、切り抜いたスクラップが 1 つ並ぶ
  await expect(leftPanel(page).getByRole("tab", { name: "スクラップトレイ" })).toHaveAttribute("aria-selected", "true")
  const rows = leftPanel(page).locator("[data-scrap-row]")
  await expect(rows).toHaveCount(1)

  // 押して、紙を押すと置かれる（中に元の箱の字が見える）
  await rows.first().getByRole("button").first().click()
  const at = await onPaper(page, 500, 300)
  await page.mouse.click(at.x, at.y)
  const placed = items(page).filter({ has: page.locator('[data-scrap="shown"]') })
  await expect(placed).toHaveCount(1)
  await expect(placed).toContainText("元の箱")
  await expect(rows).toHaveCount(1)

  // ダブルクリックで設定のダイアログ。倍率を 50% にすると大きくなる
  const before = (await placed.boundingBox())!
  await placed.dblclick()
  const edit = page.getByRole("dialog", { name: "スクラップの設定" })
  await edit.getByLabel("倍率").fill("50")
  await edit.getByRole("button", { name: "OK" }).click()
  await expect(edit).toBeHidden()
  await expect.poll(async () => (await placed.boundingBox())!.width).toBeGreaterThan(before.width * 1.5)

  // × でトレイから消える（置いた物はそのまま）
  await rows.first().getByRole("button", { name: "スクラップを消す" }).click()
  const confirm = page.getByRole("alertdialog", { name: "このスクラップをトレイから消しますか？" })
  await confirm.getByRole("button", { name: "スクラップを消す" }).click()
  await expect(rows).toHaveCount(0)
  await expect(placed).toHaveCount(1)
  await expect(paper(page)).toBeVisible()
})

test.describe("マークダウンのページ", () => {
  test.use({
    // 2 冊の並びは、値と設定の組 [値, {}] で渡す（そのままだと 2 冊目を設定と読む）
    books: [
      [
        {
          type: "@matomezu/markdown:markdown",
          id: "scrap-md",
          title: "メモ",
          pages: [
            {
              id: "scrap-md-page",
              title: "本文",
              paper: "@matomezu/base:a4",
              orientation: "portrait",
              text: "# 見出しの字\n\n本文の字です。",
            },
          ],
        },
        {
          type: "@matomezu/drawing:drawing",
          id: "scrap-to",
          title: "置き先",
          pages: [{ id: "scrap-to-page", title: "ページ 1", paper: "@matomezu/base:a4", orientation: "landscape" }],
        },
      ],
      {},
    ],
  })

  test("ページタブの右クリックで切り抜くと、測ってから描いた文書が見え、図面に置くと中に文書が見える", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/?b0=scrap-md&v0=1,0,0")
    await page.getByRole("tab", { name: "本文" }).click({ button: "right" })
    await page.getByRole("menu").getByRole("menuitem", { name: "スクラップを切り抜く" }).click()
    const cut = page.getByRole("dialog", { name: "スクラップを切り抜く" })
    await expect(cut.locator("[data-scrap-area]")).toBeVisible()
    await expect(cut).toContainText("見出しの字")
    await cut.getByLabel("倍率").fill("50")
    await cut.getByRole("button", { name: "トレイに入れる" }).click()
    await expect(cut).toBeHidden()
    // マークダウンには置けないので、トレイは開かず、入れたことだけを知らせる。トレイを開くボタンも出ない
    await expect(page.getByText("スクラップトレイに入れました")).toBeVisible()
    await expect(leftPanel(page)).toHaveCount(0)
    await expect(page.locator("[data-scrap-tray-opener]")).toHaveCount(0)
    await page.goto("/?b0=scrap-to&v0=1,0,0")
    await openScrapTray(page)
    await leftPanel(page).locator("[data-scrap-row]").first().getByRole("button").first().click()
    const at = await onPaper(page, 300, 200)
    await page.mouse.click(at.x, at.y)
    const placed = items(page).filter({ has: page.locator('[data-scrap="shown"]') })
    await expect(placed).toHaveCount(1)
    await expect(placed).toContainText("本文の字です。")
    // 右クリックの「元のページを開く」で、マークダウンのページへ移る（トレイは閉じる）
    await placed.click({ button: "right" })
    await page.getByRole("menu").getByRole("menuitem", { name: "元のページを開く" }).click()
    await expect(page.getByRole("tab", { name: "本文" })).toBeVisible()
    await expect(leftPanel(page)).toHaveCount(0)
  })
})

test.describe("ツリーのページ", () => {
  test.use({
    books: [
      {
        type: "@matomezu/tree:tree",
        id: "scrap-tree",
        title: "木",
        pages: [
          {
            id: "scrap-tree-page",
            title: "ページ 1",
            paper: "@matomezu/base:a4",
            orientation: "landscape",
            root: { id: "r", caption: "根の字", children: [] },
          },
        ],
      },
    ],
  })

  test("紙の右クリックから切り抜ける", async ({ page }) => {
    await page.goto("/?b0=scrap-tree&v0=1,0,0")
    const empty = await onPaper(page, 900, 600)
    await page.mouse.click(empty.x, empty.y, { button: "right" })
    await page.getByRole("menu").getByRole("menuitem", { name: "スクラップを切り抜く" }).click()
    const cut = page.getByRole("dialog", { name: "スクラップを切り抜く" })
    await expect(cut).toContainText("根の字")
  })
})
