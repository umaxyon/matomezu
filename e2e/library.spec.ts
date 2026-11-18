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

test("ブックスクリーンが無い窓でも、書庫の「ブック新規作成」で開いているフォルダにブックを作れて、新しいブックスクリーンで開く", async ({
  page,
}) => {
  await page.goto("/")
  await page.bringToFront()
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  await page.getByRole("button", { name: "ブック新規作成" }).click()
  const dialog = page.getByRole("dialog", { name: "新しいブック" })
  await dialog.getByLabel("ブックの名前").fill("書庫から作ったブック")
  await page.keyboard.press("Enter")
  await expect(dialog).toHaveCount(0)
  await expect.poll(() => urlFront(page)).toBe(BOOK_SCREEN_DEF)
  await expect
    .poll(async () => ((await storedBooks(page.request)) as { title: string }[]).map(b => b.title))
    .toContain("書庫から作ったブック")
  // ゴミ箱を開いている間は、作るボタンを出さない
  await page.goBack()
  await page.getByRole("navigation", { name: "フォルダ" }).getByRole("button", { name: "ゴミ箱", exact: true }).click()
  await expect(page.getByRole("button", { name: "ブック新規作成" })).toHaveCount(0)
})

test("書庫のゴミ箱に、捨てたフォルダも並ぶ。選んだ行を戻すと、同じ名前が在れば番号を付け、元いたフォルダが無ければ上のフォルダへ入る。完全に消すと無くなる", async ({
  page,
}) => {
  await page.goto("/")
  await page.bringToFront()
  const folder = async (title: string, into?: string) => {
    const made = await perform(page, "@matomezu/base:folder-create", { title, ...(into ? { into } : {}) })
    expect(made).toMatchObject({ ok: true })
    return made.result.folder as string
  }
  const trash = async (entry: string) =>
    expect(await perform(page, "@matomezu/base:entry-trash", { entry })).toMatchObject({ ok: true })
  const plan = await folder("ゴミ箱の試しの企画")
  // 「古い案」を捨てたあと、同じ名前のフォルダを同じ所に作る
  await trash(await folder("古い案", plan))
  await folder("古い案", plan)
  // 「下書き」の中の「メモ箱」を捨て、そのあと「下書き」も捨てる
  const draft = await folder("下書き", plan)
  await trash(await folder("メモ箱", draft))
  await trash(draft)

  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  const tree = page.getByRole("navigation", { name: "フォルダ" })
  await tree.getByRole("button", { name: "ゴミ箱", exact: true }).click()
  // ゴミ箱は、ツリーでは中を出さない
  await expect(tree.getByRole("button", { name: "ゴミ箱 の中を出す" })).toHaveCount(0)
  const list = page.getByRole("list", { name: "ゴミ箱" })
  const row = (name: string) => list.getByRole("listitem").filter({ hasText: name })
  // 元の場所（戻ると入るフォルダ）を出す。元いた「下書き」が無い「メモ箱」は、その上のフォルダ
  await expect(row("メモ箱")).toContainText("ゴミ箱の試しの企画")
  // 選ぶまで、ボタンは出ない
  await expect(list.getByRole("button", { name: "戻す" })).toHaveCount(0)

  // 同じ名前が在る所へ戻す: 番号を付けるかを確かめる
  await row("古い案").getByRole("button").first().click()
  await row("古い案").getByRole("button", { name: "戻す" }).click()
  const taken = page.getByRole("alertdialog", { name: "同じ名前があります" })
  await expect(taken).toContainText("「ゴミ箱の試しの企画」に「古い案」があります")
  await expect(taken).toContainText("「古い案 2」になります")
  // キャンセルすると、戻さない
  await taken.getByRole("button", { name: "キャンセル" }).click()
  await expect(row("古い案")).toHaveCount(1)
  await row("古い案").getByRole("button", { name: "戻す" }).click()
  await taken.getByRole("button", { name: "番号を付ける" }).click()
  await expect(row("古い案")).toHaveCount(0)

  // 元いたフォルダが無い物を戻す: 入る先を確かめる
  await row("メモ箱").getByRole("button").first().click()
  await row("メモ箱").getByRole("button", { name: "戻す" }).click()
  const gone = page.getByRole("alertdialog", { name: "元いたフォルダはゴミ箱の中です" })
  await expect(gone).toContainText("「ゴミ箱の試しの企画」に移動します")
  await gone.getByRole("button", { name: "戻す" }).click()
  await expect(row("メモ箱")).toHaveCount(0)

  // 完全に消す: 確かめてから
  await row("下書き").getByRole("button").first().click()
  await row("下書き").getByRole("button", { name: "完全に消す" }).click()
  const purge = page.getByRole("alertdialog", { name: "「下書き」が完全に消えます" })
  await expect(purge).toContainText("中身も一緒に消えます")
  await purge.getByRole("button", { name: "完全に消す" }).click()
  await expect(row("下書き")).toHaveCount(0)

  // ゴミ箱を空にする: 確かめてから
  await trash(await folder("空にする物", plan))
  await expect(row("空にする物")).toHaveCount(1)
  await page.getByRole("button", { name: "ゴミ箱を空にする" }).click()
  const empty = page.getByRole("alertdialog", { name: "ゴミ箱の物が全部、完全に消えます" })
  await empty.getByRole("button", { name: "キャンセル" }).click()
  await expect(row("空にする物")).toHaveCount(1)
  await page.getByRole("button", { name: "ゴミ箱を空にする" }).click()
  await empty.getByRole("button", { name: "完全に消す" }).click()
  await expect(page.getByText("ゴミ箱は空です")).toBeVisible()
  await expect(page.getByRole("button", { name: "ゴミ箱を空にする" })).toBeDisabled()

  // 戻した物は、元いたフォルダに在る
  await tree.getByRole("button", { name: "書庫", exact: true }).click()
  await page.getByRole("list", { name: "書庫 の中身" }).getByRole("button", { name: "ゴミ箱の試しの企画" }).dblclick()
  await expect(page.getByRole("list", { name: "ゴミ箱の試しの企画 の中身" }).getByRole("button")).toHaveText([
    "古い案",
    "古い案 2",
    "メモ箱",
  ])
})
