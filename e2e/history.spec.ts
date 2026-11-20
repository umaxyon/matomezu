// 画面の履歴: 置いた箱を Ctrl+Z で元に戻し、Ctrl+Shift+Z でやり直す。フッタメニューの元に戻す・やり直すのボタンも同じで、押してもフッタメニューは下がらない。
// 画面に見えた AI の変更は、画面の履歴に時刻の位置で入り、新しい方から戻る
import { pageIn } from "./books"
import { BOOK_SCREEN_URL, expect, joinedAiAuth, type Page, test } from "./fixtures"
import { footerMenuTool } from "./helpers/footer-menu"
import { addFromTabs, newBook } from "./helpers/new-book"
import { addBox, items } from "./helpers/paper"

test("置いた箱を Ctrl+Z で元に戻すと消え、Ctrl+Shift+Z と Ctrl+Y でやり直すと戻る", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  await addBox(page, 200, 150, "戻す箱")
  await expect(items(page)).toHaveCount(1)
  await page.keyboard.press("Control+z")
  await expect(items(page)).toHaveCount(0)
  await page.keyboard.press("Control+Shift+z")
  await expect(items(page)).toHaveText("戻す箱")
  await page.keyboard.press("Control+z")
  await expect(items(page)).toHaveCount(0)
  await page.keyboard.press("Control+y")
  await expect(items(page)).toHaveText("戻す箱")
})

test("フッタメニューの元に戻す・やり直すのボタンで戻し、やり直せる。押してもフッタメニューは下がらず、続けて押せる", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await addBox(page, 200, 150, "1")
  await addBox(page, 200, 150, "2")
  await expect(items(page)).toHaveCount(2)
  await footerMenuTool(page, "箱")
  const undo = page.getByRole("button", { name: "元に戻す" })
  const redo = page.getByRole("button", { name: "やり直す" })
  await expect(redo).toBeDisabled()
  await undo.click()
  await expect(items(page)).toHaveCount(1)
  await undo.click()
  await expect(items(page)).toHaveCount(0)
  await expect(undo).toBeDisabled()
  await redo.click()
  await expect(items(page)).toHaveText("1")
})

test("ツリーで＋で足して書いた節は、1 回の Ctrl+Z で消える。あとで書き直したのは、書き直しだけが 1 つの画面の履歴の段", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  const add = await newBook(page, "木", "ツリー")
  await add.getByLabel("根のキャプション").fill("根")
  await add.getByRole("button", { name: "作る" }).click()
  const paper = page.getByRole("img", { name: "紙" })
  const child = paper.locator('[data-node]:not([data-root="true"])')
  await paper.getByRole("button", { name: "子を足す" }).click()
  await page.keyboard.type("子")
  await page.keyboard.press("Enter")
  await expect(child).toHaveText("子")
  // 書き直す
  await child.dblclick()
  await page.keyboard.press("Control+a")
  await page.keyboard.type("書き直した")
  await page.keyboard.press("Enter")
  await expect(child).toHaveText("書き直した")
  await page.keyboard.press("Control+z")
  await expect(child).toHaveText("子")
  await page.keyboard.press("Control+z")
  await expect(child).toHaveCount(0)
})

test("ページタブをドラッグして並べ替えられ、元に戻すで元の並びに、やり直すで動かした並びになる。タブの外で離すと動かさない", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await addFromTabs(page)
  const dialog = page.getByRole("dialog", { name: /^新しい/ })
  await page.keyboard.press("Enter")
  await expect(dialog).toBeHidden()
  const tabs = page.getByRole("tab")
  await expect(tabs).toHaveText(["ページ 1", "ページ 2"])
  const first = (await tabs.nth(0).boundingBox())!
  const second = (await tabs.nth(1).boundingBox())!
  const grab = { x: first.x + first.width / 2, y: first.y + first.height / 2 }
  // タブの外（紙の真ん中）で離すと動かさない
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  await page.mouse.move(grab.x + 20, grab.y)
  await page.mouse.move(400, 400)
  await page.mouse.up()
  await expect(tabs).toHaveText(["ページ 1", "ページ 2"])
  // 2 枚目の右へ落とす
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  await page.mouse.move(grab.x + 20, grab.y)
  await page.mouse.move(second.x + second.width - 4, grab.y)
  await page.mouse.up()
  await expect(tabs).toHaveText(["ページ 2", "ページ 1"])
  await page.keyboard.press("Control+z")
  await expect(tabs).toHaveText(["ページ 1", "ページ 2"])
  await page.keyboard.press("Control+Shift+z")
  await expect(tabs).toHaveText(["ページ 2", "ページ 1"])
})

// 窓をカレントスクリーンにし、AI が見る今のブックとページ（AI の口で読む）
async function aiReady(page: Page) {
  const ai = await joinedAiAuth()
  await page.goto(BOOK_SCREEN_URL)
  await page.bringToFront()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toHaveProperty("stage")
  const { book, page: shown } = (await (await page.request.get("/api/ai/view", { headers: ai })).json()) as {
    book: string
    page: string
  }
  // AI が箱の名前を書き換える（箱は、ページに最初に置いた物）
  const rename = async (caption: string) => {
    const read = (await (await page.request.get(`/api/ai/books/${book}`, { headers: ai })).json()) as {
      book: { lineup: unknown[] }
    }
    const item = pageIn<{ items: { id: string }[] }>(read.book, shown)!.items[0]!.id
    await page.request.post("/api/ai/perform", {
      headers: ai,
      data: { action: "@matomezu/paper:item-update", args: { item, props: { caption } }, on: { page: shown } },
    })
  }
  const undone = async () =>
    ((await (await page.request.get("/api/ai/awaiting", { headers: ai })).json()) as { undone: unknown[] }).undone
  return { rename, undone }
}

// 表示領域を下へずらして、紙の上の方の箱を見える所の外に出す・戻す
async function scroll(page: Page, dy: number) {
  const stage = (await page.locator("[data-stage]").boundingBox())!
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2)
  await page.mouse.wheel(0, dy)
}

test("見えている箱を AI が書き換えたら、Ctrl+Z はまず AI の変更を戻し、次に自分の操作を戻す", async ({ page }) => {
  const ai = await joinedAiAuth()
  await page.goto(BOOK_SCREEN_URL)
  await page.bringToFront()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toHaveProperty("stage")
  const { book, page: shown } = (await (await page.request.get("/api/ai/view", { headers: ai })).json()) as {
    book: string
    page: string
  }
  await addBox(page, 200, 150, "自分")
  await expect(items(page)).toHaveText("自分")
  const read = (await (await page.request.get(`/api/ai/books/${book}`, { headers: ai })).json()) as {
    book: { lineup: unknown[] }
  }
  const item = pageIn<{ items: { id: string }[] }>(read.book, shown)!.items[0]!.id
  await page.request.post("/api/ai/perform", {
    headers: ai,
    data: {
      action: "@matomezu/paper:item-update",
      args: { item, props: { caption: "AI" } },
      on: { page: shown },
    },
  })
  await expect(items(page)).toHaveText("AI")
  await page.keyboard.press("Control+z")
  await expect(items(page)).toHaveText("自分")
  await page.keyboard.press("Control+z")
  await expect(items(page)).toHaveCount(0)
})

test("見える所の外で AI が書き換えた箱は、見えるまで Ctrl+Z で戻らず、ずらして見えたら AI の変更から戻る", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 480 })
  const { rename, undone } = await aiReady(page)
  await addBox(page, 200, 150, "自分")
  await addBox(page, 500, 150, "二つめ")
  await expect(items(page)).toHaveCount(2)
  await scroll(page, 800)
  await rename("AI")
  await expect(items(page).first()).toHaveText("AI")
  // まだ見ていないので、戻るのは自分の 2 つめの箱
  await page.keyboard.press("Control+z")
  await expect(items(page)).toHaveCount(1)
  await expect(items(page)).toHaveText("AI")
  await page.keyboard.press("Control+Shift+z")
  await expect(items(page)).toHaveCount(2)
  // 見える所に戻すと、AI の変更が先に戻る
  await scroll(page, -800)
  await page.keyboard.press("Control+z")
  await expect(items(page).first()).toHaveText("自分")
  await expect(items(page)).toHaveCount(2)
  expect(await undone()).toEqual([])
})

test("見える所の外で AI が書き換えた箱を、見る前に Ctrl+Z で消そうとすると、ぶつかって断られ（トースト）、AI の変更は残る", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 480 })
  const { rename, undone } = await aiReady(page)
  await addBox(page, 200, 150, "自分")
  await expect(items(page)).toHaveText("自分")
  await scroll(page, 800)
  await rename("AI")
  await expect(items(page)).toHaveText("AI")
  await page.keyboard.press("Control+z")
  const toast = page.getByRole("alert").filter({ hasText: "元に戻せません" })
  await expect(toast).toContainText("ほかの変更とぶつかります")
  await expect(items(page)).toHaveText("AI")
  expect(await undone()).toEqual([])
})
