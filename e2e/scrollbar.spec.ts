// スクロールバーが幅を取る環境（Windows など）での見た目。ヘッドレスのブラウザは既定でスクロールバーを隠すので、隠さずに起動する
import { BOOK_SCREEN_URL, CONTROL_CENTER_URL, expect, joinedAiAuth, test } from "./fixtures"
import { addFromTabs } from "./helpers/new-book"
import { fromMenu } from "./helpers/stage-menu"

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } })

test("分割した右のステージで中身が縦にスクロールしても、右上の閉じるボタンはスクロールバーに重ならない", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 480 })
  await page.goto(BOOK_SCREEN_URL)
  await (await fromMenu(page, "画面を分割")).click()
  // 右のステージに長いマークダウンのページを作る（プレビューのペインは縦にスクロールし、右端にスクロールバーが出る）
  const right = page.getByRole("region", { name: "ステージ" }).nth(1)
  await page.getByRole("button", { name: "ブック新規作成" }).locator("visible=true").click()
  const add = page.getByRole("dialog", { name: "新しいブック" })
  await page.keyboard.type("長い文書")
  await add.getByRole("button", { name: "作成" }).click()
  await addFromTabs(page.getByRole("tablist", { name: "長い文書" }), "マークダウン")
  await page
    .getByRole("dialog", { name: /^新しい/ })
    .getByRole("button", { name: "作成" })
    .click()
  await right.getByRole("region", { name: "ソース" }).getByRole("textbox").click()
  await page.keyboard.insertText(Array.from({ length: 60 }, (_, i) => `段落 ${i + 1}`).join("\n\n"))
  const preview = right.getByRole("region", { name: "プレビュー" })
  await expect(preview).toContainText("段落 60")
  const area = await preview.evaluate((pane: HTMLElement) => {
    const el = [pane, ...pane.querySelectorAll<HTMLElement>("*")].find(
      e => getComputedStyle(e).overflowY === "auto" && e.scrollHeight > e.clientHeight,
    )!
    const r = el.getBoundingClientRect()
    return { right: r.left + el.clientWidth, bar: el.offsetWidth - el.clientWidth }
  })
  expect(area.bar).toBeGreaterThan(0)
  const close = (await page.getByRole("button", { name: "ステージを閉じる" }).nth(1).boundingBox())!
  expect(close.x + close.width).toBeLessThanOrEqual(area.right)
})

test("リストの行が収まらず縦のスクロールバーが出ても、本文の右端の字は切れない。右寄せの本文の右端はそろう", async ({
  page,
}) => {
  const ai = await joinedAiAuth()
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto(BOOK_SCREEN_URL)
  await page.bringToFront()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toHaveProperty("stage")
  const { book, page: shown } = (await (await page.request.get("/api/ai/view", { headers: ai })).json()) as {
    book: string
    page: string
  }
  const perform = async (action: string, args: object, on: object = { book }) =>
    (await page.request.post("/api/ai/perform", { headers: ai, data: { action, args, on } })).json()
  const placed = await perform(
    "@matomezu/paper:item-place",
    {
      item: "@matomezu/list:shape-list",
      at: { x: 12, y: 12 },
      w: 588, // 字の置き場が 546px（全角の字 13px のちょうど 42 字）になる幅
      h: 150,
      props: { caption: "切れない" },
    },
    { page: shown },
  )
  const list = placed.result.item as string
  // 字の置き場ちょうどまで字が並ぶ本文（全角の字は表の幅どおりなので、折り返しの計算と描いた幅が合う）
  const body = "あ".repeat(120)
  for (const bodyAlign of ["left", "right"])
    await perform("@matomezu/list:row-add", { list, props: { caption: bodyAlign, body, bodyAlign } }, { page: shown })
  await perform("@matomezu/list:row-lines", { list, lines: "fit" }, { page: shown })
  const measured = await page.locator("[data-item]").evaluate((item: HTMLElement) => {
    const rows = [...item.querySelectorAll<HTMLElement>("*")].find(e => getComputedStyle(e).overflowY === "auto")!
    const lines = [...item.querySelectorAll<HTMLElement>("[data-align] > div")]
    return {
      scrollbar: rows.offsetWidth - rows.clientWidth,
      lines: lines.map(line => {
        const range = document.createRange()
        range.selectNodeContents(line)
        const text = range.getBoundingClientRect()
        // 切る物（overflow が visible でない入れ物）の、見えている右端
        let clip = rows.getBoundingClientRect().right - (rows.offsetWidth - rows.clientWidth)
        for (let e = line.parentElement; e && e !== rows; e = e.parentElement)
          if (getComputedStyle(e).overflowX !== "visible") clip = Math.min(clip, e.getBoundingClientRect().right)
        return { right: text.right, clip, align: line.parentElement?.dataset.align ?? "" }
      }),
    }
  })
  expect(measured.scrollbar).toBeGreaterThan(0)
  for (const l of measured.lines) expect(l.right).toBeLessThanOrEqual(l.clip + 0.5)
  const rights = measured.lines.filter(l => l.align === "right").map(l => Math.round(l.right))
  expect(rights.length).toBeGreaterThan(1)
  expect(new Set(rights).size).toBe(1)
})

test("窓の中のスクロールバーは、どこでも同じ細いバー（幅 6px）。後から足した要素にも効く", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 360 })
  await page.goto(CONTROL_CENTER_URL)
  await expect(page.getByRole("heading", { name: "コントロールセンター" })).toBeVisible()
  // 縦にスクロールしている所の、バーの幅（枠の分は除く）
  const bars = async () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("*")]
        .filter(e => {
          const s = getComputedStyle(e)
          return ["auto", "scroll"].includes(s.overflowY) && e.scrollHeight > e.clientHeight && e.clientHeight > 0
        })
        .map(e => {
          const s = getComputedStyle(e)
          return (
            e.offsetWidth - e.clientWidth - Number.parseFloat(s.borderLeftWidth) - Number.parseFloat(s.borderRightWidth)
          )
        }),
    )
  await expect.poll(async () => (await bars()).length).toBeGreaterThan(0)
  expect(new Set(await bars())).toEqual(new Set([6]))
  // どの要素にも当たる全体の指定なので、後から足した要素も細い
  const probe = await page.evaluate(() => {
    const el = document.createElement("div")
    el.style.cssText = "position:absolute;top:-200px;width:100px;height:100px;overflow:scroll"
    document.body.append(el)
    const size = { width: el.offsetWidth - el.clientWidth, height: el.offsetHeight - el.clientHeight }
    el.remove()
    return size
  })
  expect(probe).toEqual({ width: 6, height: 6 })
})
