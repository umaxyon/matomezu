// システムフォルダ: 常駐が書庫ホームの先頭にドキュメントを足し、名前は利用者の設定の言語で引く（設定が無ければ英語）。
// 書庫の画面では名前の変更とゴミ箱をメニューに出さない。言語を変えて名前が当たるなら断り、当たる名前へは変えられない
import { expect, joinedAiAuth, type Page, test } from "./fixtures"
import { storedBooks } from "./helpers/stored"

const perform = async (page: Page, action: string, args: object, on?: object) =>
  (
    await page.request.post("/api/ai/perform", {
      headers: await joinedAiAuth(),
      data: { action, args, ...(on ? { on } : {}) },
    })
  ).json()

test("書庫ホームの先頭にドキュメントが在り、右クリックのメニューに名前の変更とゴミ箱が出ない", async ({ page }) => {
  await page.goto("/")
  await page.bringToFront()
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  const home = page.getByRole("list", { name: "書庫 の中身" })
  await expect(home.getByRole("button").first()).toHaveText("Documents")
  await home.getByRole("button", { name: "Documents" }).click({ button: "right" })
  const menu = page.getByRole("menu")
  await expect(menu.getByRole("menuitem").first()).toBeVisible()
  await expect(menu.getByRole("menuitem", { name: "名前の変更…" })).toHaveCount(0)
  await expect(menu.getByRole("menuitem", { name: "ゴミ箱に入れる" })).toHaveCount(0)
  await page.keyboard.press("Escape")
  // 中へ入ると、パンくずにも名前が出る
  await home.getByRole("button", { name: "Documents" }).dblclick()
  await expect(page.getByRole("navigation", { name: "場所" }).getByRole("button")).toHaveText(["書庫", "Documents"])
})

test("AI は、ドキュメントと同じ名前へブックの名前を変えられず、名前が当たる言語へ変えるのも断られる", async ({
  page,
}) => {
  await page.goto("/")
  const book = ((await storedBooks(page.request)) as { id: string }[])[0]!.id
  expect(await perform(page, "@matomezu/base:book-update", { title: "Documents" }, { book })).toMatchObject({
    ok: false,
    kind: "title-taken",
  })
  expect(await perform(page, "@matomezu/base:entry-rename", { entry: book, title: "ドキュメント" })).toMatchObject({
    ok: true,
  })
  expect(
    await perform(page, "@matomezu/base:settings-set", { values: { "@matomezu/base:lang": "matomezu:ja" } }),
  ).toMatchObject({ ok: false, kind: "title-taken" })
})
