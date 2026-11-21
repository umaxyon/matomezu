// スクラップ: 紙の右クリックの「スクラップを切り抜く」で、範囲（はじめはページ全体）を決めてスクラップトレイに入れると、左サイドパネルのスクラップトレイが開く。
// スクラップトレイの 1 つを押して紙を押すと、その値のスクラップボックスが置かれ、中に元のページの箱が見える。スクラップトレイには残り、× で消える。
// 置いたスクラップボックスをダブルクリックすると設定のダイアログが開き、枠線を切り替えられる。大きさは、四隅のつまみで比を保って変える
import { drawingPage, MARKDOWN, TREE, testBook, testPage } from "../test/lineup"
import { BOOK_SCREEN_URL, bookScreenUrl, expect, type Page, test } from "./fixtures"
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
  books: [testBook("scrap-book", "まとめ図の構想", [drawingPage("scrap-page")])],
})

test("ページを切り抜いてスクラップトレイに入れ、スクラップトレイから置くと中に元のページが見える。置いてもスクラップトレイに残り、× で消える。角のつまみで比を保って大きさを変えられ、ダブルクリックで枠線を直せる", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(BOOK_SCREEN_URL)
  await addBox(page, 200, 150, "元の箱")

  // 紙の何も無い所を右クリックして切り抜く（範囲はページ全体のまま）。スクラップトレイに入れる
  const empty = await onPaper(page, 700, 500)
  await page.mouse.click(empty.x, empty.y, { button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "スクラップを切り抜く" }).click()
  const cut = page.getByRole("dialog", { name: "スクラップを切り抜く" })
  await expect(cut.locator("[data-scrap-area]")).toBeVisible()
  await cut.getByRole("button", { name: "トレイに入れる" }).click()
  await expect(cut).toBeHidden()

  // スクラップトレイが開き、切り抜いたスクラップが 1 つ並ぶ
  await expect(leftPanel(page).getByRole("tab", { name: "スクラップトレイ" })).toHaveAttribute("aria-selected", "true")
  const rows = leftPanel(page).locator("[data-scrap-row]")
  await expect(rows).toHaveCount(1)

  // 押して、紙を押すと置かれる（中に元の箱の字が見える）
  await rows.first().getByRole("button").first().click()
  const at = await onPaper(page, 250, 300)
  await page.mouse.click(at.x, at.y)
  const placed = items(page).filter({ has: page.locator('[data-scrap="shown"]') })
  await expect(placed).toHaveCount(1)
  await expect(placed).toContainText("元の箱")
  await expect(rows).toHaveCount(1)
  // ページ全体の切り抜きは、紙の幅・高さの半分に収めて置かれる
  const sheet = (await paper(page).boundingBox())!
  const first = (await placed.boundingBox())!
  expect(first.width).toBeLessThanOrEqual(sheet.width / 2 + 2)
  expect(first.width).toBeGreaterThan(sheet.width / 2 - 4)

  // 選ぶと、つまみは四隅だけ。左上の角を内へ引くと、右下の角を止めて、比を保ったまま小さくなる
  await placed.click()
  await expect(placed.locator("[data-grip]")).toHaveCount(4)
  const small = (await placed.boundingBox())!
  const corner = (await placed.locator('[data-grip="top-left"]').boundingBox())!
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2)
  await page.mouse.down()
  await page.mouse.move(corner.x + corner.width / 2 + 120, corner.y + corner.height / 2 + 10, { steps: 4 })
  // 引いている間も、その大きさで見える（右下は動かない）
  await expect.poll(async () => (await placed.boundingBox())!.width).toBeLessThan(small.width - 60)
  const dragging = (await placed.boundingBox())!
  expect(Math.abs(dragging.x + dragging.width - (small.x + small.width))).toBeLessThan(2)
  expect(Math.abs(dragging.y + dragging.height - (small.y + small.height))).toBeLessThan(2)
  await page.mouse.up()
  await expect.poll(async () => (await placed.boundingBox())!.width).toBeLessThan(small.width - 60)
  const grown = (await placed.boundingBox())!
  expect(Math.abs(grown.width / grown.height - small.width / small.height)).toBeLessThan(0.02)

  // ダブルクリックで設定のダイアログ
  await placed.dblclick()
  const edit = page.getByRole("dialog", { name: "スクラップの設定" })
  // 枠線は初めは引いてあり、スイッチを切ると消える（自分のページを写しているので、中に写った自分の枠線もある）
  await expect(placed.locator("[data-scrap-line]").first()).toBeVisible()
  await edit.getByRole("switch", { name: "枠線" }).click()
  await edit.getByRole("button", { name: "OK" }).click()
  await expect(edit).toBeHidden()
  await expect(placed.locator("[data-scrap-line]")).toHaveCount(0)

  // × でスクラップトレイから消える（置いた物はそのまま）
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
        testBook("scrap-md", "メモ", [
          testPage(MARKDOWN, "scrap-md-page", {
            title: "本文",
            orientation: "portrait",
            text: "# 見出しの字\n\n本文の字です。",
          }),
        ]),
        testBook("scrap-to", "置き先", [drawingPage("scrap-to-page")]),
      ],
      {},
    ],
  })

  test("ページタブの右クリックで切り抜くと、測ってから描いた文書が見え、図面に置くと中に文書が見える", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto(bookScreenUrl("scrap-md"))
    await page.getByRole("tab", { name: "本文" }).click({ button: "right" })
    await page.getByRole("menu").getByRole("menuitem", { name: "スクラップを切り抜く" }).click()
    const cut = page.getByRole("dialog", { name: "スクラップを切り抜く" })
    await expect(cut.locator("[data-scrap-area]")).toBeVisible()
    await expect(cut).toContainText("見出しの字")
    await cut.getByRole("button", { name: "トレイに入れる" }).click()
    await expect(cut).toBeHidden()
    // マークダウンには置けないので、スクラップトレイは開かず、入れたことだけを知らせる。スクラップトレイを開くボタンも出ない
    await expect(page.getByText("スクラップトレイに入れました")).toBeVisible()
    await expect(leftPanel(page)).toHaveCount(0)
    await expect(page.locator("[data-scrap-tray-opener]")).toHaveCount(0)
    await page.goto(bookScreenUrl("scrap-to"))
    await openScrapTray(page)
    await leftPanel(page).locator("[data-scrap-row]").first().getByRole("button").first().click()
    const at = await onPaper(page, 300, 200)
    await page.mouse.click(at.x, at.y)
    const placed = items(page).filter({ has: page.locator('[data-scrap="shown"]') })
    await expect(placed).toHaveCount(1)
    await expect(placed).toContainText("本文の字です。")
    // 右クリックの「元のページを開く」で、マークダウンのページへ移る（スクラップトレイは閉じる）
    await placed.click({ button: "right" })
    await page.getByRole("menu").getByRole("menuitem", { name: "元のページを開く" }).click()
    await expect(page.getByRole("tab", { name: "本文" })).toBeVisible()
    await expect(leftPanel(page)).toHaveCount(0)
  })
})

test.describe("ツリーのページ", () => {
  test.use({
    books: [
      testBook("scrap-tree", "木", [
        testPage(TREE, "scrap-tree-page", { root: { id: "r", caption: "根の字", children: [] } }),
      ]),
    ],
  })

  test("紙の右クリックから切り抜ける", async ({ page }) => {
    await page.goto(bookScreenUrl("scrap-tree"))
    const empty = await onPaper(page, 900, 600)
    await page.mouse.click(empty.x, empty.y, { button: "right" })
    await page.getByRole("menu").getByRole("menuitem", { name: "スクラップを切り抜く" }).click()
    const cut = page.getByRole("dialog", { name: "スクラップを切り抜く" })
    await expect(cut).toContainText("根の字")
  })
})
