// 書庫の画面（コントロールセンターの中）: 左のツリーと右の枠で書庫を見て、フォルダへ入り、ブックを 2 回押して開く
import { BOOK_SCREEN_DEF, expect, joinedAiAuth, type Page, test, urlFront, urlStages } from "./fixtures"
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

test("書庫の「フォルダ新規作成」で開いているフォルダにフォルダを作り、F2 で名前を変え、Enter で中へ入り、Delete でゴミ箱に入れる", async ({
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

  // Delete でゴミ箱に入れ、Ctrl+Z で戻る
  await inside.getByRole("button", { name: "ブックの隣" }).click()
  await page.keyboard.press("Delete")
  await expect(inside.getByRole("button", { name: "ブックの隣" })).toHaveCount(0)
  await page.keyboard.press("Control+z")
  await expect(inside.getByRole("button", { name: "ブックの隣" })).toBeVisible()
})
