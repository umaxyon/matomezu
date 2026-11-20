// 書庫の画面（コントロールセンターの中）: 左のツリーと右の枠で書庫を見て、フォルダへ入り、ブックを 2 回押して開く

import type { Locator } from "@playwright/test"
import { drawingPage, testBook } from "../test/lineup"
import { BOOK_SCREEN_DEF, expect, joinedAiAuth, type Page, test, urlCurrentScreen, urlStages } from "./fixtures"
import { storedBook, storedBooks } from "./helpers/stored"

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
  await expect.poll(() => urlCurrentScreen(page)).toBe(BOOK_SCREEN_DEF)
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
  await expect.poll(() => urlCurrentScreen(page)).toBe(BOOK_SCREEN_DEF)
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
  // 列の見出しは一覧の上に出て、行には数えない
  await expect(page.getByText("名前元の場所捨てた日時")).toBeVisible()
  // 元の場所（戻ると入るフォルダ）を出す。元いた「下書き」が無い「メモ箱」は、その上のフォルダ
  await expect(row("メモ箱")).toContainText("ゴミ箱の試しの企画")
  // 選ぶまで、ボタンは出ない
  await expect(list.getByRole("button", { name: "戻す" })).toHaveCount(0)

  // 同じ名前が在る所へ戻す: 番号を付けるかを確かめる
  await row("古い案").getByRole("button").first().click()
  await row("古い案").getByRole("button", { name: "戻す" }).click()
  const taken = page.getByRole("alertdialog", { name: "同じ名前があります" })
  await expect(taken).toContainText("「ゴミ箱の試しの企画」に「古い案」があります")
  await expect(taken).toContainText("番号を付けると「古い案 2」になります")
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

test("ゴミ箱から上書きで戻すと、前から在った物が消える。そのまま Ctrl+Z で両方が元どおりになり、Ctrl+Shift+Z でやり直せる。ロック中の物には上書きを選べない", async ({
  page,
}) => {
  await page.goto("/")
  await page.bringToFront()
  const made = async (action: string, args: object) => {
    const done = await perform(page, action, args)
    expect(done).toMatchObject({ ok: true })
    return done.result as { folder: string; book: string }
  }
  const plan = (await made("@matomezu/base:folder-create", { title: "上書きの試しの企画" })).folder
  // 捨てた「議事録」と、同じ所にあとから作った「議事録」
  const old = (await made("@matomezu/base:book-create", { title: "議事録", into: plan })).book
  await made("@matomezu/base:entry-trash", { entry: old })
  const fresh = (await made("@matomezu/base:book-create", { title: "議事録", into: plan })).book

  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  await page.getByRole("navigation", { name: "フォルダ" }).getByRole("button", { name: "ゴミ箱", exact: true }).click()
  const list = page.getByRole("list", { name: "ゴミ箱" })
  const row = list.getByRole("listitem").filter({ hasText: "議事録" }).filter({ hasText: "上書きの試しの企画" })
  await row.getByRole("button").first().click()
  await row.getByRole("button", { name: "戻す" }).click()
  const taken = page.getByRole("alertdialog", { name: "同じ名前があります" })
  await expect(taken).toContainText("上書きすると、元の物とその中身は削除されます")
  await expect(taken).toContainText("（ゴミ箱には入りません）")
  await taken.getByRole("button", { name: "上書き" }).click()
  await expect(row).toHaveCount(0)
  // クリックせずに、そのまま Ctrl+Z: 戻した物はゴミ箱へ、消えた物は元の所へ
  await page.keyboard.press("Control+z")
  await expect(row).toHaveCount(1)
  // やり直すと、もう一度上書きの後
  // 選んでいた行がやり直しで消えても、キーは効き続ける
  await row.getByRole("button").first().click()
  await page.keyboard.press("Control+Shift+z")
  await expect(row).toHaveCount(0)
  await expect.poll(async () => await storedBook(page.request, fresh)).toBeUndefined()
  await page.keyboard.press("Control+z")
  await expect(row).toHaveCount(1)
  // AI がロックできるように、前から在った方が常駐に戻るのを待つ（上の、常駐から消えるのを待つ所と合わせて、順を決める）
  await expect.poll(async () => (await storedBook(page.request, fresh))?.id).toBe(fresh)

  // 前から在った方をロックすると、上書きは選べず、訳が出る
  expect(
    await (
      await page.request.post("/api/ai/perform", {
        headers: await joinedAiAuth(),
        data: { action: "@matomezu/base:book-lock", args: {}, on: { book: fresh } },
      })
    ).json(),
  ).toMatchObject({ ok: true })
  await row.getByRole("button").first().click()
  await row.getByRole("button", { name: "戻す" }).click()
  await expect(taken).toContainText("上書きできません: ロック中")
  await expect(taken.getByRole("button", { name: "上書き" })).toBeDisabled()
  await taken.getByRole("button", { name: "キャンセル" }).click()
})

test("AI が書庫で変えた名前は、その入れ物のフォルダを見せている間に見えたら、書庫の Ctrl+Z で戻せる。見せていないフォルダの中の変更は、開くまで戻らない", async ({
  page,
}) => {
  await page.goto("/")
  await page.bringToFront()
  const made = async (action: string, args: object) => {
    const done = await perform(page, action, args)
    expect(done).toMatchObject({ ok: true })
    return done.result as { folder: string; book: string }
  }
  const shown = (await made("@matomezu/base:folder-create", { title: "見せる所" })).folder
  const hidden = (await made("@matomezu/base:folder-create", { title: "見せない所" })).folder
  const seen = (await made("@matomezu/base:book-create", { title: "見える前の名前", into: shown })).book
  const unseen = (await made("@matomezu/base:book-create", { title: "見えない前の名前", into: hidden })).book

  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  const home = page.getByRole("list", { name: "書庫 の中身" })
  await home.getByRole("button", { name: "見せる所" }).dblclick()
  const inside = page.getByRole("list", { name: "見せる所 の中身" })
  await expect(inside.getByRole("button", { name: "見える前の名前" })).toBeVisible()
  // AI が、見せているフォルダの中と、見せていないフォルダの中で、名前を変える
  await made("@matomezu/base:entry-rename", { entry: unseen, title: "AI が見えない所で付けた名前" })
  await made("@matomezu/base:entry-rename", { entry: seen, title: "AI が付けた名前" })
  await expect(inside.getByRole("button", { name: "AI が付けた名前" })).toBeVisible()
  // 書庫の中に焦点を置いて Ctrl+Z: 見えた方が戻る。見せていないフォルダの中の変更は、戻らない
  await inside.getByRole("button", { name: "AI が付けた名前" }).click()
  await page.keyboard.press("Control+z")
  await expect(inside.getByRole("button", { name: "見える前の名前" })).toBeVisible()
  await expect.poll(async () => (await storedBook(page.request, seen))?.title).toBe("見える前の名前")
  expect((await storedBook(page.request, unseen))?.title).toBe("AI が見えない所で付けた名前")
  // 見せていなかったフォルダを開くと見えたことになり、Ctrl+Z で戻せる
  await page.getByRole("navigation", { name: "場所" }).getByRole("button", { name: "書庫" }).click()
  await home.getByRole("button", { name: "見せない所" }).dblclick()
  const other = page.getByRole("list", { name: "見せない所 の中身" })
  await other.getByRole("button", { name: "AI が見えない所で付けた名前" }).click()
  await page.keyboard.press("Control+z")
  await expect(other.getByRole("button", { name: "見えない前の名前" })).toBeVisible()
  await expect.poll(async () => (await storedBook(page.request, unseen))?.title).toBe("見えない前の名前")
})

test("書庫の右の枠の上のボタンで、元に戻す・やり直すができる。戻す先がほかの変更とぶつかると、トーストの 2 行目に訳が出る", async ({
  page,
}) => {
  await page.goto("/")
  await page.bringToFront()
  const made = async (action: string, args: object) => {
    const done = await perform(page, action, args)
    expect(done).toMatchObject({ ok: true })
    return done.result as { folder: string; book: string }
  }
  const folder = (await made("@matomezu/base:folder-create", { title: "ボタンの試しの所" })).folder
  const book = (await made("@matomezu/base:book-create", { title: "ボタンの前の名前", into: folder })).book

  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  const undo = page.getByRole("button", { name: "書庫で元に戻す" })
  const redo = page.getByRole("button", { name: "書庫でやり直す" })
  await page.getByRole("list", { name: "書庫 の中身" }).getByRole("button", { name: "ボタンの試しの所" }).dblclick()
  const inside = page.getByRole("list", { name: "ボタンの試しの所 の中身" })
  await made("@matomezu/base:entry-rename", { entry: book, title: "ボタンの後の名前" })
  await expect(inside.getByRole("button", { name: "ボタンの後の名前" })).toBeVisible()
  await expect(redo).toHaveAttribute("aria-disabled", "true")
  await undo.click()
  await expect(inside.getByRole("button", { name: "ボタンの前の名前" })).toBeVisible()
  await redo.click()
  await expect(inside.getByRole("button", { name: "ボタンの後の名前" })).toBeVisible()
  // 押せなくなったボタンに焦点が残っていても、キーは効き続ける
  await expect(redo).toHaveAttribute("aria-disabled", "true")
  await page.keyboard.press("Control+z")
  await expect(inside.getByRole("button", { name: "ボタンの前の名前" })).toBeVisible()
  await redo.click()
  await expect(inside.getByRole("button", { name: "ボタンの後の名前" })).toBeVisible()
  await expect.poll(async () => (await storedBook(page.request, book))?.title).toBe("ボタンの後の名前")

  // フォルダを見せていない間に、AI が元の名前のブックを同じ所に作る。元に戻すと名前が重なるので断られる
  await page.getByRole("navigation", { name: "場所" }).getByRole("button", { name: "書庫" }).click()
  await made("@matomezu/base:book-create", { title: "ボタンの前の名前", into: folder })
  await undo.click()
  const toast = page.getByRole("alert").filter({ hasText: "元に戻せません" })
  await expect(toast).toContainText("ほかの変更とぶつかります")
  // ゴミ箱を開いている間も、同じボタンが出る
  await page.getByRole("navigation", { name: "フォルダ" }).getByRole("button", { name: "ゴミ箱", exact: true }).click()
  await expect(undo).toBeVisible()
})

test("書庫の「フォルダ新規作成」で開いているフォルダにフォルダを作り、F2 で名前を変え、Enter で中へ入り、矢印で選ぶ行を動かし、Delete でゴミ箱に入れる", async ({
  page,
}) => {
  await page.goto("/")
  await page.bringToFront()
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  const home = page.getByRole("list", { name: "書庫 の中身" })
  const name = page.getByRole("dialog").getByRole("textbox")
  await page.getByRole("button", { name: "フォルダ新規作成" }).click()
  await name.fill("キーの試しの所")
  await page.getByRole("dialog").getByRole("button", { name: "作成" }).click()
  const made = home.getByRole("button", { name: "キーの試しの所" })
  await expect(made).toBeVisible()
  // 同じ名前では作れず、訳が出る
  await page.getByRole("button", { name: "フォルダ新規作成" }).click()
  await name.fill("キーの試しの所")
  await page.getByRole("dialog").getByRole("button", { name: "作成" }).click()
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("同じ名前があります")
  await page.keyboard.press("Escape")

  // 選んで F2: 今の名前が入ったダイアログが出る
  await made.click()
  await page.keyboard.press("F2")
  await expect(name).toHaveValue("キーの試しの所")
  await name.fill("キーで変えた名前")
  await page.keyboard.press("Enter")
  const renamed = home.getByRole("button", { name: "キーで変えた名前" })
  await expect(renamed).toBeVisible()

  // Enter で中へ入る。「フォルダ新規作成」は、開いているフォルダに作る
  await renamed.click()
  await page.keyboard.press("Enter")
  const path = page.getByRole("navigation", { name: "場所" })
  await expect(path.getByRole("button")).toHaveText(["書庫", "キーで変えた名前"])
  const inside = page.getByRole("list", { name: "キーで変えた名前 の中身" })
  await page.getByRole("button", { name: "フォルダ新規作成" }).click()
  await name.fill("ブックの隣")
  await page.keyboard.press("Enter")
  await expect(inside.getByRole("button", { name: "ブックの隣" })).toBeVisible()

  // 矢印キーが右の枠とツリーに届く（動きの細かな所は library-commands.test.ts）
  await page.getByRole("button", { name: "フォルダ新規作成" }).click()
  await name.fill("ブックの隣 2")
  await page.keyboard.press("Enter")
  await inside.getByRole("button", { name: "ブックの隣", exact: true }).click()
  await page.keyboard.press("ArrowRight")
  await expect(inside.getByRole("button", { name: "ブックの隣 2" })).toHaveAttribute("aria-pressed", "true")
  await expect(inside.getByRole("button", { name: "ブックの隣 2" })).toBeFocused()
  // Tab で止まるのは、右の枠は選んでいる行、ツリーは今いる行だけ
  await expect(inside.locator("[data-library-row][tabindex='0']")).toHaveText(["ブックの隣 2"])
  await expect(
    page.getByRole("navigation", { name: "フォルダ" }).locator("[data-library-row][tabindex='0']"),
  ).toHaveText(["キーで変えた名前"])
  const tree = page.getByRole("navigation", { name: "フォルダ" })
  await tree.getByRole("button", { name: "キーで変えた名前", exact: true }).click()
  await page.keyboard.press("ArrowRight")
  await expect(tree.getByRole("button", { name: "ブックの隣", exact: true })).toBeVisible()

  // Delete でゴミ箱に入れ、Ctrl+Z で戻る
  await inside.getByRole("button", { name: "ブックの隣", exact: true }).click()
  await page.keyboard.press("Delete")
  await expect(inside.getByRole("button", { name: "ブックの隣", exact: true })).toHaveCount(0)
  await page.keyboard.press("Control+z")
  await expect(inside.getByRole("button", { name: "ブックの隣", exact: true })).toBeVisible()

  // 何も無い所を押すと、選んでいる行が外れ、Delete は何もしない
  await inside.getByRole("button", { name: "ブックの隣", exact: true }).click()
  await inside.click({ position: { x: 400, y: 300 } })
  await expect(inside.locator("[aria-pressed=true]")).toHaveCount(0)
  await page.keyboard.press("Delete")
  await expect(inside.locator("[data-library-row]")).toHaveCount(2)
})

test("書庫の右の枠の上下の矢印は、描いた段の真上・真下の行を選ぶ。窓の幅が変わると段の列の数を測り直す", async ({
  page,
}) => {
  await page.goto("/")
  await page.bringToFront()
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  const home = page.getByRole("list", { name: "書庫 の中身" })
  const rows = home.locator("[data-library-row]")
  // 最初の行の真下に描かれている行（同じ左の位置で、次の段）の名前
  const below = () =>
    home.evaluate(list => {
      const items = [...list.querySelectorAll<HTMLElement>("[data-library-row]")]
      const first = items[0]
      return items.find(i => i.offsetTop > (first?.offsetTop ?? 0) && i.offsetLeft === first?.offsetLeft)?.textContent
    })
  for (const width of [1280, 700]) {
    await page.setViewportSize({ width, height: 800 })
    const name = await below()
    expect(name).toBeTruthy()
    await rows.first().click()
    await page.keyboard.press("ArrowDown")
    await expect(home.locator("[aria-pressed=true]")).toHaveText(name as string)
    await page.keyboard.press("ArrowUp")
    await expect(rows.first()).toHaveAttribute("aria-pressed", "true")
  }
})

test("書庫の行の右クリックのメニューから、名前の変更・ゴミ箱に入れる・開く・中に作る、ができる。ブックの中のページは開く・名前の変更・複製。何も無い所では、作るだけ。Escape で閉じる", async ({
  page,
}) => {
  await page.goto("/")
  await page.bringToFront()
  const made = async (action: string, args: object) => {
    const done = await perform(page, action, args)
    expect(done).toMatchObject({ ok: true })
    return done.result as { folder: string; book: string }
  }
  const folder = (await made("@matomezu/base:folder-create", { title: "メニューの試しの所" })).folder
  await made("@matomezu/base:book-create", { title: "メニューの試しのブック", into: folder })
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  const home = page.getByRole("list", { name: "書庫 の中身" })
  const menu = page.getByRole("menu")
  // フォルダの行: 中に作る・名前の変更・ゴミ箱（開くは無い）
  await home.getByRole("button", { name: "メニューの試しの所" }).click({ button: "right" })
  await expect(menu.getByRole("menuitem")).toHaveText([
    "新しいブック…",
    "新しいフォルダ…",
    "名前の変更…F2",
    "ゴミ箱に入れるDelete",
  ])
  // Escape で閉じる
  await page.keyboard.press("Escape")
  await expect(menu).toHaveCount(0)
  // 中にフォルダを作る
  await home.getByRole("button", { name: "メニューの試しの所" }).click({ button: "right" })
  await menu.getByRole("menuitem", { name: "新しいフォルダ…" }).click()
  await page.getByRole("dialog").getByRole("textbox").fill("メニューで作った所")
  await page.keyboard.press("Enter")
  await home.getByRole("button", { name: "メニューの試しの所" }).dblclick()
  const inside = page.getByRole("list", { name: "メニューの試しの所 の中身" })
  await expect(inside.getByRole("button", { name: "メニューで作った所" })).toBeVisible()
  // ブックの行: 開く・名前の変更・ゴミ箱。名前を変える
  await inside.getByRole("button", { name: "メニューの試しのブック" }).click({ button: "right" })
  await expect(menu.getByRole("menuitem")).toHaveText(["開くEnter", "名前の変更…F2", "ゴミ箱に入れるDelete"])
  await menu.getByRole("menuitem", { name: "名前の変更…" }).click()
  await page.getByRole("dialog").getByRole("textbox").fill("メニューで変えた名前")
  await page.keyboard.press("Enter")
  await expect(inside.getByRole("button", { name: "メニューで変えた名前" })).toBeVisible()
  // 何も無い所: 作るだけ
  await inside.click({ button: "right", position: { x: 400, y: 300 } })
  await expect(menu.getByRole("menuitem")).toHaveText(["新しいブック…", "新しいフォルダ…"])
  await page.keyboard.press("Escape")
  // ツリーの行からも同じメニュー。ゴミ箱に入れる
  const tree = page.getByRole("navigation", { name: "フォルダ" })
  await tree.getByRole("button", { name: "メニューの試しの所 の中を出す" }).click()
  await tree.getByRole("button", { name: "メニューで作った所", exact: true }).click({ button: "right" })
  await menu.getByRole("menuitem", { name: "ゴミ箱に入れる" }).click()
  await expect(tree.getByRole("button", { name: "メニューで作った所", exact: true })).toHaveCount(0)
  // ブックの中のページは、開く・名前の変更・複製（ページの在るブックで確かめる）
  const books = (await storedBooks(page.request)) as { id: string; title: string }[]
  const first = books[0]!
  await tree.getByRole("button", { name: `${first.title} の中を出す` }).click()
  const pageRow = tree.getByRole("button", { name: "ページ 1", exact: true }).first()
  await pageRow.click({ button: "right" })
  await expect(menu.getByRole("menuitem")).toHaveText(["開くEnter", "名前の変更…F2", "複製"])
  await menu.getByRole("menuitem", { name: "開く" }).click()
  await expect.poll(() => urlCurrentScreen(page)).toBe(BOOK_SCREEN_DEF)
})

test("書庫の行をドラッグして、行の間（その位置へ）・フォルダの上（中へ）・ゴミ箱の行へ落とせる。名前が重なれば確かめる。少し動かしただけ・落としたあとの click は、選ぶ・開く操作にならない", async ({
  page,
}) => {
  await page.goto("/")
  await page.bringToFront()
  const made = async (title: string, into?: string) => {
    const done = await perform(page, "@matomezu/base:folder-create", { title, into })
    expect(done).toMatchObject({ ok: true })
    return (done.result as { folder: string }).folder
  }
  const box = await made("ドラッグの箱")
  await made("ドラッグ ア")
  await made("ドラッグ イ")
  await made("ドラッグ ア", box)
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  const home = page.getByRole("list", { name: "書庫 の中身" })
  const tree = page.getByRole("navigation", { name: "フォルダ" })
  const icon = (name: string) => home.getByRole("button", { name, exact: true })
  const names = async () => (await home.getByRole("button").allInnerTexts()).filter(n => n.startsWith("ドラッグ"))
  // 行 from を掴んで、行 to の、幅（高さ）の at の所へ落とす
  const dragTo = async (from: Locator, to: Locator, at: { x: number; y: number }) => {
    await from.hover() // 開く動きが止まるまで待つ
    const a = (await from.boundingBox())!
    const b = (await to.boundingBox())!
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
    await page.mouse.down()
    await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 2 })
    await page.mouse.move(b.x + b.width * at.x, b.y + b.height * at.y, { steps: 4 })
  }
  expect(await names()).toEqual(["ドラッグの箱", "ドラッグ ア", "ドラッグ イ"])

  // 少し動かしただけでは掴まない（選ぶだけ）。2 回押しで中へ入るのも、そのまま
  await icon("ドラッグ イ").hover()
  const first = (await icon("ドラッグ イ").boundingBox())!
  await page.mouse.move(first.x + 20, first.y + 20)
  await page.mouse.down()
  await page.mouse.move(first.x + 22, first.y + 21)
  await page.mouse.up()
  await expect(icon("ドラッグ イ")).toHaveAttribute("aria-pressed", "true")
  expect(await names()).toEqual(["ドラッグの箱", "ドラッグ ア", "ドラッグ イ"])

  // アイコンの間へ: イ を、箱の前へ。掴んだ行は薄くなり、落とす所に線が出る
  await dragTo(icon("ドラッグ イ"), icon("ドラッグの箱"), { x: 0.1, y: 0.5 })
  await expect(icon("ドラッグ イ")).toHaveAttribute("data-dragging", "true")
  await expect(icon("ドラッグの箱")).toHaveAttribute("data-drop", "before")
  await page.mouse.up()
  expect(await names()).toEqual(["ドラッグ イ", "ドラッグの箱", "ドラッグ ア"])
  // 落としたあとの click で、落とした先の行を選んだり開いたりしない（選んでいた イ のまま）
  await expect(icon("ドラッグ イ")).toHaveAttribute("aria-pressed", "true")
  await expect(icon("ドラッグの箱")).toHaveAttribute("aria-pressed", "false")

  // 落とせない所（自分の上・同じ場所）では、色も線も出ず、離しても何も変わらない
  await dragTo(icon("ドラッグ イ"), icon("ドラッグの箱"), { x: 0.1, y: 0.5 })
  await expect(home.locator("[data-drop]")).toHaveCount(0)
  await page.mouse.up()
  expect(await names()).toEqual(["ドラッグ イ", "ドラッグの箱", "ドラッグ ア"])

  // Escape で取り消す
  await dragTo(icon("ドラッグ ア"), icon("ドラッグ イ"), { x: 0.1, y: 0.5 })
  await expect(icon("ドラッグ イ")).toHaveAttribute("data-drop", "before")
  await page.keyboard.press("Escape")
  await expect(home.locator("[data-drop], [data-dragging]")).toHaveCount(0)
  await page.mouse.up()
  expect(await names()).toEqual(["ドラッグ イ", "ドラッグの箱", "ドラッグ ア"])

  // フォルダの上（中へ）: イ を箱の中へ。行に色が付く
  await dragTo(icon("ドラッグ イ"), icon("ドラッグの箱"), { x: 0.5, y: 0.5 })
  await expect(icon("ドラッグの箱")).toHaveAttribute("data-drop", "into")
  await page.mouse.up()
  expect(await names()).toEqual(["ドラッグの箱", "ドラッグ ア"])

  // 名前が重なる: ア を、ツリーの箱の行へ（中に ア が在る）。番号を付けて入る
  await dragTo(icon("ドラッグ ア"), tree.getByRole("button", { name: "ドラッグの箱", exact: true }), { x: 0.5, y: 0.5 })
  await page.mouse.up()
  const asked = page.getByRole("alertdialog").or(page.getByRole("dialog"))
  await expect(asked).toContainText("同じ名前があります")
  await expect(asked).toContainText("ドラッグ ア 2")
  await asked.getByRole("button", { name: "番号を付ける" }).click()
  expect(await names()).toEqual(["ドラッグの箱"])

  // ツリーの、中をしまっている行の上で少し待つと、中が出る。その中の行の間へ落とす（ア 2 を、イ の前へ）
  await icon("ドラッグの箱").dblclick()
  const inside = page.getByRole("list", { name: "ドラッグの箱 の中身" })
  await expect(inside.getByRole("button")).toHaveText(["ドラッグ ア", "ドラッグ イ", "ドラッグ ア 2"])
  await dragTo(
    inside.getByRole("button", { name: "ドラッグ ア 2" }),
    tree.getByRole("button", { name: "ドラッグの箱", exact: true }),
    { x: 0.5, y: 0.5 },
  )
  const row = tree.getByRole("button", { name: "ドラッグ イ", exact: true })
  await expect(row).toBeVisible()
  const at = (await row.boundingBox())!
  await page.mouse.move(at.x + at.width / 2, at.y + 2, { steps: 3 })
  await expect(row).toHaveAttribute("data-drop", "before")
  await page.mouse.up()
  await expect(inside.getByRole("button")).toHaveText(["ドラッグ ア", "ドラッグ ア 2", "ドラッグ イ"])

  // ゴミ箱の行へ落とすと、ゴミ箱に入る。Ctrl+Z で戻る
  await dragTo(inside.getByRole("button", { name: "ドラッグ イ" }), tree.getByRole("button", { name: "ゴミ箱" }), {
    x: 0.5,
    y: 0.5,
  })
  await expect(tree.getByRole("button", { name: "ゴミ箱" })).toHaveAttribute("data-drop", "into")
  await page.mouse.up()
  await expect(inside.getByRole("button")).toHaveText(["ドラッグ ア", "ドラッグ ア 2"])
  await inside.getByRole("button", { name: "ドラッグ ア", exact: true }).click()
  await page.keyboard.press("Control+z")
  await expect(inside.getByRole("button")).toHaveText(["ドラッグ ア", "ドラッグ ア 2", "ドラッグ イ"])

  // 書庫ホームで何も選ばずに、ゴミ箱の行へ落としても入る
  await page.getByRole("navigation", { name: "場所" }).getByRole("button", { name: "書庫" }).click()
  await expect(home.locator('[aria-pressed="true"]')).toHaveCount(0)
  await dragTo(icon("ドラッグの箱"), tree.getByRole("button", { name: "ゴミ箱" }), { x: 0.5, y: 0.5 })
  await page.mouse.up()
  await expect(icon("ドラッグの箱")).toHaveCount(0)
})

test("書庫のツリーで、ブックの中のページの名前を F2 で変え、右クリックの「複製」で写し、ドラッグでブックの中の行の間とほかのブックの行の上へ動かせる", async ({
  page,
}) => {
  await page.goto("/")
  await page.bringToFront()
  const made = async (action: string, args: object) => {
    const done = await perform(page, action, args)
    expect(done).toMatchObject({ ok: true })
    return done.result as { folder: string; book: string; page: { page: string } }
  }
  const drawing = { type: "@matomezu/drawing:drawing" }
  const folder = (await made("@matomezu/base:folder-create", { title: "中のページの所" })).folder
  const a = (
    await made("@matomezu/base:book-create", { title: "中のページ甲", into: folder, page: { ...drawing, title: "甲" } })
  ).book
  await made("@matomezu/base:page-create", { folder: a, ...drawing, title: "乙" })
  const b = (
    await made("@matomezu/base:book-create", { title: "中のページ乙", into: folder, page: { ...drawing, title: "丙" } })
  ).book
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  const tree = page.getByRole("navigation", { name: "フォルダ" })
  const row = (name: string) => tree.getByRole("button", { name, exact: true })
  const titlesIn = async (book: string) =>
    ((await storedBook(page.request, book)) as { lineup: { title: string }[] }).lineup.map(e => e.title)
  await tree.getByRole("button", { name: "中のページの所 の中を出す" }).click()
  await tree.getByRole("button", { name: "中のページ甲 の中を出す" }).click()
  await tree.getByRole("button", { name: "中のページ乙 の中を出す" }).click()

  // F2 で名前を変える
  await row("甲").click()
  await page.keyboard.press("F2")
  await page.getByRole("dialog").getByRole("textbox").fill("甲 改")
  await page.keyboard.press("Enter")
  await expect(row("甲 改")).toBeVisible()

  // 右クリックの「複製」: すぐ後ろに番号付きの名前で写す
  await row("乙").click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "複製" }).click()
  await expect(row("乙 2")).toBeVisible()
  await expect.poll(() => titlesIn(a)).toEqual(["甲 改", "乙", "乙 2"])

  // 行 from を掴んで、行 to の高さの at の所へ落とす
  const dragTo = async (from: Locator, to: Locator, at: number) => {
    await from.hover()
    const p = (await from.boundingBox())!
    const q = (await to.boundingBox())!
    await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2)
    await page.mouse.down()
    await page.mouse.move(p.x + p.width / 2 + 10, p.y + p.height / 2 + 10, { steps: 2 })
    await page.mouse.move(q.x + q.width / 2, q.y + q.height * at, { steps: 4 })
  }
  // ブックの中の行の間: 乙 2 を 甲 改 の前へ
  await dragTo(row("乙 2"), row("甲 改"), 0.1)
  await expect(row("甲 改")).toHaveAttribute("data-drop", "before")
  await page.mouse.up()
  await expect.poll(() => titlesIn(a)).toEqual(["乙 2", "甲 改", "乙"])
  // ほかのブックの行の上（中へ）: 乙 を 中のページ乙 の末尾へ
  await dragTo(row("乙"), row("中のページ乙"), 0.5)
  await expect(row("中のページ乙")).toHaveAttribute("data-drop", "into")
  await page.mouse.up()
  await expect.poll(() => titlesIn(b)).toEqual(["丙", "乙"])
  await expect.poll(() => titlesIn(a)).toEqual(["乙 2", "甲 改"])
  // ブックの中の行は、ブックの外（フォルダの行の上）へは落とせない
  await dragTo(row("丙"), row("中のページの所"), 0.5)
  await expect(tree.locator("[data-drop]")).toHaveCount(0)
  await page.mouse.up()
  await expect.poll(() => titlesIn(b)).toEqual(["丙", "乙"])
})

test("書庫の検索は、名前に言葉を含む物を右の枠に並べる。行を押すとツリーのその行へ移り、Enter で開く。入力Formを空にすると元の表示に戻る", async ({
  page,
}) => {
  await page.goto("/")
  await page.bringToFront()
  const made = await perform(page, "@matomezu/base:folder-create", { title: "検索の試しの所" })
  const folder = (made.result as { folder: string }).folder
  expect(await perform(page, "@matomezu/base:book-create", { title: "検索の試しの帳面", into: folder })).toMatchObject({
    ok: true,
  })
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  const field = page.getByRole("textbox", { name: "名前で検索" })
  const found = page.getByRole("list", { name: "見つかった物" })
  await field.fill("検索の試し")
  await page.keyboard.press("Enter")
  await expect(page.getByRole("status")).toHaveText("「検索の試し」を含む名前: 2 件")
  await expect(found.getByRole("button")).toHaveText([/検索の試しの所/, /検索の試しの帳面.*検索の試しの所/])
  // 行を押すと、ツリーのその行が出て、今いる行になる
  await found.getByRole("button", { name: /検索の試しの帳面/ }).click()
  const tree = page.getByRole("navigation", { name: "フォルダ" })
  await expect(tree.getByRole("button", { name: "検索の試しの帳面", exact: true })).toHaveAttribute(
    "aria-current",
    "true",
  )
  await expect(found.getByRole("button", { name: /検索の試しの帳面/ })).toHaveAttribute("aria-pressed", "true")
  // 見つからない言葉
  await field.fill("どこにも無い名前")
  await page.getByRole("button", { name: "検索", exact: true }).click()
  await expect(page.getByRole("status")).toHaveText("「どこにも無い名前」を含む名前はありません")
  // 入力Formを空にすると、元の表示（開いているフォルダの中身）に戻る
  await field.fill("")
  await expect(found).toHaveCount(0)
  await expect(page.getByRole("navigation", { name: "場所" }).getByRole("button")).toHaveText([
    "書庫",
    "検索の試しの所",
    "検索の試しの帳面",
  ])
  // 選んだ行の Enter で開く（2 回押すのと同じ）
  await field.fill("検索の試しの帳面")
  await page.keyboard.press("Enter")
  await found.getByRole("button", { name: /検索の試しの帳面/ }).click()
  await page.keyboard.press("Enter")
  await expect.poll(() => urlCurrentScreen(page)).toBe(BOOK_SCREEN_DEF)
})

test("書庫の検索の結果を押すと、ツリーがはみ出していても、その行が見える所までツリーを送る", async ({ page }) => {
  await page.goto("/")
  await page.bringToFront()
  // ツリーの高さを超える数のフォルダを作り、最後のフォルダの中にブックを置く
  let last = ""
  for (let i = 0; i < 40; i++) {
    const made = await perform(page, "@matomezu/base:folder-create", { title: `送りの試し ${i}` })
    last = (made.result as { folder: string }).folder
  }
  await perform(page, "@matomezu/base:book-create", { title: "一番下の帳面", into: last })
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  const tree = page.getByRole("navigation", { name: "フォルダ" })
  const row = tree.getByRole("button", { name: "一番下の帳面", exact: true })
  await page.getByRole("textbox", { name: "名前で検索" }).fill("一番下の帳面")
  await page.keyboard.press("Enter")
  await page
    .getByRole("list", { name: "見つかった物" })
    .getByRole("button", { name: /一番下の帳面/ })
    .click()
  await expect(row).toHaveAttribute("aria-current", "true")
  await expect(row).toBeInViewport()
})

test.describe("ブックごと読めないブック", () => {
  // 並びが並びの形でない（W005）ブック。書庫の表に行が無く、名前は読めない訳に残る
  test.use({ books: [{ id: "broken-1", title: "壊れたブック", lineup: "no" }] })

  test("書庫の右の枠とツリーに、読めない訳に残った名前と「読めません」が出る", async ({ page }) => {
    await page.goto("/")
    await page.bringToFront()
    await page.getByRole("button", { name: "書庫", exact: true }).first().click()
    const row = page.getByRole("list", { name: "書庫 の中身" }).getByRole("button", { name: /壊れたブック/ })
    await expect(row).toContainText("読めません")
    await expect(
      page.getByRole("navigation", { name: "フォルダ" }).getByRole("button", { name: /壊れたブック/ }),
    ).toBeVisible()
  })
})

test.describe("読めないページ", () => {
  // 今の機能台帳に無いタイプのページ（外したプラグインのページのつもり）
  const gone = {
    kind: "page",
    id: "gone-1",
    type: "@gone/plugin:sheet",
    title: "外したタイプ",
    paper: "@matomezu/base:a4",
    orientation: "landscape",
  }
  const mixed = testBook("mixed", "混ざったブック", [drawingPage("mixed-p1")])
  test.use({ books: [{ ...mixed, lineup: [...mixed.lineup, gone] }] })

  test("書庫で読めないページの行を Enter で開くと、ブックの窓が開き、読めないことを見せる", async ({ page }) => {
    await page.goto("/")
    await page.bringToFront()
    await page.getByRole("button", { name: "書庫", exact: true }).first().click()
    await page
      .getByRole("navigation", { name: "フォルダ" })
      .getByRole("button", { name: "混ざったブック", exact: true })
      .click()
    const row = page.getByRole("list", { name: "混ざったブック の中身" }).getByRole("button", { name: /外したタイプ/ })
    await expect(row).toContainText("読めません")
    await row.click()
    await page.keyboard.press("Enter")
    await expect.poll(() => urlCurrentScreen(page)).toBe(BOOK_SCREEN_DEF)
    await expect(page.locator("[data-unreadable-page]")).toContainText("このページは読めません")
  })
})
