// ブックの外のバインダ（書庫ホームに直に置いたスライドのバインダ）を、ステージで開く
import { BOOK_SCREEN_DEF, expect, stagesUrl, test, urlCurrentScreen, urlStages } from "./fixtures"

const slide = (id: string, title: string) => ({
  kind: "page",
  id,
  type: "@matomezu/slide-page:slide",
  title,
  paper: "@matomezu/base:a4",
  orientation: "landscape",
})
const BINDER = {
  kind: "binder",
  id: "n1",
  title: "発表スライド",
  pageType: "@matomezu/slide-page:slide",
  lineup: [slide("n1a", "表紙"), slide("n1b", "本題")],
}

test.use({ outsidePages: [BINDER] })

test("書庫の画面でブックの外のバインダを 2 回押すと、1 枚目で開く。下の行はバインダの名前と置き場所で、ページ一覧でスライドを並べ替え・足し・消せる", async ({
  page,
}) => {
  await page.goto("/")
  await page.bringToFront()
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  await page.getByRole("list", { name: "書庫 の中身" }).getByRole("button", { name: "発表スライド" }).dblclick()
  await expect.poll(() => urlCurrentScreen(page)).toBe(BOOK_SCREEN_DEF)
  await expect.poll(() => urlStages(page).map(s => [s.b, s.p])).toEqual([[null, "n1a"]])
  await expect(page.locator(`button[aria-haspopup="menu"]`, { hasText: "発表スライド" })).toBeVisible()
  await expect(page.getByRole("button", { name: "置き場所: 書庫" })).toBeVisible()
  await expect(page.getByRole("tab")).toHaveCount(0)
  // ページ一覧の右クリックのメニューに、ブックの中と同じ行が出る
  const list = page.getByRole("navigation", { name: "ページ一覧" })
  await expect(list.getByRole("button", { name: "表紙" })).toHaveAttribute("aria-current", "page")
  await list.getByRole("button", { name: "本題" }).click({ button: "right" })
  await expect(page.getByRole("menuitem", { name: "ここに追加" })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "ページの設定" })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "スクラップを切り抜く" })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "複製" })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "削除…" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menu")).toHaveCount(0)
  // ドラッグで並べ替える
  const from = await list.getByRole("button", { name: "本題" }).boundingBox()
  const to = await list.getByRole("button", { name: "表紙" }).boundingBox()
  if (!from || !to) throw new Error("no page in the list")
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + 2, { steps: 8 })
  await page.mouse.up()
  await expect(list.locator("[data-page]").first()).toHaveAttribute("data-page", "n1b")
  // ＋で最後に 1 枚足して開き、Ctrl+Z で戻る
  await list.getByRole("button", { name: "ページを足す" }).click()
  await expect(list.locator("[data-page]")).toHaveCount(3)
  await page.keyboard.press("Control+z")
  await expect(list.locator("[data-page]")).toHaveCount(2)
  // 削除すると最後の 1 枚になり、その右クリックに削除は出ない
  await list.getByRole("button", { name: "表紙" }).click({ button: "right" })
  await page.getByRole("menuitem", { name: "削除…" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "削除" }).click()
  await expect(list.locator("[data-page]")).toHaveCount(1)
  await list.getByRole("button", { name: "本題" }).click({ button: "right" })
  await expect(page.getByRole("menuitem", { name: "複製" })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "削除…" })).toHaveCount(0)
  await page.keyboard.press("Escape")
  await list.getByRole("button", { name: "本題" }).click()
  await expect.poll(() => urlStages(page).map(s => [s.b, s.p])).toEqual([[null, "n1b"]])
  await expect(list.getByRole("button", { name: "本題" })).toHaveAttribute("aria-current", "page")
})

test("ブックを名指さずページを名指す場所の URL は、そのページを入れているブックの外のバインダを、そのページで開く", async ({
  page,
}) => {
  await page.goto(stagesUrl([{ book: null, page: "n1b" }]))
  await expect(page.getByRole("button", { name: "発表スライド" })).toBeVisible()
  const list = page.getByRole("navigation", { name: "ページ一覧" })
  await expect(list.getByRole("button", { name: "本題" })).toHaveAttribute("aria-current", "page")
})

test("ブックの外のバインダのページ一覧から切り抜くと、範囲を決めるダイアログにそのスライドが見え、スクラップトレイに入る（スライドには置けないので、入れたことを知らせる）", async ({
  page,
}) => {
  await page.goto(stagesUrl([{ book: null, page: "n1a" }]))
  const list = page.getByRole("navigation", { name: "ページ一覧" })
  await list.getByRole("button", { name: "本題" }).click({ button: "right" })
  await page.getByRole("menuitem", { name: "スクラップを切り抜く" }).click()
  const cut = page.getByRole("dialog", { name: "スクラップを切り抜く" })
  await expect(cut.locator("[data-scrap-area]")).toBeVisible()
  await cut.getByRole("button", { name: "トレイに入れる" }).click()
  await expect(cut).toBeHidden()
  await expect(page.getByText("スクラップトレイに入れました")).toBeVisible()
})

test("ブックの外のバインダの歯車は「スライドの設定」を開き、名前と向きを変えられる。削除は出ない", async ({ page }) => {
  await page.goto(stagesUrl([{ book: null, page: "n1a" }]))
  const thumb = page.locator("[data-page-list] [data-page] button").first()
  const ratio = () =>
    thumb.evaluate(el => {
      const r = el.getBoundingClientRect()
      return r.height > r.width
    })
  expect(await ratio()).toBe(false)
  await page.locator(`button[aria-haspopup="menu"]`, { hasText: "発表スライド" }).click()
  // 開いている間、窓はそのバインダに編集ロックを掛けていると知らせる
  const locked = page.waitForRequest(
    r => r.url().endsWith("/api/view") && JSON.stringify(r.postDataJSON()?.editLocks) === '{"n1":["n1"]}',
  )
  await page.getByRole("button", { name: "設定", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "スライドの設定" })
  await locked
  await expect(dialog.getByLabel("名前")).toHaveValue("発表スライド")
  await expect(dialog.getByRole("button", { name: "削除" })).toHaveCount(0)
  await dialog.getByLabel("名前").fill("発表会")
  await dialog.getByLabel("向き").selectOption("portrait")
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator(`button[aria-haspopup="menu"]`, { hasText: "発表会" })).toBeVisible()
  await expect.poll(ratio).toBe(true)
})
