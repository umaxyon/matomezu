import { drawingPage, testBook } from "../../test/lineup"
import { SAMPLE_BOOKS } from "../../test/sample-books"
import { pagesIn } from "../books"
import { BOOK_SCREEN_URL, bookScreenUrl, expect, joinedAiAuth, type Page, test, urlStages } from "../fixtures"
import { aiPerform } from "../helpers/ai"
import { addBox } from "../helpers/paper"
import { openGeneral } from "../helpers/settings"
import { storedBook, storedBooks, storedPageVersion } from "../helpers/stored"

// 常駐を空にして始め、テストごとに使うブックを置く
test.use({ books: [] })

// 図面のページ p1（A4 横）が 1 つのブック
const E2E_1 = { ...SAMPLE_BOOKS[0]!, id: "e2e-1" }

// 常駐に置いてあるもの
const data = async (page: Page) => (await page.request.get("/api/data")).json()
// 置いてあるブック id のデータ（無ければ undefined）
const bookIn = async (page: Page, id: string): Promise<{ id: string } | undefined> => storedBook(page.request, id)
// ブックを常駐に置く（テストの用意の口）
const put = async <B extends { id: string }>(page: Page, book: B) =>
  expect((await page.request.put(`/api/books-for-test/${book.id}`, { data: { book, base: 0 } })).ok()).toBe(true)

test("初めて開くと、ブックを持たず、何も開かない", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  await expect(page.getByRole("region", { name: "ステージ" })).toBeVisible()
  await expect(page.getByRole("img", { name: "紙" })).toHaveCount(0)
  await expect(page.getByRole("tablist")).toHaveCount(0)
  expect(await storedBooks(page.request)).toEqual([])
})

test("設定画面で変えた設定は常駐に残り、読み直しても同じ", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  await (await openGeneral(page)).getByLabel("スキン").selectOption("@matomezu/base:dark")
  await expect.poll(async () => (await data(page)).settings?.["@matomezu/base:skin"]).toBe("@matomezu/base:dark")
  await page.reload()
  await expect((await openGeneral(page)).getByLabel("スキン")).toHaveValue("@matomezu/base:dark")
})

test("置いた箱は少し待って常駐に残り、読み直しても同じ所にある", async ({ page }) => {
  const book = E2E_1
  await put(page, book)
  await page.goto(BOOK_SCREEN_URL)
  await addBox(page, 200, 150, "残る箱")
  await expect.poll(() => storedPageVersion(page.request, pagesIn<{ id: string }>(book)[0]!.id)).toBe(2)
  const before = (await page.locator("[data-item]").boundingBox())!
  await page.reload()
  const item = page.locator("[data-item]")
  await expect(item).toHaveText("残る箱")
  expect(await item.boundingBox()).toEqual(before)
})

test("1 つの窓で置いた箱は、同じブックを開いているほかの窓にもすぐ出る。ほかの窓で動かすと、元の窓でも動く", async ({
  newPage,
}) => {
  // 箱が 1 つのブック e2e-1 を、どちらの窓も最初に開く
  const a = await newPage()
  const b = await newPage()
  const box = {
    id: "k1",
    x: 40,
    y: 40,
    item: "@matomezu/box:shape-nest-box",
    w: 100,
    h: 64,
    props: { caption: "残る箱" },
  }
  await put(a, { ...E2E_1, lineup: [{ ...pagesIn(E2E_1)[0]!, items: [box] }] })
  for (const page of [a, b]) {
    await page.goto(BOOK_SCREEN_URL)
    await expect(page.getByRole("tablist")).toHaveAttribute("aria-label", E2E_1.title)
    await expect(page.locator("[data-item]")).toHaveCount(1)
  }
  await addBox(a, 500, 300, "共有の箱")
  const shared = (page: typeof a) => page.locator("[data-item]", { hasText: "共有の箱" })
  await expect(shared(b)).toBeVisible()
  const before = (await shared(a).boundingBox())!
  const at = (await shared(b).boundingBox())!
  await b.mouse.move(at.x + 20, at.y + 20)
  await b.mouse.down()
  await b.mouse.move(at.x + 80, at.y + 60, { steps: 4 })
  await b.mouse.up()
  await expect.poll(async () => (await shared(a).boundingBox())!.x).toBeGreaterThan(before.x + 40)
  // 開いた窓を閉じる（残すと、同じワーカーのあとのテストで AI の view と show がこの窓を選ぶ）
  await a.close()
  await b.close()
})

test("AI の入口からは、最後にフォーカスした窓が見ているものが分かり、AI が置いた箱はすぐ窓に出る", async ({ page }) => {
  const ai = await joinedAiAuth()
  await put(page, E2E_1)
  await page.goto(BOOK_SCREEN_URL)
  await page.bringToFront()
  await expect(page.getByRole("img", { name: "紙" })).toBeVisible()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toMatchObject({ entry: { kind: "book", id: "e2e-1" }, page: "p1" })
  const done = await page.request.post("/api/ai/perform", {
    headers: ai,
    data: {
      action: "@matomezu/paper:item-place",
      args: { item: "@matomezu/box:shape-nest-box", at: { x: 40, y: 400 }, props: { caption: "AI の箱" } },
      on: { page: "p1" },
    },
  })
  expect(await done.json()).toMatchObject({ ok: true })
  await expect(page.locator("[data-item]", { hasText: "AI の箱" })).toBeVisible()
})

test("AI が show で頼むと、最後にフォーカスした窓が、分けたステージでそのブックを開く", async ({ page }) => {
  const ai = await joinedAiAuth()
  await put(page, E2E_1)
  await page.goto(BOOK_SCREEN_URL)
  await page.bringToFront()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toMatchObject({
      entry: { kind: "book", id: "e2e-1" },
      canSplit: true,
    })
  const made = await page.request.post("/api/ai/perform", {
    headers: ai,
    data: {
      action: "@matomezu/base:book-create",
      args: { title: "AI のブック" },
    },
  })
  const { result } = await made.json()
  const shown = await page.request.post("/api/ai/show", { headers: ai, data: { book: result.book, split: true } })
  expect(await shown.json()).toEqual({ ok: true, opened: false })
  await expect(page.locator("[data-stage]")).toHaveCount(2)
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toMatchObject({ entry: { kind: "book", id: result.book }, stage: "s2", canSplit: false })
})

// 線のあるブック: 箱 a・b・c と、a から b（終点に矢印・キャプション）・a から c・b から c の線
const LINE_BOOK = testBook("e2e-line", "線", [
  drawingPage("e2e-line-p1", {
    items: [
      { id: "a", x: 100, y: 100, item: "@matomezu/box:shape-nest-box", w: 100, h: 64, props: { caption: "A" } },
      { id: "b", x: 400, y: 100, item: "@matomezu/box:shape-nest-box", w: 100, h: 64, props: { caption: "B" } },
      { id: "c", x: 100, y: 400, item: "@matomezu/box:shape-nest-box", w: 100, h: 64, props: { caption: "C" } },
      {
        id: "l1",
        item: "@matomezu/line:connector-line",
        from: "a",
        to: "b",
        props: { endHead: "arrow", caption: "申請" },
      },
      { id: "l2", item: "@matomezu/line:connector-line", from: "a", to: "c", props: {} },
      { id: "l3", item: "@matomezu/line:connector-line", from: "b", to: "c", props: {} },
    ],
  }),
])

test("線は箱より手前に描かれ、選択の道具で押すと選ばれ、Delete と右クリックのメニューで消せる。箱を消すと、つながる線も消える", async ({
  page,
}) => {
  const ai = await joinedAiAuth()
  await put(page, E2E_1)
  await put(page, LINE_BOOK)
  await page.goto(BOOK_SCREEN_URL)
  await page.bringToFront()
  // 前のテストの窓ではなく、開いたばかりのこの窓に届くように、この窓にフォーカスを知らせる（すでに前にある窓は focus が起きない）
  await expect(page.locator("[data-stage]")).toHaveCount(1)
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toMatchObject({ entry: { kind: "book", id: "e2e-1" }, stage: "s1", canSplit: true })
  const shown = await page.request.post("/api/ai/show", { headers: ai, data: { book: LINE_BOOK.id } })
  expect(await shown.json()).toMatchObject({ ok: true })
  const line = (id: string) => page.locator(`[data-item="${id}"]`)
  await expect(line("l1")).toBeVisible()
  await expect(line("l1")).toContainText("申請")
  await expect(line("l1").locator("path")).toHaveCount(1) // 終点の矢印
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  const at = (x: number, y: number) => ({ x: paper.x + x, y: paper.y + y })
  // a の右の辺から b の左の辺へ、y = 132 の横の線。キャプションを避けた所を押す
  const p = at(230, 132)
  await page.mouse.click(p.x, p.y)
  await expect(line("l1")).toHaveAttribute("data-selected", "true")
  await expect(page.locator('[data-item="a"]')).toHaveAttribute("data-selected", "false")
  await page.keyboard.press("Delete")
  await expect(line("l1")).toHaveCount(0)
  // a の下の辺から c の上の辺へ、x = 150 の縦の線を右クリックして削除
  const q = at(150, 280)
  await page.mouse.click(q.x, q.y, { button: "right" })
  const menu = page.getByRole("menu")
  await expect(menu.getByRole("menuitem")).toHaveText(["設定", "削除Delete", "AIに伝言", "AIに示す"])
  await menu.getByRole("menuitem", { name: "削除" }).click()
  await expect(line("l2")).toHaveCount(0)
  // 箱 b を消すと、b から c の線も消える
  const b = at(450, 132)
  await page.mouse.click(b.x, b.y)
  await page.keyboard.press("Delete")
  await expect(line("l3")).toHaveCount(0)
  await expect
    .poll(async () => {
      const saved = await storedBook(page.request, LINE_BOOK.id)
      return saved ? pagesIn<{ items: { id: string }[] }>(saved)[0]!.items.map(i => i.id) : undefined
    })
    .toEqual(["a", "c"])
})

test("開いているブックとページは URL に入り、読み直しても同じものが開く（戻る・進むは host-client/location.test.ts）", async ({
  page,
}) => {
  const book = { ...SAMPLE_BOOKS[1]!, id: "e2e-url" }
  await put(page, book)
  await page.goto(bookScreenUrl(book.id, "p1"))
  await expect(page.getByRole("img", { name: "紙" })).toBeVisible()
  await page.reload()
  await expect(page.getByRole("img", { name: "紙" })).toBeVisible()
  expect(urlStages(page)[0]?.b).toBe(book.id)
})

test("ロック中のブックの名前とページタブに鍵が出る。鍵は押せず、ブックとページは設定のダイアログの見出しの鍵で外す（ロック中は項目を押せない）", async ({
  page,
}) => {
  // ブックと、その最初のページにロックを掛ける
  await put(page, {
    ...E2E_1,
    id: "e2e-locked",
    title: "鍵のブック",
    locked: true,
    lineup: [{ ...pagesIn(E2E_1)[0]!, locked: true }],
  })
  await page.goto(bookScreenUrl("e2e-locked"))
  await expect(page.getByRole("img", { name: "ロック中" })).toHaveCount(2)
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  await page.mouse.click(paper.x + 30, paper.y + 40, { button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "ブックの設定" }).click()
  const dialog = page.getByRole("dialog", { name: "ブックの設定" })
  // ロック中は項目を押せず、鍵を外す方にすると押せる
  await expect(dialog.getByRole("textbox", { name: "ブックの名前" })).toBeDisabled()
  await dialog.getByRole("button", { name: "ブックのロックを外す" }).click()
  await expect(dialog.getByRole("button", { name: "ブックをロックする" })).toBeVisible()
  await expect(dialog.getByRole("textbox", { name: "ブックの名前" })).toBeEnabled()
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(page.getByRole("img", { name: "ロック中" })).toHaveCount(1)
  // ページタブの鍵を押しても外れない（押すのはタブが受ける）
  const mark = (await page.getByRole("img", { name: "ロック中" }).boundingBox())!
  await page.mouse.click(mark.x + mark.width / 2, mark.y + mark.height / 2)
  await expect(page.getByRole("img", { name: "ロック中" })).toHaveCount(1)
  await page.mouse.click(paper.x + 30, paper.y + 40, { button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "ページの設定" }).click()
  const pageDialog = page.getByRole("dialog", { name: "ページの設定" })
  await pageDialog.getByRole("button", { name: "ページのロックを外す" }).click()
  await pageDialog.getByRole("button", { name: "確定" }).click()
  await expect(page.getByRole("img", { name: "ロック中" })).toHaveCount(0)
  await expect
    .poll(async () => {
      const b = await storedBook(page.request, "e2e-locked")
      return [b.locked, pagesIn<{ locked?: true }>(b)[0]?.locked]
    })
    .toEqual([undefined, undefined])
})

test("AI がマークダウンのページの原文を page-update で変えると、ソースとプレビューが変わる。ソースのペインで書き足した物は常駐に残り、読み直しても同じ", async ({
  page,
}) => {
  const ai = await joinedAiAuth()
  const perform = (data: { action: string; args: object; on?: object }) => aiPerform(page, data, ai)
  await page.goto(BOOK_SCREEN_URL)
  await page.bringToFront()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toHaveProperty("stage")
  const { result } = await perform({
    action: "@matomezu/base:book-create",
    args: { title: "AI のメモ" },
  })
  const on = { book: result.book }
  const added = await perform({
    action: "@matomezu/base:page-add",
    args: { type: "@matomezu/markdown:markdown", title: "1", fields: { text: "# 最初" } },
    on,
  })
  await page.request.post("/api/ai/show", { headers: ai, data: { book: result.book } })
  const preview = page.getByRole("region", { name: "プレビュー" })
  await expect(preview.getByRole("heading", { level: 1 })).toHaveText("最初")
  // 本文のあるページは、並べ方を選んでいないとプレビューだけで開くので、左右に並べる
  await page.getByRole("toolbar", { name: "ペイン" }).getByRole("button", { name: "左右に並べる" }).click()
  const updated = await perform({
    action: "@matomezu/base:page-update",
    args: { fields: { find: "最初", replace: "AI の見出し" } },
    on: { page: added.result.page },
  })
  expect(updated).toMatchObject({ ok: true })
  await expect(preview.getByRole("heading", { level: 1 })).toHaveText("AI の見出し")
  const field = () => page.getByRole("region", { name: "ソース" }).getByRole("textbox")
  await expect(field()).toHaveValue("# AI の見出し")
  await field().click()
  await page.keyboard.press("ControlOrMeta+End")
  await page.keyboard.type("\n\n本文")
  const textOf = async () => {
    const found = (await bookIn(page, result.book)) as { lineup: unknown[] } | undefined
    return found ? pagesIn<{ text?: string }>(found)[0]?.text : undefined
  }
  await expect.poll(textOf).toBe("# AI の見出し\n\n本文")
  await expect.poll(() => urlStages(page)[0]?.s).toBeTruthy()
  await page.reload()
  await expect(field()).toHaveValue("# AI の見出し\n\n本文")
  await expect(page.getByRole("region", { name: "プレビュー" }).getByText("本文")).toBeVisible()
})

test("伝言を書いている間に AI が付ける先の物を消すと、右サイドパネルは閉じずに知らせ、書きかけは残る（付ける先が無い間は付けられない）", async ({
  page,
}) => {
  const ai = await joinedAiAuth()
  const perform = (data: { action: string; args: object; on?: object }) => aiPerform(page, data, ai)
  await page.goto(BOOK_SCREEN_URL)
  await page.bringToFront()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toHaveProperty("stage")
  const { result } = await perform({
    action: "@matomezu/base:book-create",
    args: { title: "伝言の消える先" },
  })
  const on = { book: result.book }
  const added = await perform({
    action: "@matomezu/base:page-add",
    args: { type: "@matomezu/drawing:drawing", title: "1" },
    on,
  })
  const place = async (x: number, caption: string) =>
    (
      await perform({
        action: "@matomezu/paper:item-place",
        args: { item: "@matomezu/box:shape-nest-box", at: { x, y: 100 }, props: { caption } },
        on: { page: added.result.page },
      })
    ).result.item as string
  const one = await place(100, "一")
  const two = await place(400, "二")
  await page.request.post("/api/ai/show", { headers: ai, data: { book: result.book } })
  const panel = page.getByRole("complementary", { name: "右サイドパネル" })
  await page.locator(`[data-item="${one}"]`).click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに伝言" }).click()
  await page.keyboard.down("Control")
  await page.locator(`[data-item="${two}"]`).click()
  await page.keyboard.up("Control")
  const text = panel.getByLabel("伝言", { exact: true })
  await text.fill("書きかけ")
  const remove = (item: string) =>
    perform({ action: "@matomezu/paper:item-remove", args: { items: [item] }, on: { page: added.result.page } })
  expect(await remove(two)).toMatchObject({ ok: true })
  await expect(panel.getByRole("status")).toHaveText("付ける先の物が消されました")
  await expect(panel.getByRole("button", { name: "二", exact: true })).toHaveCount(0)
  expect(await remove(one)).toMatchObject({ ok: true })
  await expect(panel.getByRole("button", { name: "一", exact: true })).toHaveCount(0)
  await expect(panel.getByRole("button", { name: "付ける" })).toBeDisabled()
  // 右サイドパネルの中を押しても閉じない
  await text.click()
  await expect(text).toHaveValue("書きかけ")
  await expect(panel).toContainText("付ける先の物が消されました")
})

test("付けた伝言を右サイドパネルで開いて文を直している間は、AI が読んだと知らせても断られ（being-edited）、閉じると読める", async ({
  page,
}) => {
  const ai = await joinedAiAuth()
  const perform = (data: { action: string; args: object; on?: object }) => aiPerform(page, data, ai)
  await page.goto(BOOK_SCREEN_URL)
  await page.bringToFront()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toHaveProperty("stage")
  const { result } = await perform({
    action: "@matomezu/base:book-create",
    args: { title: "直している伝言" },
  })
  const on = { book: result.book }
  const added = await perform({
    action: "@matomezu/base:page-add",
    args: { type: "@matomezu/drawing:drawing", title: "1" },
    on,
  })
  const placed = await perform({
    action: "@matomezu/paper:item-place",
    args: { item: "@matomezu/box:shape-nest-box", at: { x: 100, y: 100 }, props: { caption: "一" } },
    on: { page: added.result.page },
  })
  const box = placed.result.item as string
  await page.request.post("/api/ai/show", { headers: ai, data: { book: result.book } })
  const panel = page.getByRole("complementary", { name: "右サイドパネル" })
  await page.locator(`[data-item="${box}"]`).click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに伝言" }).click()
  await panel.getByLabel("伝言", { exact: true }).fill("見てほしい")
  await panel.getByRole("button", { name: "付ける" }).click()
  await expect(panel).toHaveCount(0)
  const note = async () =>
    (
      (await (await page.request.get(`/api/ai/books/${result.book}`, { headers: ai })).json()).annotations as {
        id: string
      }[]
    )[0]?.id
  const id = await note()
  // 文を直した伝言の編集ロックが常駐に届くのを待つ
  const locked = page.waitForResponse(
    r =>
      r.url().endsWith("/api/view") &&
      (r.request().postData() ?? "").includes(`"editLocks":{"${added.result.page}":["${id}"]}`),
  )
  await page.getByRole("button", { name: "伝言を開く" }).click()
  await expect(panel.getByLabel("伝言", { exact: true })).toHaveValue("見てほしい")
  await panel.getByLabel("伝言", { exact: true }).fill("見てほしい所")
  await locked
  const read = () =>
    perform({ action: "@matomezu/base:note-read", args: { note: id }, on: { page: added.result.page } })
  expect(await read()).toMatchObject({ ok: false, reason: "being-edited" })
  await page.keyboard.press("Escape")
  await expect(panel).toHaveCount(0)
  await expect.poll(async () => (await read()).ok).toBe(true)
  // 読んだ伝言は既読になって残る
  expect(await note()).toBe(id)
})

test("箱の編集のダイアログを開いている間は、AI がその箱を変えると断られ（being-edited）、閉じると変えられる。ほかの箱は変えられる", async ({
  page,
}) => {
  const ai = await joinedAiAuth()
  const perform = (data: { action: string; args: object; on?: object }) => aiPerform(page, data, ai)
  await page.goto(BOOK_SCREEN_URL)
  await page.bringToFront()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toHaveProperty("stage")
  const { result } = await perform({
    action: "@matomezu/base:book-create",
    args: { title: "直している箱" },
  })
  const on = { book: result.book }
  const added = await perform({
    action: "@matomezu/base:page-add",
    args: { type: "@matomezu/drawing:drawing", title: "1" },
    on,
  })
  const pageId = added.result.page as string
  const place = async (x: number, caption: string) =>
    (
      await perform({
        action: "@matomezu/paper:item-place",
        args: { item: "@matomezu/box:shape-nest-box", at: { x, y: 100 }, props: { caption } },
        on: { page: pageId },
      })
    ).result.item as string
  const one = await place(100, "一")
  const two = await place(400, "二")
  await page.request.post("/api/ai/show", { headers: ai, data: { book: result.book } })
  const locked = page.waitForResponse(
    r =>
      r.url().endsWith("/api/view") && (r.request().postData() ?? "").includes(`"editLocks":{"${pageId}":["${one}"]}`),
  )
  await page.locator(`[data-item="${one}"]`).dblclick()
  const dialog = page.getByRole("dialog", { name: "ボックスの編集" })
  await expect(dialog).toBeVisible()
  await locked
  const rename = (item: string, caption: string) =>
    perform({ action: "@matomezu/paper:item-update", args: { item, props: { caption } }, on: { page: pageId } })
  expect(await rename(one, "AI")).toMatchObject({ ok: false, reason: "being-edited" })
  expect(await rename(two, "AI")).toMatchObject({ ok: true })
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
  await expect.poll(async () => (await rename(one, "AI")).ok).toBe(true)
})
