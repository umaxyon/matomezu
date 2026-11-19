// システムフォルダ: 常駐が書庫ホームの先頭にドキュメントを足し、名前は利用者の設定の言語で引く（窓を初めて開くと、窓の言語が設定に書かれ、
// 名前の当たる物には、そのあと常駐が番号を付ける）。
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

// 窓が利用者の設定に言語を書くまで待つ
const langWritten = async (page: Page, pack: string) =>
  expect
    .poll(async () => await (await page.request.get("/api/ai/settings", { headers: await joinedAiAuth() })).text())
    .toContain(pack)

test("日本語のブラウザで初めて開くと、書庫ホームの先頭にドキュメントが在り、右クリックのメニューに名前の変更とゴミ箱が出ない", async ({
  page,
}) => {
  await page.goto("/")
  await page.bringToFront()
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  const home = page.getByRole("list", { name: "書庫 の中身" })
  await expect(home.getByRole("button").first()).toHaveText("ドキュメント")
  await home.getByRole("button", { name: "ドキュメント" }).click({ button: "right" })
  const menu = page.getByRole("menu")
  await expect(menu.getByRole("menuitem").first()).toBeVisible()
  await expect(menu.getByRole("menuitem", { name: "名前の変更…" })).toHaveCount(0)
  await expect(menu.getByRole("menuitem", { name: "ゴミ箱に入れる" })).toHaveCount(0)
  await page.keyboard.press("Escape")
  // 中へ入ると、パンくずにも名前が出る
  await home.getByRole("button", { name: "ドキュメント" }).dblclick()
  await expect(page.getByRole("navigation", { name: "場所" }).getByRole("button")).toHaveText(["書庫", "ドキュメント"])
})

test("AI は、ドキュメントと同じ名前へブックの名前を変えられず、名前が当たる言語へ変えるのも断られる", async ({
  page,
}) => {
  await page.goto("/")
  await langWritten(page, "matomezu:ja")
  const book = ((await storedBooks(page.request)) as { id: string }[])[0]!.id
  expect(await perform(page, "@matomezu/base:book-update", { title: "ドキュメント" }, { book })).toMatchObject({
    ok: false,
    kind: "title-taken",
    systemFolder: "@matomezu/base:documents",
  })
  expect(await perform(page, "@matomezu/base:entry-rename", { entry: book, title: "Documents" })).toMatchObject({
    ok: true,
  })
  expect(
    await perform(page, "@matomezu/base:settings-set", { values: { "@matomezu/base:lang": "matomezu:en" } }),
  ).toMatchObject({ ok: false, kind: "title-taken" })
})

test("日本語のブラウザで初めて開くと、先に在った利用者の「ドキュメント」は、常駐が番号を付けて「ドキュメント 2」になる", async ({
  page,
}) => {
  // 言語を選んでいない間（英語で引く）は、ドキュメントと当たらない
  const book = ((await storedBooks(page.request)) as { id: string }[])[0]!.id
  expect(await perform(page, "@matomezu/base:entry-rename", { entry: book, title: "ドキュメント" })).toMatchObject({
    ok: true,
  })
  await page.goto("/")
  await page.bringToFront()
  await langWritten(page, "matomezu:ja")
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  const home = page.getByRole("list", { name: "書庫 の中身" })
  await expect(home.getByRole("button", { name: "ドキュメント 2" })).toBeVisible()
  await expect(home.getByRole("button", { name: "ドキュメント", exact: true })).toHaveCount(1)
})
