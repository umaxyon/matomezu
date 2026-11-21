// ブックの外のページ（書庫ホームに直に置いたページ）を、ステージで開く
import { BOOK_SCREEN_DEF, BOOK_SCREEN_URL, expect, stagesUrl, test, urlCurrentScreen, urlStages } from "./fixtures"
import { aiPerform } from "./helpers/ai"
import { writeNote } from "./helpers/note"
import { leftPanel, openOutbox } from "./helpers/outbox"
import { addBox, items } from "./helpers/paper"
import { fromMenu } from "./helpers/stage-menu"

const OUTSIDE = {
  kind: "page",
  id: "o1",
  type: "@matomezu/drawing:drawing",
  title: "ブックの外のページ",
  paper: "@matomezu/base:a4",
  orientation: "landscape",
}

test.use({ outsidePages: [OUTSIDE] })

test("ブックを名指さずページを名指す場所の URL は、ブックの外のページを開く", async ({ page }) => {
  await page.goto(stagesUrl([{ book: null, page: "o1" }]))
  await expect(page.getByRole("img", { name: "紙" })).toHaveCount(1)
  // 下の行の名前は、そのページの名前。ページタブは出ない
  const name = page.getByRole("button", { name: "ブックの外のページ" })
  await expect(name).toBeVisible()
  await expect(page.getByRole("tab")).toHaveCount(0)
})

test("書庫の画面でブックの外のページを 2 回押すと、新しいブックスクリーンで開く", async ({ page }) => {
  await page.goto("/")
  await page.bringToFront()
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  await page.getByRole("list", { name: "書庫 の中身" }).getByRole("button", { name: "ブックの外のページ" }).dblclick()
  await expect.poll(() => urlCurrentScreen(page)).toBe(BOOK_SCREEN_DEF)
  await expect.poll(() => urlStages(page).map(s => [s.b, s.p])).toEqual([[null, "o1"]])
  await expect(page.getByRole("img", { name: "紙" })).toHaveCount(1)
})

test("「画面を分割」で下に出た書庫のスクリーンでブックの外のページを 2 回押すと、右の空のステージに開き、書庫のスクリーンは引っ込む", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await page.bringToFront()
  await (await fromMenu(page, "画面を分割")).click()
  const library = page.getByRole("list", { name: "書庫 の中身" })
  await library.getByRole("button", { name: "ブックの外のページ" }).dblclick()
  await expect(library).toHaveCount(0)
  await expect.poll(() => urlStages(page).map(s => s.p)).toHaveLength(2)
  expect(urlStages(page)[1]).toMatchObject({ b: null, p: "o1" })
  await expect(page.getByRole("button", { name: "ブックの外のページ" })).toBeVisible()
})

test("ブックの外のページを開いたステージの下の行は、名前の右に置き場所を出す。押すと、ステージは開いたまま、書庫がそのフォルダを開いて出る", async ({
  page,
}) => {
  await page.goto(stagesUrl([{ book: null, page: "o1" }]))
  await page.bringToFront()
  // 書庫ホームに直に在れば、書庫
  await expect(page.getByRole("button", { name: "置き場所: 書庫" })).toBeVisible()
  const outer = await aiPerform(page, { action: "@matomezu/base:folder-create", args: { title: "企画" } })
  const inner = await aiPerform(page, {
    action: "@matomezu/base:folder-create",
    args: { title: "2026-11-21", into: outer.result.folder },
  })
  expect(
    await aiPerform(page, { action: "@matomezu/base:entry-move", args: { entry: "o1", into: inner.result.folder } }),
  ).toMatchObject({ ok: true })
  // フォルダの中なら、書庫ホームの下から
  const place = page.getByRole("button", { name: "置き場所: 企画 › 2026-11-21" })
  await expect(place).toBeVisible()
  await place.click()
  await expect(page.getByRole("navigation", { name: "場所" }).getByRole("button")).toHaveText([
    "書庫",
    "企画",
    "2026-11-21",
  ])
  await expect(page.getByRole("list", { name: "2026-11-21 の中身" }).getByRole("button")).toHaveText([
    "ブックの外のページ",
  ])
  await expect(page.getByRole("list", { name: "2026-11-21 の中身" })).toBeVisible()
  await expect(page.getByRole("img", { name: "紙" })).toHaveCount(1)
})

test("ブックの外のページの物に付けた伝言とマークは、送信トレイに並び、マークは付けた物の名前を出す", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(stagesUrl([{ book: null, page: "o1" }]))
  await addBox(page, 200, 150, "一")
  await addBox(page, 500, 150, "二")
  await writeNote(page, items(page).filter({ hasText: "一" }), "一つ目を見て")
  await items(page).filter({ hasText: "二" }).click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに示す" }).click()
  await page.getByRole("group", { name: "マークを付ける" }).getByRole("button", { name: "インコ" }).click()
  await openOutbox(page)
  const rows = leftPanel(page).getByRole("listitem")
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText("二")
  await expect(rows.nth(1)).toContainText("一つ目を見て")
})

test.describe("ロック中のブックの外のページ", () => {
  test.use({ outsidePages: [{ ...OUTSIDE, locked: true }] })

  test("下の行の名前の左に、鍵の印が付く", async ({ page }) => {
    await page.goto(stagesUrl([{ book: null, page: "o1" }]))
    await expect(page.getByRole("button", { name: "ブックの外のページ" })).toBeVisible()
    await expect(page.getByRole("img", { name: "ロック中" })).toBeVisible()
  })
})

test.describe("マークダウンのブックの外のページ", () => {
  test.use({
    outsidePages: [
      { ...OUTSIDE, id: "m1", type: "@matomezu/markdown:markdown", title: "外のメモ", text: "# 猫の話\n\n猫が好き。" },
    ],
  })

  test("原文とプレビューが出て、検索はこのページだけ（ブック全体は選べない）", async ({ page }) => {
    await page.goto(stagesUrl([{ book: null, page: "m1" }]))
    await expect(page.getByRole("region", { name: "プレビュー" })).toContainText("猫の話")
    await page.getByRole("region", { name: "プレビュー" }).click()
    await page.keyboard.press("ControlOrMeta+f")
    const dialog = page.getByRole("dialog", { name: "検索ダイアログ" })
    await expect(dialog).toBeVisible()
    await page.keyboard.type("猫")
    await expect(dialog.locator("[data-search-count]")).toHaveText("1/2")
    await expect(dialog.getByRole("radio")).toHaveCount(1)
  })
})

test.describe("マークダウンのブックの外のページの置換", () => {
  test.use({
    outsidePages: [{ ...OUTSIDE, id: "m1", type: "@matomezu/markdown:markdown", title: "外のメモ", text: "猫と猫" }],
  })

  test("ソースに打て、全部置換と元に戻すが効く", async ({ page }) => {
    await page.goto(stagesUrl([{ book: null, page: "m1" }]))
    await page.getByRole("toolbar", { name: "ペイン" }).getByRole("button", { name: "左右に並べる" }).click()
    const source = page.getByRole("region", { name: "ソース" }).getByRole("textbox")
    await source.click()
    await page.keyboard.press("ControlOrMeta+End")
    await page.keyboard.insertText("と犬")
    await expect(page.getByRole("region", { name: "プレビュー" })).toContainText("猫と猫と犬")
    await page.keyboard.press("ControlOrMeta+Alt+f")
    const dialog = page.getByRole("dialog", { name: "検索ダイアログ" })
    await dialog.getByLabel("探す").fill("猫")
    await dialog.getByLabel("置換").fill("鳥")
    await dialog.getByRole("button", { name: "全部置換" }).click()
    await expect(page.getByRole("region", { name: "プレビュー" })).toContainText("鳥と鳥と犬")
    await page.keyboard.press("Escape")
    await page.getByRole("region", { name: "プレビュー" }).click()
    await page.keyboard.press("ControlOrMeta+z")
    await expect(page.getByRole("region", { name: "プレビュー" })).toContainText("猫と猫と犬")
  })
})

// 木と構成図は、ブックが無くても描く
test.describe("ツリーのブックの外のページ", () => {
  test.use({
    outsidePages: [
      {
        ...OUTSIDE,
        id: "t1",
        type: "@matomezu/tree:tree",
        title: "外のツリー",
        root: { id: "r", caption: "根", children: [] },
      },
    ],
  })

  test("木を描く", async ({ page }) => {
    await page.goto(stagesUrl([{ book: null, page: "t1" }]))
    await expect(page.locator('[data-root="true"]')).toHaveText("根")
  })
})

test.describe("ディレクトリ構成図のブックの外のページ", () => {
  test.use({
    outsidePages: [
      {
        ...OUTSIDE,
        id: "d1",
        type: "@matomezu/dir:dir",
        title: "外の構成図",
        root: { id: "r", kind: "folder", name: "proj", children: [{ id: "f", kind: "file", name: "main.ts" }] },
      },
    ],
  })

  test("構成図を描く", async ({ page }) => {
    await page.goto(stagesUrl([{ book: null, page: "d1" }]))
    await expect(page.getByText("main.ts")).toBeVisible()
  })
})
