// ディレクトリ構成図のブック（@matomezu/dir）: キーで中身を足して名前を書き、行をドラッグして付け替え、▸・▾ で開け閉めする
import { BOOK_SCREEN_URL, expect, type Page, test } from "./fixtures"
import { imeCompose } from "./helpers/ime"
import { newBook } from "./helpers/new-book"
import { paper } from "./helpers/paper"

const rows = (page: Page) => paper(page).locator("[data-entry]")
const row = (page: Page, name: string) => rows(page).filter({ hasText: new RegExp(`^${name}$`) })

// ディレクトリ構成図のブックを作り、根のフォルダ proj だけのページを作る
async function dirBook(page: Page) {
  await page.goto(BOOK_SCREEN_URL)
  const add = await newBook(page, "構成", "ディレクトリ構成図")
  await add.getByLabel("根のフォルダの名前").fill("proj")
  await add.getByRole("button", { name: "作る" }).click()
  await expect(rows(page)).toHaveText(["proj"])
}

// その場の編集のテキストFormに name を書いて確定する
async function write(page: Page, name: string) {
  const input = paper(page).getByRole("textbox", { name: "名前" })
  await expect(input).toBeFocused()
  await page.keyboard.type(name)
  await page.keyboard.press("Enter")
  await expect(input).toHaveCount(0)
}

test("Tab の枠と f で中身を足して名前を書き、行をフォルダの上へドラッグすると中へ移る。ハンドでも ▸・▾ で開け閉めできる", async ({
  page,
}) => {
  await dirBook(page)
  await page.keyboard.press("Tab")
  await expect(paper(page).getByRole("menu", { name: "中に足す" })).toBeVisible()
  await page.keyboard.press("Enter") // フォルダ
  await write(page, "src")
  await page.keyboard.press("Tab")
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter") // ファイル
  await write(page, "a.ts")
  await page.keyboard.press("Home")
  await page.keyboard.press("f")
  await write(page, "README.md")
  await expect(rows(page)).toHaveText(["proj", "src", "a.ts", "README.md"])

  const from = (await row(page, "README.md").boundingBox())!
  const to = (await row(page, "src").boundingBox())!
  await page.mouse.move(from.x + 30, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + 30, to.y + to.height / 2, { steps: 8 })
  await expect(row(page, "src")).toHaveAttribute("data-drop", "true")
  await page.mouse.up()
  await expect(rows(page)).toHaveText(["proj", "src", "a.ts", "README.md"])
  const depth = async (name: string) => (await row(page, name).boundingBox())!.x
  expect(await depth("README.md")).toBe(await depth("a.ts")) // src の中へ

  await page.getByRole("button", { name: "鉛筆" }).click() // 回してハンドへ
  await paper(page).getByRole("button", { name: "閉じる" }).nth(1).click()
  await expect(rows(page)).toHaveText(["proj", "src"])
  await paper(page).getByRole("button", { name: "開く" }).click()
  await expect(rows(page)).toHaveText(["proj", "src", "a.ts", "README.md"])
})

test("足して名前を書いた行は、1 回の Ctrl+Z で消える。あとで書き直したのは、書き直しだけが 1 つの画面の履歴の段", async ({
  page,
}) => {
  await dirBook(page)
  await page.keyboard.press("f")
  await write(page, "a.ts")
  await expect(rows(page)).toHaveText(["proj", "a.ts"])
  await row(page, "a.ts").dblclick()
  await page.keyboard.press("Control+a")
  await write(page, "b.ts")
  await expect(rows(page)).toHaveText(["proj", "b.ts"])
  await page.keyboard.press("Control+z")
  await expect(rows(page)).toHaveText(["proj", "a.ts"])
  await page.keyboard.press("Control+z")
  await expect(rows(page)).toHaveText(["proj"])
})

test("日本語の変換中（確定する前）の名前にも、入力の枠が合わせて広がる", async ({ page }) => {
  await dirBook(page)
  await page.keyboard.press("Tab")
  await page.keyboard.press("Enter") // フォルダ
  const input = paper(page).getByRole("textbox", { name: "名前" })
  await expect(input).toBeFocused()
  const before = (await input.boundingBox())!.width
  await imeCompose(page, "とても長いフォルダの名前")
  await expect.poll(async () => (await input.boundingBox())!.width).toBeGreaterThan(before)
})

test("ページのタブの頭にブックのタイプのアイコンが付き、ノードの設定でアイコンを選ぶと行の頭の絵が替わる（フォルダは folder・book、ファイルはそれ以外）", async ({
  page,
}) => {
  await dirBook(page)
  await expect(page.getByRole("tab").first().locator("svg")).toBeVisible()
  await page.keyboard.press("f")
  await write(page, "a.ts")
  const settings = async (name: string) => {
    await row(page, name).click({ button: "right" })
    await page.getByRole("menuitem", { name: "設定…" }).click()
    return page.getByRole("dialog", { name: "ノードの設定" })
  }
  // ファイル: 既定は file（選びが 1 つ目）。図面にすると行の頭の絵が替わる
  const file = await settings("a.ts")
  await expect(file.getByRole("radio", { name: "ファイル" })).toHaveAttribute("aria-checked", "true")
  await expect(file.getByRole("radio", { name: "ブック" })).toHaveCount(0)
  await file.getByRole("radio", { name: "図面" }).click()
  await file.getByRole("button", { name: "確定" }).click()
  await expect(row(page, "a.ts").locator("[data-icon]")).toHaveAttribute("data-icon", "drawing")
  // フォルダ（根）: folder と book の 2 つだけ
  const folder = await settings("proj")
  await expect(folder.getByRole("radio")).toHaveCount(2)
  await folder.getByRole("radio", { name: "ブック" }).click()
  await folder.getByRole("button", { name: "確定" }).click()
  await expect(row(page, "proj").locator("[data-icon]")).toHaveAttribute("data-icon", "book")
})
