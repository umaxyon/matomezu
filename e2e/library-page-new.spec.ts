// 書庫の画面の「ページ新規作成」: 押すとページのタイプの一覧が開き、選んだタイプの「ページを作る」ダイアログで作ると、
// 開いているフォルダにブックの外のページが出来て、それを選ぶ（書庫の画面のまま）。スライドは、そのページだけのバインダが出来る。
// タイプが自分のダイアログを名指す物（ツリー）も、書庫から作れる。右クリックの「新しいページ…」も同じ一覧を開く
import { expect, test } from "./fixtures"

test("「ページ新規作成」でタイプを選んで作ると、書庫ホームにページが出来て選ばれる。スライドはバインダになる", async ({
  page,
}) => {
  await page.goto("/")
  await page.bringToFront()
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  const home = page.getByRole("list", { name: "書庫 の中身" })
  await expect(home).toBeVisible()
  const create = page.getByRole("button", { name: "ページ新規作成" })

  await create.click()
  await page.getByRole("menu").getByRole("menuitem", { name: "図面" }).click()
  const drawing = page.getByRole("dialog", { name: "新しい図面" })
  await expect(drawing.getByLabel("ページの名前")).toHaveValue("ページ 1")
  await drawing.getByLabel("ページの名前").fill("外の図")
  await drawing.getByRole("button", { name: "作成" }).click()
  await expect(drawing).toBeHidden()
  await expect(home.getByRole("button", { name: "外の図" })).toHaveAttribute("aria-pressed", "true")

  // 同じ名前は作れない（ダイアログは開いたまま）
  await create.click()
  await page.getByRole("menu").getByRole("menuitem", { name: "図面" }).click()
  await drawing.getByLabel("ページの名前").fill("外の図")
  await drawing.getByRole("button", { name: "作成" }).click()
  await expect(drawing).toBeVisible()
  await expect(home.getByRole("button", { name: "外の図" })).toHaveCount(1)
  await page.keyboard.press("Escape")

  await create.click()
  await page.getByRole("menu").getByRole("menuitem", { name: "スライド" }).click()
  const slide = page.getByRole("dialog", { name: "新しいスライド" })
  await slide.getByLabel("名前").fill("外の発表")
  await slide.getByRole("button", { name: "作成" }).click()
  await expect(slide).toBeHidden()
  await expect(home.getByRole("button", { name: "外の発表" })).toHaveAttribute("aria-pressed", "true")

  // ツリーは、タイプが名指すダイアログで作る
  await create.click()
  await page.getByRole("menu").getByRole("menuitem", { name: "ツリー" }).click()
  const tree = page.getByRole("dialog", { name: "新しいツリー" })
  await tree.getByLabel("ページ名").fill("外のツリー")
  await tree.getByRole("button", { name: "作る" }).click()
  await expect(tree).toBeHidden()
  await expect(home.getByRole("button", { name: "外のツリー" })).toHaveAttribute("aria-pressed", "true")

  // ブックの外のバインダの行から: スライドはそのバインダに足し（行は増えない）、ほかのタイプはバインダを入れているフォルダに作る
  const rows = home.getByRole("button")
  const before = await rows.count()
  await home.getByRole("button", { name: "外の発表" }).click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "新しいページ…" }).click()
  await page.getByRole("menu").getByRole("menuitem", { name: "スライド" }).click()
  await slide.getByRole("button", { name: "作成" }).click()
  await expect(slide).toBeHidden()
  await expect(rows).toHaveCount(before)
  await home.getByRole("button", { name: "外の発表" }).click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "新しいページ…" }).click()
  await page.getByRole("menu").getByRole("menuitem", { name: "図面" }).click()
  await drawing.getByLabel("ページの名前").fill("バインダの隣")
  await drawing.getByRole("button", { name: "作成" }).click()
  await expect(home.getByRole("button", { name: "バインダの隣" })).toHaveAttribute("aria-pressed", "true")

  // 何も無い所の右クリックの「新しいページ…」も、同じ一覧を開く
  await home.click({ button: "right", position: { x: 5, y: 5 } })
  await page.getByRole("menu").getByRole("menuitem", { name: "新しいページ…" }).click()
  await expect(page.getByRole("menu").getByRole("menuitem", { name: "図面" })).toBeVisible()
})
