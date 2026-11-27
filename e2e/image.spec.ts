// 画像の取り込み: 書庫の「画像」のフォルダの右クリックの「画像を取り込む…」で OS のファイルの窓が開き、選んだファイル 1 つが画像のページ 1 枚になる（名前は拡張子を取ったファイル名）。
// 名前が重なれば 1 件ずつ「番号を付ける・上書き・やめる」を聞く（上書きは、利用者だけのアクション page-create-over）。開いたページは画像を描く。「画像」の外の右クリックには出ない
import { expect, test } from "./fixtures"
import { panel } from "./helpers/note"
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
