// 画像の取り込み: 書庫の「画像」のフォルダの右クリックの「画像を取り込む…」で OS のファイルの窓が開き、選んだファイル 1 つが画像のページ 1 枚になる（名前は拡張子を取ったファイル名）。
// 名前が重なれば 1 件ずつ「番号を付ける・上書き・やめる」を聞く（上書きは、利用者だけのアクション page-create-over）。開いたページは画像を描く。「画像」の外の右クリックには出ない
import type { Locator, Page } from "@playwright/test"
import { drawingPage, SLIDE, testBinder, testBook, testPage, withSlide } from "../test/lineup"
import { bookScreenUrl, expect, test } from "./fixtures"
import { panel } from "./helpers/note"
import { leftPanel } from "./helpers/outbox"
import { items, onPaper } from "./helpers/paper"
import { fromMenu } from "./helpers/stage-menu"

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
  "base64",
)
const SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="teal"/></svg>`,
)

test("「画像」のフォルダで画像を取り込むと、ファイルごとに画像のページが出来て、名前が重なれば聞き、開くと画像を描く", async ({
  page,
}) => {
  await page.goto("/")
  await page.bringToFront()
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  const home = page.getByRole("list", { name: "書庫 の中身" })
  await expect(home).toBeVisible()

  // 「画像」の外では出ない
  await home.click({ button: "right", position: { x: 5, y: 5 } })
  await expect(page.getByRole("menu").getByRole("menuitem", { name: "新しいページ…" })).toBeVisible()
  await expect(page.getByRole("menu").getByRole("menuitem", { name: "画像を取り込む…" })).toHaveCount(0)
  await page.keyboard.press("Escape")

  // 「画像」の行の右クリックの先頭に出て、押すとファイルの窓が開く（いくつも選べる）
  await home.getByRole("button", { name: "画像", exact: true }).click({ button: "right" })
  await expect(page.getByRole("menu").getByRole("menuitem").first()).toHaveText("画像を取り込む…")
  const picked = page.waitForEvent("filechooser")
  await page.getByRole("menu").getByRole("menuitem", { name: "画像を取り込む…" }).click()
  const chooser = await picked
  expect(chooser.isMultiple()).toBe(true)
  await chooser.setFiles([
    { name: "写真.png", mimeType: "image/png", buffer: PNG },
    { name: "図.svg", mimeType: "image/svg+xml", buffer: SVG },
  ])
  await home.getByRole("button", { name: "画像", exact: true }).dblclick()
  const images = page.getByRole("list", { name: "画像 の中身" })
  await expect(images.getByRole("button")).toHaveText(["写真", "図"])

  // 同じ名前を取り込むと聞く: 番号を付ければ「写真 2」になる
  await images.click({ button: "right", position: { x: 5, y: 5 } })
  const again = page.waitForEvent("filechooser")
  await page.getByRole("menu").getByRole("menuitem", { name: "画像を取り込む…" }).click()
  await (await again).setFiles([{ name: "写真.png", mimeType: "image/png", buffer: PNG }])
  await page.getByRole("button", { name: "番号を付ける" }).click()
  await expect(images.getByRole("button")).toHaveText(["写真", "図", "写真 2"])

  // 上書きを選べば、元のページを消して、その位置に新しいページが入る
  await images.click({ button: "right", position: { x: 5, y: 5 } })
  const over = page.waitForEvent("filechooser")
  await page.getByRole("menu").getByRole("menuitem", { name: "画像を取り込む…" }).click()
  await (await over).setFiles([{ name: "写真.png", mimeType: "image/png", buffer: PNG }])
  await page.getByRole("button", { name: "上書き", exact: true }).click()
  await expect(images.getByRole("button")).toHaveText(["写真", "図", "写真 2"])
  await expect(page.getByRole("button", { name: "上書き", exact: true })).toHaveCount(0)

  // 「画像」の中では、新しいブックは押せず、新しいページ…のタイプは画像だけが押せる
  await images.click({ button: "right", position: { x: 5, y: 5 } })
  const menu = page.getByRole("menu")
  await expect(menu.getByRole("menuitem", { name: "新しいブック…" })).toBeDisabled()
  await menu.getByRole("menuitem", { name: "新しいページ…" }).click()
  await expect(page.getByRole("menu").getByRole("menuitem", { name: "図面" })).toBeDisabled()
  await expect(page.getByRole("menu").getByRole("menuitem", { name: "画像" })).toBeEnabled()
  await page.keyboard.press("Escape")

  // 開くと画像を描く（読めた画像の幅が在る）
  await images.getByRole("button", { name: "図", exact: true }).dblclick()
  const shown = page.locator("img[src^='api/assets/']")
  await expect(shown).toBeVisible()
  await expect.poll(() => shown.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(40)
})

test("画像のページの印刷は、画像を読み終えるまで印刷のボタンが押せない", async ({ page }) => {
  // 画像の配りを、離すまで止める
  let release = () => {}
  const held = new Promise<void>(done => {
    release = done
  })
  await page.route("**/api/assets/*", async route => {
    if (route.request().method() !== "GET") return route.fallback()
    await held
    await route.fallback()
  })
  await page.goto("/")
  await page.bringToFront()
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  const home = page.getByRole("list", { name: "書庫 の中身" })
  await home.getByRole("button", { name: "画像", exact: true }).click({ button: "right" })
  const picked = page.waitForEvent("filechooser")
  await page.getByRole("menu").getByRole("menuitem", { name: "画像を取り込む…" }).click()
  await (await picked).setFiles([{ name: "待つ.png", mimeType: "image/png", buffer: PNG }])
  await home.getByRole("button", { name: "画像", exact: true }).dblclick()
  await page.getByRole("list", { name: "画像 の中身" }).getByRole("button", { name: "待つ", exact: true }).dblclick()
  await (await fromMenu(page, "印刷プレビュー")).click()
  await expect(panel(page)).toContainText("印刷プレビュー")
  const print = panel(page).getByRole("button", { name: "印刷", exact: true })
  await expect(page.locator("[data-sheet]")).toHaveCount(1)
  await expect(print).toBeDisabled()
  release()
  await expect(print).toBeEnabled()
})

test.describe("画像のページのスクラップ", () => {
  test.use({ books: [testBook("img-scrap-book", "置く先の図", [drawingPage("img-scrap-page")])] })

  test("画像のページを切り抜くと範囲は画像だけで、図面に置くと紙の余白なしに画像を縦横の比のまま描く", async ({
    page,
  }) => {
    await page.goto("/")
    await page.bringToFront()
    await page.getByRole("button", { name: "書庫", exact: true }).first().click()
    const home = page.getByRole("list", { name: "書庫 の中身" })
    await home.getByRole("button", { name: "画像", exact: true }).click({ button: "right" })
    const picked = page.waitForEvent("filechooser")
    await page.getByRole("menu").getByRole("menuitem", { name: "画像を取り込む…" }).click()
    await (await picked).setFiles([{ name: "横長.svg", mimeType: "image/svg+xml", buffer: SVG }])
    await home.getByRole("button", { name: "画像", exact: true }).dblclick()
    const images = page.getByRole("list", { name: "画像 の中身" })

    // 書庫の画像のページの右クリックの「スクラップを作る」: ダイアログを開かずに、画像全体をスクラップトレイに入れる
    await images.getByRole("button", { name: "横長", exact: true }).click({ button: "right" })
    await page.getByRole("menu").getByRole("menuitem", { name: "スクラップを作る" }).click()
    await expect(page.getByText("スクラップトレイに入れました")).toBeVisible()
    await page.keyboard.press("Escape")
    await images.getByRole("button", { name: "横長", exact: true }).dblclick()

    // 画面を右クリックして切り抜く。範囲を選ぶ所の絵は、画像だけ（40 × 20 の比）
    await expect(page.locator("img[src^='api/assets/']")).toHaveCount(1)
    await page.getByRole("region", { name: "ステージ" }).click({ button: "right" })
    await page.getByRole("menu").getByRole("menuitem", { name: "スクラップを切り抜く" }).click()
    const cut = page.getByRole("dialog", { name: "スクラップを切り抜く" })
    const area = (await cut.locator("[data-scrap-area]").boundingBox())!
    expect(area.width / area.height).toBeCloseTo(2, 1)
    await cut.getByRole("button", { name: "トレイに入れる" }).click()
    await expect(cut).toBeHidden()

    // 図面のブックを開き、スクラップトレイから置く
    await page.goto(bookScreenUrl("img-scrap-book"))
    const tabs = (await page.locator("[data-page-tabs]").first().boundingBox())!
    await page.mouse.move(tabs.x + tabs.width - 20, tabs.y + tabs.height / 2)
    await page.getByRole("button", { name: "スクラップトレイを開く" }).click()
    const rows = leftPanel(page).locator("[data-scrap-row]")
    await expect(rows).toHaveCount(2) // 書庫から作った物と、切り抜いた物
    await rows.first().getByRole("button").first().click()
    const at = await onPaper(page, 250, 300)
    await page.mouse.click(at.x, at.y)
    const placed = items(page).filter({ has: page.locator('[data-scrap="shown"]') })
    await expect(placed).toHaveCount(1)
    await expect(placed.locator("img")).toBeVisible()
    const box = (await placed.boundingBox())!
    expect(box.width / box.height).toBeCloseTo(2, 1)
    const img = (await placed.locator("img").boundingBox())!
    expect(img.width).toBeCloseTo(box.width, -1)
  })
})

// 要素 target の、画面の点 at に、ファイル files を外から落とす（OS のファイルのドラッグの代わりに、ファイルを持つ DataTransfer で dragover と drop を起こす）
async function dropFiles(
  page: Page,
  target: Locator,
  at: { x: number; y: number },
  files: readonly { name: string; type: string; bytes: Buffer }[],
) {
  const data = await page.evaluateHandle(
    fs => {
      const dt = new DataTransfer()
      for (const f of fs)
        dt.items.add(new File([Uint8Array.from(atob(f.b64), c => c.charCodeAt(0))], f.name, { type: f.type }))
      return dt
    },
    files.map(f => ({ name: f.name, type: f.type, b64: f.bytes.toString("base64") })),
  )
  const init = { dataTransfer: data, clientX: at.x, clientY: at.y, bubbles: true }
  await target.dispatchEvent("dragover", init)
  await target.dispatchEvent("drop", init)
}

test.describe("画像のファイルを落として置く", () => {
  test.use({
    books: [
      [
        testBook("drop-book", "落とす先の図", [drawingPage("drop-page")]),
        testBook("drop-slide-book", "落とす先の発表", [
          testBinder(
            "drop-slides",
            "スライド",
            SLIDE,
            withSlide(testPage(SLIDE, "drop-slide-p1", { title: "1", paper: "@matomezu/base:ratio-16x9" }), []),
          ),
        ]),
      ],
      { option: true },
    ] as never,
  })

  test("図面に落とすと「画像」の直下に取り込んで落とした所にスクラップを置き、同じ画像はページを増やさず、画像でない物は断る", async ({
    page,
  }) => {
    await page.goto(bookScreenUrl("drop-book"))
    const paper = page.locator("[data-placing]:not([data-slide-layer])")
    const at = await onPaper(page, 200, 150)
    await dropFiles(page, paper, at, [{ name: "犬.svg", type: "image/svg+xml", bytes: SVG }])
    const placed = items(page).filter({ has: page.locator('[data-scrap="shown"]') })
    await expect(placed).toHaveCount(1)
    await expect(placed.locator("img")).toBeVisible()
    // 左上が落とした所
    const box = (await placed.boundingBox())!
    expect(Math.abs(box.x - at.x)).toBeLessThan(4)
    expect(Math.abs(box.y - at.y)).toBeLessThan(4)

    // 取り消すと、置いたスクラップだけが消える（取り込んだ画像のページは「画像」に残る）
    const empty = await onPaper(page, 600, 450)
    await page.mouse.click(empty.x, empty.y)
    await page.keyboard.press("Control+z")
    await expect(placed).toHaveCount(0)

    // 同じ画像・別の画像・画像でない物をいっしょに落とす: 画像は右へずらして置き、画像でない物は訳を知らせて飛ばす
    const next = await onPaper(page, 300, 300)
    await dropFiles(page, paper, next, [
      { name: "犬.svg", type: "image/svg+xml", bytes: SVG },
      { name: "写真.png", type: "image/png", bytes: PNG },
      { name: "メモ.txt", type: "text/plain", bytes: Buffer.from("x") },
    ])
    await expect(placed).toHaveCount(2)
    await expect(page.getByText("メモ.txt を入れられませんでした")).toBeVisible()
    const [first, second] = [(await placed.nth(0).boundingBox())!, (await placed.nth(1).boundingBox())!]
    expect(Math.abs(second.x - first.x)).toBeGreaterThan(10)

    // 「画像」の直下には、犬（1 枚だけ。同じ画像は増やさない）と写真
    await page.goto("/")
    await page.getByRole("button", { name: "書庫", exact: true }).first().click()
    await page.getByRole("list", { name: "書庫 の中身" }).getByRole("button", { name: "画像", exact: true }).dblclick()
    const images = page.getByRole("list", { name: "画像 の中身" })
    await expect(images.getByRole("button", { name: "犬", exact: true })).toHaveCount(1)
    await expect(images.getByRole("button", { name: /^犬 / })).toHaveCount(0)
    await expect(images.getByRole("button", { name: "写真", exact: true })).toHaveCount(1)
  })

  test("スライドに落とすと、左上が落とした所に来るスクラップを置く", async ({ page }) => {
    await page.goto(bookScreenUrl("drop-slide-book"))
    const layer = page.locator("[data-slide-layer]")
    const at = await onPaper(page, 100, 80)
    await dropFiles(page, layer, at, [{ name: "写真.png", type: "image/png", bytes: PNG }])
    const placed = layer.locator("[data-item]").filter({ has: page.locator('[data-scrap="shown"]') })
    await expect(placed).toHaveCount(1)
    const box = (await placed.boundingBox())!
    expect(Math.abs(box.x - at.x)).toBeLessThan(4)
    expect(Math.abs(box.y - at.y)).toBeLessThan(4)
  })
})
