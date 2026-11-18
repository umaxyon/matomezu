// 書庫の画面（コントロールセンターの中）: 左のツリーと右の枠で書庫を見て、フォルダへ入り、ブックを 2 回押して開く
import { BOOK_SCREEN_DEF, expect, joinedAiAuth, type Page, test, urlFront, urlStages } from "./fixtures"
import { storedBooks } from "./helpers/stored"

const perform = async (page: Page, action: string, args: object) =>
  (await page.request.post("/api/ai/perform", { headers: await joinedAiAuth(), data: { action, args } })).json()

test("書庫でフォルダへ入るとパンくずが伸び、ブラウザの戻るで前のフォルダへ戻る。ブックを 2 回押すと新しいブックスクリーンで開く", async ({
  page,
}) => {
  await page.goto("/")
  await page.bringToFront()
  const books = (await storedBooks(page.request)) as { id: string; title: string }[]
  const book = books[0]!
  const made = await perform(page, "@matomezu/base:folder-create", { title: "仕事" })
  expect(made).toMatchObject({ ok: true })
  expect(await perform(page, "@matomezu/base:entry-move", { entry: book.id, into: made.result.folder })).toMatchObject({
    ok: true,
  })
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  const tree = page.getByRole("navigation", { name: "フォルダ" })
  const path = page.getByRole("navigation", { name: "場所" })
  await expect(path.getByRole("button")).toHaveText(["書庫"])
  // 右の枠のフォルダを 2 回押すと中へ入る
  const home = page.getByRole("list", { name: "書庫 の中身" })
  await home.getByRole("button", { name: "仕事" }).click()
  await expect(home.getByRole("button", { name: "仕事" })).toHaveAttribute("aria-pressed", "true")
  await home.getByRole("button", { name: "仕事" }).dblclick()
  await expect(path.getByRole("button")).toHaveText(["書庫", "仕事"])
  const inside = page.getByRole("list", { name: "仕事 の中身" })
  await expect(inside.getByRole("button")).toHaveText([book.title])
  // ツリーでは、入ったフォルダが太字になり、開閉の印で中を出す
  await expect(tree.getByRole("button", { name: "仕事", exact: true })).toHaveAttribute("aria-current", "true")
  await tree.getByRole("button", { name: "仕事 の中を出す" }).click()
  await expect(tree.getByRole("button", { name: book.title, exact: true })).toBeVisible()
  await page.screenshot({ path: "/tmp/m0126/library.png" })
  // ブラウザの戻るで書庫ホームへ、進むでフォルダへ
  await page.goBack()
  await expect(path.getByRole("button")).toHaveText(["書庫"])
  await page.goForward()
  await expect(path.getByRole("button")).toHaveText(["書庫", "仕事"])
  // 読み直しても同じフォルダ
  await page.reload()
  await expect(path.getByRole("button")).toHaveText(["書庫", "仕事"])
  // ブックを 2 回押すと、新しいブックスクリーンで開く
  await page.getByRole("list", { name: "仕事 の中身" }).getByRole("button", { name: book.title }).dblclick()
  await expect.poll(() => urlFront(page)).toBe(BOOK_SCREEN_DEF)
  await expect.poll(() => urlStages(page)[0]?.b).toBe(book.id)
})
