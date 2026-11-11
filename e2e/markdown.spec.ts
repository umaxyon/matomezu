// マークダウンのブック（@matomezu/markdown）: 紙を置かず、ソースとプレビューのペインを（選んでいなければ空のページは左右、本文のあるページはプレビューだけで）開く。上の行のボタンで並べ方を変え、見出しのドラッグで入れ替え、境目のドラッグで大きさを変え（どれも読み直しても戻る）、右クリックでページの設定を開く
import { aiAuth, BOOK_SCREEN_URL, expect, type Page, test } from "./fixtures"
import { newBook } from "./helpers/new-book"
import { openGeneral, settingsDialog } from "./helpers/settings"
import { fromMenu } from "./helpers/stage-menu"

// マークダウンのブックを作り、ページを 1 つ作る
async function markdownBook(page: Page) {
  await page.goto(BOOK_SCREEN_URL)
  const add = await newBook(page, "メモ", "マークダウン")
  await expect(add.getByText("可変ページ")).toHaveCount(0) // いつも可変ページなので選ばせない
  await add.getByRole("button", { name: "作成" }).click()
}

const pane = (page: Page, name: string) => page.getByRole("region", { name })

test("紙を置かずに、ソースとプレビューを左右に並べて開く。上の行のボタンで、ソースだけ・プレビューだけ・上下に並べるに変える（押したボタンは押した見た目）", async ({
  page,
}) => {
  await markdownBook(page)
  const stage = page.locator("[data-stage]").first()
  await expect(stage).toHaveAttribute("data-paper", "false")
  await expect(pane(page, "ソース")).toBeVisible()
  await expect(pane(page, "プレビュー")).toBeVisible()
  const source = (await pane(page, "ソース").boundingBox())!
  const preview = (await pane(page, "プレビュー").boundingBox())!
  expect(preview.x).toBeGreaterThan(source.x) // 左右
  // 紙（A4）より狭いペインでは、紙の幅のまま縮めて収める（横にはみ出さない）
  const article = (await pane(page, "プレビュー").locator("article").boundingBox())!
  expect(article.width).toBeLessThanOrEqual(preview.width)
  const button = (name: string) => page.getByRole("toolbar", { name: "ペイン" }).getByRole("button", { name })
  await expect(button("左右に並べる")).toHaveAttribute("aria-pressed", "true")

  await button("プレビューだけ").click()
  await expect(pane(page, "ソース")).toHaveCount(0)
  await expect(pane(page, "プレビュー")).toBeVisible()
  await expect(button("プレビューだけ")).toHaveAttribute("aria-pressed", "true")
  await expect(button("左右に並べる")).toHaveAttribute("aria-pressed", "false")
  await button("ソースだけ").click()
  await expect(pane(page, "ソース")).toBeVisible()
  await expect(pane(page, "プレビュー")).toHaveCount(0)

  await button("上下に並べる").click()
  const top = (await pane(page, "ソース").boundingBox())!
  const bottom = (await pane(page, "プレビュー").boundingBox())!
  expect(bottom.y).toBeGreaterThan(top.y) // 上下
})

test("並べ方のボタンは上の行の左端に並び、画面を分割して出たステージの閉じるボタン（右上）と重ならない", async ({
  page,
}) => {
  await markdownBook(page)
  await (await fromMenu(page, "画面を分割")).click()
  const stage = page.locator("[data-stage]").first()
  const bar = (await stage.getByRole("toolbar", { name: "ペイン" }).boundingBox())!
  const close = (await page.getByRole("button", { name: "ステージを閉じる" }).first().boundingBox())!
  const left = (await stage.boundingBox())!.x
  expect(bar.x - left).toBeLessThan(20)
  expect(bar.x + bar.width).toBeLessThan(close.x)
})

// 見出し（ペインの名前）の真ん中から、to のペインの真ん中までドラッグして離す
async function dragHeading(page: Page, from: string, to: { x: number; y: number }) {
  const tab = (await pane(page, from).getByText(from, { exact: true }).first().boundingBox())!
  await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
}
const middle = (box: { x: number; y: number; width: number; height: number }) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
})

test("見出しを掴んでもう片方のペインの上で離すと入れ替わり、ほかの所で離すと戻る。入れ替えてもソースに書き続けられる", async ({
  page,
}) => {
  await markdownBook(page)
  const box = async (name: string) => (await pane(page, name).boundingBox())!
  await pane(page, "ソース").getByRole("textbox").click()
  await page.keyboard.type("書き")
  // 上の行（ペインの外）で離すと、入れ替えない
  const bar = (await page.getByRole("toolbar", { name: "ペイン" }).boundingBox())!
  await dragHeading(page, "ソース", { x: bar.x + bar.width + 200, y: middle(bar).y })
  expect((await box("ソース")).x).toBeLessThan((await box("プレビュー")).x)
  // もう片方のペインの上で離すと入れ替わる
  await dragHeading(page, "ソース", middle(await box("プレビュー")))
  expect((await box("ソース")).x).toBeGreaterThan((await box("プレビュー")).x)
  await pane(page, "ソース").getByRole("textbox").click()
  await page.keyboard.press("End")
  await page.keyboard.type("足す")
  await expect(pane(page, "ソース").getByRole("textbox")).toHaveValue("書き足す")
  // 上下に並べても、入れ替えた順のまま（プレビューが上）
  await page.getByRole("toolbar", { name: "ペイン" }).getByRole("button", { name: "上下に並べる" }).click()
  expect((await box("ソース")).y).toBeGreaterThan((await box("プレビュー")).y)
})

test("境目を掴んで動かすとペインの大きさが変わり、ダブルクリックで半分に戻る。並べ方・入れ替えた順・境目は読み直しても戻る", async ({
  page,
}) => {
  await markdownBook(page)
  const box = async (name: string) => (await pane(page, name).boundingBox())!
  const splitter = page.locator("[data-pane-splitter]")
  const panes = { x: (await box("ソース")).x, w: (await box("ソース")).width + (await box("プレビュー")).width }
  const at = middle((await splitter.boundingBox())!)
  await page.mouse.move(at.x, at.y)
  await page.mouse.down()
  await page.mouse.move(panes.x + panes.w * 0.3, at.y, { steps: 5 })
  await page.mouse.up()
  expect((await box("ソース")).width / panes.w).toBeCloseTo(0.3, 1)
  await splitter.dblclick()
  expect((await box("ソース")).width / panes.w).toBeCloseTo(0.5, 1)

  // 上下に並べ、入れ替えて、上のペインを 3 割にしてから読み直す
  await page.getByRole("toolbar", { name: "ペイン" }).getByRole("button", { name: "上下に並べる" }).click()
  await dragHeading(page, "ソース", middle(await box("プレビュー")))
  const column = { y: (await box("プレビュー")).y, h: (await box("ソース")).height + (await box("プレビュー")).height }
  const mid = middle((await splitter.boundingBox())!)
  await page.mouse.move(mid.x, mid.y)
  await page.mouse.down()
  await page.mouse.move(mid.x, column.y + column.h * 0.3, { steps: 5 })
  await page.mouse.up()
  await expect(page).toHaveURL(/s0=/)
  await page.reload()
  await expect(
    page.getByRole("toolbar", { name: "ペイン" }).getByRole("button", { name: "上下に並べる" }),
  ).toHaveAttribute("aria-pressed", "true")
  const [top, bottom] = [await box("プレビュー"), await box("ソース")]
  expect(bottom.y).toBeGreaterThan(top.y)
  expect(top.height / (top.height + bottom.height)).toBeCloseTo(0.3, 1)
})

test("並べ方を選んでいないとき、空のページは左右で開き、書いても左右のまま。本文のあるページは開き直すとプレビューだけで開く。選んだ並べ方は本文があっても優先する", async ({
  page,
}) => {
  await markdownBook(page)
  const button = (name: string) => page.getByRole("toolbar", { name: "ペイン" }).getByRole("button", { name })
  await expect(button("左右に並べる")).toHaveAttribute("aria-pressed", "true")
  await pane(page, "ソース").getByRole("textbox").click()
  await page.keyboard.type("# 見出し")
  await expect(pane(page, "プレビュー").getByRole("heading", { name: "見出し" })).toBeVisible()
  await expect(pane(page, "ソース")).toBeVisible() // 書いても並べ方は変わらない
  await expect(page).not.toHaveURL(/s0=/) // 開いたときに決めた並べ方は場所に入れない
  await page.reload()
  await expect(pane(page, "ソース")).toHaveCount(0)
  await expect(button("プレビューだけ")).toHaveAttribute("aria-pressed", "true")
  await button("左右に並べる").click()
  await expect(page).toHaveURL(/s0=/)
  await page.reload()
  await expect(pane(page, "ソース")).toBeVisible()
  await expect(button("左右に並べる")).toHaveAttribute("aria-pressed", "true")
})

test("言語名の付いたコードの塊と生の HTML は、キーワード・文字列などを字と違う色で描く。言語名の無い塊は色付けしない", async ({
  page,
}) => {
  await markdownBook(page)
  await pane(page, "ソース").getByRole("textbox").click()
  await page.keyboard.insertText('```ts\nconst a = "s"\n```\n\n```\nconst b = 1\n```\n\n<div class="x">h</div>')
  const preview = pane(page, "プレビュー")
  const code = preview.locator("pre").first()
  await expect(code.locator('[data-code-color="keyword"]')).toHaveText("const")
  const color = (el: ReturnType<typeof code.locator>) => el.evaluate(e => getComputedStyle(e).color)
  const [keyword, string, text] = [
    await color(code.locator('[data-code-color="keyword"]')),
    await color(code.locator('[data-code-color="string"]')),
    await color(code),
  ]
  expect(new Set([keyword, string, text]).size).toBe(3)
  await expect(preview.locator("pre").nth(1).locator("[data-code-color]")).toHaveCount(0)
  await expect(preview.locator("pre").nth(2).locator('[data-code-color="tag"]').first()).toBeVisible()
})

test("プレビューのペインの右クリックで、ページの設定を開いてページの名前を変えられる", async ({ page }) => {
  await markdownBook(page)
  await pane(page, "プレビュー").click({ button: "right", position: { x: 60, y: 120 } })
  await page.getByRole("menu").getByRole("menuitem", { name: "ページの設定" }).click()
  const dialog = page.getByRole("dialog", { name: "ページの設定" })
  await dialog.getByLabel("ページの名前").fill("1 章")
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("tab", { name: "1 章" })).toBeVisible()
})

test("ソースのペインに書くと描いた文書が変わる（読むのは Web Worker）。Tab キーは Tab 文字を書き、続けて書いた物を Mod+Z で元に戻し、Mod+Shift+Z でやり直す", async ({
  page,
}) => {
  await markdownBook(page)
  const field = () => pane(page, "ソース").getByRole("textbox")
  await field().click()
  await page.keyboard.type("# 見出し")
  await expect(pane(page, "プレビュー").getByRole("heading", { name: "見出し" })).toBeVisible()
  // 書いたあとの原文は、画面とは別の処理の流れ（Web Worker）で読む
  expect(page.workers().map(w => new URL(w.url()).pathname)).toContain("/markdown-parse-worker.js")
  await page.keyboard.press("Enter")
  await page.keyboard.press("Tab")
  await page.keyboard.type("本文")
  await expect(field()).toHaveValue("# 見出し\n\t本文")
  await page.keyboard.press("ControlOrMeta+z")
  await expect(field()).toHaveValue("")
  await page.keyboard.press("ControlOrMeta+Shift+z")
  await expect(field()).toHaveValue("# 見出し\n\t本文")
})

test("ソースのエディタは既定で行番号を出し、設定画面の「マークダウン」でカーソルのある行の下線と空白の印を入れられる（印は字を足さず、テキストFormの字の並びとずれない）", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await openGeneral(page)
  await settingsDialog(page).getByRole("tab", { name: "マークダウン" }).click()
  const markdown = settingsDialog(page).getByRole("tabpanel", { name: "マークダウン" })
  await expect(markdown.getByRole("switch", { name: "行番号を出す" })).toBeChecked()
  await markdown.getByRole("switch", { name: "カーソルのある行に下線を引く" }).click()
  await markdown.getByRole("switch", { name: "空白と Tab を見せる" }).click()
  await expect(markdown.getByRole("switch", { name: "空白と Tab を見せる" })).toBeChecked()
  await page.keyboard.press("Escape")
  await markdownBook(page)
  const source = pane(page, "ソース")
  const field = source.getByRole("textbox")
  await field.click()
  const long = "長い行".repeat(40)
  await page.keyboard.type(`# 見出し\n- 項目 　末尾\n\tcode\n${long}`)
  await expect(source.locator("[data-line-numbers='true']")).toHaveCount(1)
  await expect(source.locator("[data-line]")).toHaveCount(4)
  // 書く所は 4 行目（折り返した長い行）
  await expect(source.locator("[data-current]")).toHaveAttribute("data-line", "4")
  await page.keyboard.press("ControlOrMeta+Home")
  await expect(source.locator("[data-current]")).toHaveAttribute("data-line", "1")
  await expect(source.locator("[data-blank='space']")).toHaveCount(3) // 「# 」「- 」「項目 」
  await expect(source.locator("[data-blank='wide']")).toHaveCount(1)
  await expect(source.locator("[data-blank='tab']")).toHaveCount(1)
  await expect(field).toHaveValue(`# 見出し\n- 項目 　末尾\n\tcode\n${long}`)
  // 写しとテキストFormの字の並びが同じなら、テキストFormの中身は写しの高さに収まる（はみ出さない）
  const overflow = await field.evaluate(el => el.scrollHeight - el.clientHeight)
  expect(overflow).toBeLessThanOrEqual(1)
  await source.screenshot({ path: "e2e/.results/markdown-source-look.png" })
})

test("描いた文書は、段落の中の改行 1 つを既定で改行にし、設定画面の「マークダウン」で空白（GFM のとおり）に変えられる", async ({
  page,
}) => {
  await markdownBook(page)
  await pane(page, "ソース").getByRole("textbox").click()
  await page.keyboard.type("一行目\n二行目")
  const paragraph = pane(page, "プレビュー").locator("p")
  await expect(paragraph).toContainText("二行目")
  // 段落が何行に描かれているか（字の四角の上端が何通りあるか。ペインを縮めて描いても変わらない）
  const lines = () =>
    paragraph.evaluate(el => {
      const range = document.createRange()
      range.selectNodeContents(el)
      return new Set([...range.getClientRects()].filter(r => r.width > 0).map(r => Math.round(r.top))).size
    })
  await expect.poll(lines).toBe(2)
  // フッタメニューから設定画面を開き、マークダウンを開いたまま変える
  await (await fromMenu(page, "設定を開く")).click()
  await settingsDialog(page).getByRole("tab", { name: "マークダウン" }).click()
  const select = settingsDialog(page).getByLabel("段落の中の改行")
  await expect(select).toHaveValue("line-break")
  await select.selectOption({ label: "空白にする（GFM方式）" })
  await page.keyboard.press("Escape")
  await expect.poll(lines).toBe(1)
})

test("ソースのペインで Mod+Z で戻すと、自分が書いた所だけが戻り、書いていない間に AI が書いた行は残る", async ({
  page,
}) => {
  const ai = aiAuth()
  await markdownBook(page)
  const field = () => pane(page, "ソース").getByRole("textbox")
  await field().click()
  await page.keyboard.type("# 見出し")
  await expect(field()).toHaveValue("# 見出し")
  const view = (await (await page.request.get("/api/ai/view", { headers: ai })).json()) as {
    book: string
    page: string
  }
  // 書いた物が常駐に届いてから、AI が書く
  const text = async () => {
    const got = (await (await page.request.get(`/api/ai/books/${view.book}`, { headers: ai })).json()) as {
      book: { pages: { id: string; text?: string }[] }
    }
    return got.book.pages.find(p => p.id === view.page)?.text
  }
  await expect.poll(text).toBe("# 見出し")
  // 書いている間は AI が書けない（編集ロック）ので、フォーカスを外してから AI が書く
  await field().blur()
  await expect
    .poll(async () => {
      const done = await page.request.post("/api/ai/perform", {
        headers: ai,
        data: {
          action: "@matomezu/base:page-update",
          args: { page: view.page, fields: { find: "# 見出し", replace: "AI の行\n# 見出し" } },
          on: { book: view.book },
        },
      })
      return ((await done.json()) as { ok: boolean }).ok
    })
    .toBe(true)
  await expect(field()).toHaveValue("AI の行\n# 見出し")
  await field().click()
  await page.keyboard.press("End")
  await page.keyboard.type("を足す")
  await expect(field()).toHaveValue("AI の行\n# 見出しを足す")
  await page.keyboard.press("ControlOrMeta+z")
  await expect(field()).toHaveValue("AI の行\n# 見出し")
})

test("ブックの設定のテーマは、マークダウンのブックが選べるテーマ（標準と GitHub 風）だけを並べ、GitHub 風にすると描いた文書の字が大きくなる", async ({
  page,
}) => {
  await markdownBook(page)
  await pane(page, "ソース").getByRole("textbox").click()
  await page.keyboard.type("本文")
  const paragraph = pane(page, "プレビュー").locator("p")
  await expect(paragraph).toContainText("本文")
  await (await fromMenu(page, "ブックの設定")).click()
  const dialog = page.getByRole("dialog", { name: "ブックの設定" })
  const theme = dialog.getByLabel("テーマ")
  await expect(theme.locator("option")).toHaveText(["標準", "GitHub 風"])
  await theme.selectOption({ label: "GitHub 風" })
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  await expect(paragraph).toHaveCSS("font-size", "16px")
})

test("ソースに書いている間（テキストFormにフォーカスがある間）は、AI がそのページを変えると断られ（being-edited）、フォーカスを外すと変えられる", async ({
  page,
}) => {
  await markdownBook(page)
  const ai = aiAuth()
  const field = pane(page, "ソース").getByRole("textbox")
  await field.click()
  await page.keyboard.type("利用者")
  await expect(field).toHaveValue("利用者")
  const view = (await (await page.request.get("/api/ai/view", { headers: ai })).json()) as {
    book: string
    page: string
  }
  const update = async () =>
    (
      await (
        await page.request.post("/api/ai/perform", {
          headers: ai,
          data: {
            action: "@matomezu/base:page-update",
            args: { page: view.page, title: "AI の題" },
            on: { book: view.book },
          },
        })
      ).json()
    ).reason as string | undefined
  await expect.poll(update).toBe("being-edited")
  await field.blur()
  await expect.poll(update).toBeUndefined()
})
