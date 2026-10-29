// ディレクトリ構成図のブック（@matomezu/dir）: キーで中身を足して名前を書き、行をドラッグして付け替え、▸・▾ で開け閉めする
import { expect, type Page, test } from "@playwright/test"

const paper = (page: Page) => page.getByRole("img", { name: "紙" })
const rows = (page: Page) => paper(page).locator("[data-entry]")
const row = (page: Page, name: string) => rows(page).filter({ hasText: new RegExp(`^${name}$`) })

async function fromMenu(page: Page, name: string) {
  const trigger = page.locator('button[aria-haspopup="menu"]').first()
  await trigger.hover()
  return trigger.locator("xpath=../following-sibling::div[1]").getByRole("button", { name })
}

// マスターでディレクトリ構成図のブックを作り、根のフォルダ proj だけのページを作る
async function dirBook(page: Page) {
  await page.goto("/")
  await (await fromMenu(page, "ホーム")).click()
  await page.getByRole("button", { name: "新しいブック" }).click()
  const dialog = page.getByRole("dialog", { name: "新しいブック" })
  await page.keyboard.type("構成")
  await dialog.getByLabel("ブックのタイプ").selectOption({ label: "ディレクトリ構成図" })
  await dialog.getByRole("button", { name: "作成" }).click()
  await page.getByRole("button", { name: "ページを作る" }).click()
  const add = page.getByRole("dialog", { name: "新しいページ" })
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
