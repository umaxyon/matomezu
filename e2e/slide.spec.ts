// スライドのブック（@matomezu/slide-book）: ページの slide に置いたアイテム（文字枠・自由な線・直線・楕円）を、書いた位置と大きさ・角度で重ねの順に描く。紙の外にはみ出た部分は切る
import { BOOK_SCREEN_URL, expect, type Page, test } from "./fixtures"
import { footerMenuTool } from "./helpers/footer-menu"
import { onPaper, paper } from "./helpers/paper"
import { fromMenu } from "./helpers/stage-menu"

const SLIDE_BOOK = {
  type: "@matomezu/slide-book:slide",
  id: "b1",
  title: "スライド",
  project: "default",
  pages: [
    {
      id: "p1",
      title: "1",
      paper: "@matomezu/base:a4",
      orientation: "landscape",
      slide: [
        {
          id: "t1",
          x: 80,
          y: 60,
          item: "@matomezu/slide:slide-text",
          w: 500,
          h: 80,
          props: { text: "題名のスライド", fontSize: 48 },
        },
        {
          id: "e1",
          x: 120,
          y: 220,
          item: "@matomezu/slide:slide-ellipse",
          w: 260,
          h: 160,
          props: { fill: "#f6c177", stroke: "#b4637a", width: 4 },
        },
        {
          id: "l1",
          x: 460,
          y: 220,
          item: "@matomezu/slide:slide-line",
          w: 300,
          h: 160,
          props: { endHead: "arrow", width: 4, color: "#286983" },
        },
        {
          id: "f1",
          x: 460,
          y: 420,
          item: "@matomezu/slide:slide-free-line",
          w: 300,
          h: 120,
          props: {
            points: [
              { x: 0, y: 1 },
              { x: 0.3, y: 0 },
              { x: 0.6, y: 0.9 },
              { x: 1, y: 0.1 },
            ],
            width: 5,
            color: "#907aa9",
          },
        },
        {
          id: "t2",
          x: 140,
          y: 440,
          item: "@matomezu/slide:slide-text",
          w: 240,
          h: 60,
          props: { text: "傾けた文字", fontSize: 32, rotation: -12, color: "#b4637a" },
        },
        {
          id: "t3",
          x: 900,
          y: 500,
          item: "@matomezu/slide:slide-text",
          w: 400,
          h: 120,
          props: { text: "紙の外にはみ出た文字", fontSize: 40 },
        },
      ],
    },
  ],
}

test.use({ books: [SLIDE_BOOK] })

test("スライドのアイテムは書いた位置に描かれ、紙の外にはみ出た部分は切れる", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  const items = page.locator("[data-item]")
  await expect(items).toHaveCount(6)
  await expect(items.first()).toHaveText("題名のスライド")
  await expect(page.locator('[data-item="t2"]')).toHaveCSS("transform", /^matrix/) // 角度をかけた枠
  await expect(page.locator('[data-item="t1"]')).toHaveCSS("transform", "none")
})

// ここから操作。16:9 の紙（横 1280）に、アイテムを 1 つ置いたスライド
const EMPTY = {
  type: "@matomezu/slide-book:slide",
  id: "b2",
  title: "空のスライド",
  project: "default",
  pages: [{ id: "p1", title: "1", paper: "@matomezu/base:ratio-16x9", orientation: "landscape", slide: [] }],
}
const WIDE_WIDTH = 1280

test.describe("スライドの操作", () => {
  test.use({ books: [EMPTY] })

  async function draw(page: Page, tool: string, from: [number, number], to: [number, number]) {
    await (await footerMenuTool(page, tool)).click()
    const at = await onPaper(page, 0, 0)
    const z = (await paper(page).boundingBox())!.width / WIDE_WIDTH
    await page.mouse.move(at.x + from[0] * z, at.y + from[1] * z)
    await page.mouse.down()
    await page.mouse.move(at.x + to[0] * z, at.y + to[1] * z, { steps: 6 })
    await page.mouse.up()
    return z
  }

  test("道具を選んでドラッグすると、その四角に置いて選び、バーとつまみが出る。楕円・直線・自由な線も置ける", async ({
    page,
  }) => {
    await page.goto(BOOK_SCREEN_URL)
    await draw(page, "楕円", [100, 100], [400, 250])
    const e = page.locator("[data-item]").first()
    await expect(e).toBeVisible()
    const box = (await e.boundingBox())!
    const z = (await paper(page).boundingBox())!.width / WIDE_WIDTH
    expect(Math.abs(box.width / z - 300)).toBeLessThan(3)
    expect(Math.abs(box.height / z - 150)).toBeLessThan(3)
    await expect(page.locator("[data-grip]")).toHaveCount(8)
    await expect(page.locator("[data-bar]")).toBeVisible()
    await draw(page, "直線", [500, 100], [800, 300])
    await draw(page, "自由な線", [500, 400], [700, 500])
    await expect(page.locator("[data-item]")).toHaveCount(3)
  })

  test("選んで動かす。角のつまみで大きさを変える。角度は数字で入れる（比率のボタンは無い）", async ({ page }) => {
    await page.goto(BOOK_SCREEN_URL)
    const z = await draw(page, "楕円", [100, 100], [400, 250])
    const e = page.locator("[data-item]").first()
    const start = (await e.boundingBox())!
    // 動かす
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
    await page.mouse.down()
    await page.mouse.move(start.x + start.width / 2 + 60 * z, start.y + start.height / 2 + 30 * z, { steps: 5 })
    await page.mouse.up()
    await expect.poll(async () => Math.round(((await e.boundingBox())!.x - start.x) / z)).toBe(60)
    // 右下の角で広げる
    const grip = (await page.locator('[data-grip="bottom-right"]').boundingBox())!
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(grip.x + grip.width / 2 + 100 * z, grip.y + grip.height / 2 + 100 * z, { steps: 5 })
    await page.mouse.up()
    await expect.poll(async () => Math.round((await e.boundingBox())!.width / z)).toBe(400)
    await expect.poll(async () => Math.round((await e.boundingBox())!.height / z)).toBe(250)
    await expect(page.getByRole("button", { name: /比率/ })).toHaveCount(0)
    // 辺を引くと、その向きだけ変わる
    const right = (await page.locator('[data-grip="right"]').boundingBox())!
    await page.mouse.move(right.x + right.width / 2, right.y + right.height / 2)
    await page.mouse.down()
    await page.mouse.move(right.x + right.width / 2 + 80 * z, right.y + right.height / 2, { steps: 5 })
    await page.mouse.up()
    await expect.poll(async () => Math.round((await e.boundingBox())!.width / z)).toBe(480)
    await expect.poll(async () => Math.round((await e.boundingBox())!.height / z)).toBe(250)
    // 角度は数字で入れる
    const angle = page.getByLabel("角度")
    await angle.fill("90")
    await angle.press("Enter")
    await expect(e).toHaveCSS("transform", /^matrix/)
  })

  test("直線を選ぶと、バーで色・太さ・点線・矢印を変えられる。楕円は塗りと枠の太さを変えられる", async ({ page }) => {
    await page.goto(BOOK_SCREEN_URL)
    await draw(page, "直線", [200, 200], [600, 400])
    const line = page.locator("[data-item]").first()
    const stroke = line.locator("polyline")
    await expect(line.locator("polygon")).toHaveCount(0)
    const bar = page.locator("[data-bar]")
    await bar.getByLabel("太さ").fill("7")
    await bar.getByLabel("太さ").press("Enter")
    await expect(stroke).toHaveAttribute("stroke-width", "7")
    await bar.getByRole("button", { name: "点線" }).click()
    await expect(stroke).toHaveAttribute("stroke-dasharray", /.+/)
    await bar.getByRole("button", { name: "矢印" }).click()
    await expect(line.locator("polygon")).toHaveCount(1)
    await bar.getByRole("button", { name: "色", exact: true }).click()
    await page.getByRole("button", { name: "テーマの色 3" }).click()
    await expect(stroke).not.toHaveAttribute("stroke", "var(--theme-text)")
    // 楕円
    await draw(page, "楕円", [700, 300], [1000, 500])
    const ellipse = page.locator("[data-item]").nth(1).locator("ellipse")
    await expect(ellipse).toHaveAttribute("fill", "none")
    await page.locator("[data-bar]").getByRole("button", { name: "塗り" }).click()
    await page.getByRole("button", { name: "テーマの色 2" }).click()
    await expect(ellipse).not.toHaveAttribute("fill", "none")
    const width = page.locator("[data-bar]").getByLabel("太さ")
    await width.fill("0")
    await width.press("Enter")
    await expect(ellipse).toHaveAttribute("stroke", "none")
  })

  test("楕円の枠の色の「なし」を選ぶと枠が描かれず、色を選び直すと戻る（未設定は文字色の枠）", async ({ page }) => {
    await page.goto(BOOK_SCREEN_URL)
    await draw(page, "楕円", [700, 300], [1000, 500])
    const ellipse = page.locator("[data-item]").first().locator("ellipse")
    await expect(ellipse).toHaveAttribute("stroke", /.+/)
    await expect(ellipse).not.toHaveAttribute("stroke", "none") // 未設定は文字色の枠
    const bar = page.locator("[data-bar]")
    await bar.getByRole("button", { name: "枠の色" }).click()
    await page.getByRole("button", { name: "なし" }).click()
    await expect(ellipse).toHaveAttribute("stroke", "none")
    await page.getByRole("button", { name: "テーマの色 2" }).click()
    await expect(ellipse).not.toHaveAttribute("stroke", "none")
  })

  test("太さは打っている途中から見た目に反映され、元に戻すは 1 回で入力の前に戻る", async ({ page }) => {
    await page.goto(BOOK_SCREEN_URL)
    await draw(page, "直線", [200, 200], [600, 400])
    const stroke = page.locator("[data-item]").first().locator("polyline")
    const before = await stroke.getAttribute("stroke-width")
    const width = page.locator("[data-bar]").getByLabel("太さ")
    await width.click()
    await width.press("ControlOrMeta+a")
    await width.pressSequentially("12")
    await expect(stroke).toHaveAttribute("stroke-width", "12") // 外へ出る前に反映される
    await width.press("Enter")
    await page.keyboard.press("ControlOrMeta+z")
    await expect(stroke).toHaveAttribute("stroke-width", before ?? "")
  })

  // 道具を選び、ドラッグせず紙の (x, y)（紙の上の px）を 1 回押して、文字枠を置く
  async function putTextAt(page: Page, x: number, y: number) {
    await (await footerMenuTool(page, "文字枠")).click()
    const at = await onPaper(page, 0, 0)
    const z = (await paper(page).boundingBox())!.width / WIDE_WIDTH
    await page.mouse.click(at.x + x * z, at.y + y * z)
    return z
  }

  test("押しただけで置く文字枠は、高さが文字 1 行分、幅が 1 文字より狭い", async ({ page }) => {
    await page.goto(BOOK_SCREEN_URL)
    const z = await putTextAt(page, 200, 200)
    await expect(page.locator("textarea")).toBeFocused()
    const box = (await page.locator("[data-item]").first().boundingBox())!
    expect(Math.abs(box.width / z - 12)).toBeLessThan(3)
    expect(Math.abs(box.height / z - 32)).toBeLessThan(3)
  })

  test("何も書かずに終えた文字枠は、何も言わずに消え、元に戻す履歴に残らない", async ({ page }) => {
    await page.goto(BOOK_SCREEN_URL)
    await putTextAt(page, 200, 200)
    await expect(page.locator("textarea")).toBeFocused()
    await page.mouse.click(1, 1) // 何も書かずに外を押す
    await expect(page.locator("[data-item]")).toHaveCount(0)
    await expect(page.locator("[role=status]")).toHaveCount(0)
    await putTextAt(page, 200, 200)
    await page.keyboard.press("Escape") // やめても残さない
    await expect(page.locator("[data-item]")).toHaveCount(0)
  })

  test("文字枠は文字の幅と高さに寄り、増えれば広がり、減れば縮む。置いて書いて寄せたのは 1 回で戻る", async ({
    page,
  }) => {
    await page.goto(BOOK_SCREEN_URL)
    const z = await putTextAt(page, 100, 100)
    const item = page.locator("[data-item]").first()
    const width = async () => (await item.boundingBox())!.width / z
    const height = async () => (await item.boundingBox())!.height / z
    await page.keyboard.type("0123456789")
    await expect.poll(width).toBeGreaterThan(100)
    const ten = await width()
    await page.keyboard.type("0123456789")
    await expect.poll(width).toBeGreaterThan(ten + 50)
    await page.keyboard.press("Enter")
    await page.keyboard.type("下の行")
    await expect.poll(height).toBeGreaterThan(55)
    await page.keyboard.press("Backspace")
    await page.keyboard.press("Backspace")
    await page.keyboard.press("Backspace")
    await page.keyboard.press("Backspace")
    await expect.poll(height).toBeLessThan(40) // 行が減れば縮む
    for (let i = 0; i < 10; i++) await page.keyboard.press("Backspace")
    await expect.poll(width).toBeLessThan(ten + 5) // 文字が減れば縮む
    await page.mouse.click(1, 1)
    expect(await width()).toBeLessThan(ten + 5) // 決めたあとも文字に寄ったまま
    await page.keyboard.press("ControlOrMeta+z") // 置いて書いて寄せたのが 1 回で戻る
    await expect(page.locator("[data-item]")).toHaveCount(0)
  })

  test("書き終えた文字枠はダブルクリックで中にカーソルが入って書き直せ、全部消して終えると消える", async ({ page }) => {
    await page.goto(BOOK_SCREEN_URL)
    await putTextAt(page, 200, 200)
    await page.keyboard.type("abcd")
    await page.mouse.click(1, 1)
    const item = page.locator("[data-item]").first()
    await expect(item).toHaveText("abcd")
    await item.dblclick()
    await expect(page.locator("textarea")).toBeFocused()
    await page.keyboard.type("ef")
    await page.mouse.click(1, 1)
    await expect(item).toHaveText("abcdef")
    await item.dblclick()
    await page.keyboard.press("ControlOrMeta+a")
    await page.keyboard.press("Delete")
    await page.mouse.click(1, 1)
    await expect(page.locator("[data-item]")).toHaveCount(0)
    await page.keyboard.press("ControlOrMeta+z")
    await expect(page.locator("[data-item]")).toHaveText("abcdef")
  })

  test("文字枠のバーに角度の入力は無く、「水平に戻す」は角度が付くと押せて、押すと真正面に戻る。楕円には角度の入力がある", async ({
    page,
  }) => {
    await page.goto(BOOK_SCREEN_URL)
    await draw(page, "文字枠", [100, 100], [500, 180])
    await page.keyboard.type("見出し")
    await page.mouse.click(1, 1)
    const t = page.locator("[data-item]").first()
    await t.click()
    await expect(page.getByLabel("角度")).toHaveCount(0)
    const level = page.getByRole("button", { name: "水平に戻す" })
    await expect(level).toBeDisabled()
    const rot = (await page.locator("[data-rotate]").boundingBox())!
    await page.mouse.move(rot.x + rot.width / 2, rot.y + rot.height / 2)
    await page.mouse.down()
    await page.mouse.move(rot.x + rot.width / 2 + 120, rot.y + rot.height / 2 + 160, { steps: 8 })
    await page.mouse.up()
    await expect(t).toHaveCSS("transform", /^matrix/)
    await expect(level).toBeEnabled()
    await level.click()
    await expect(t).toHaveCSS("transform", "none")
    await expect(level).toBeDisabled()
    await draw(page, "楕円", [100, 300], [300, 400])
    await expect(page.getByLabel("角度")).toBeVisible()
  })

  test("回すつまみで回せる。文字枠は置いたらそのまま打て、Delete で消せ、元に戻せる", async ({ page }) => {
    await page.goto(BOOK_SCREEN_URL)
    await draw(page, "文字枠", [100, 100], [500, 180])
    const editor = page.locator("textarea")
    await expect(editor).toBeFocused()
    await page.keyboard.type("見出し")
    await page.mouse.click(1, 1) // 外を押して決める
    const t = page.locator("[data-item]").first()
    await expect(t).toHaveText("見出し")
    await t.click()
    const rot = (await page.locator("[data-rotate]").boundingBox())!
    await page.mouse.move(rot.x + rot.width / 2, rot.y + rot.height / 2)
    await page.mouse.down()
    await page.mouse.move(rot.x + rot.width / 2 + 120, rot.y + rot.height / 2 + 160, { steps: 8 })
    await page.mouse.up()
    await expect(t).toHaveCSS("transform", /^matrix/)
    await page.keyboard.press("Delete")
    await expect(page.locator("[data-item]")).toHaveCount(0)
    await page.keyboard.press("ControlOrMeta+z")
    await expect(page.locator("[data-item]")).toHaveCount(1)
  })
})

test.describe("スライドの印刷", () => {
  test.use({ books: [SLIDE_BOOK] })

  test("印刷プレビューに、スライドのアイテムが載った紙 1 枚が出る", async ({ page }) => {
    await page.goto(BOOK_SCREEN_URL)
    await (await fromMenu(page, "印刷プレビュー")).click()
    await expect(page.locator("[data-print-preview]")).toBeVisible()
    await expect(page.locator("[data-sheet]")).toHaveCount(1)
    await expect(page.locator("[data-sheet]").getByText("題名のスライド")).toBeVisible()
    await expect(page.locator("[data-grip]")).toHaveCount(0)
  })
})

test.describe("スライドの印刷の設定", () => {
  const EMPTY = {
    ...SLIDE_BOOK,
    pages: [{ ...SLIDE_BOOK.pages[0], slide: [], settings: { "@matomezu/slide-book:slide-print": "always" } }],
  }
  test.use({ books: [EMPTY] })

  test("何も無いスライドも、ページの設定が必ずなら 1 枚出る", async ({ page }) => {
    await page.goto(BOOK_SCREEN_URL)
    await (await fromMenu(page, "印刷プレビュー")).click()
    await expect(page.locator("[data-print-preview]")).toBeVisible()
    await expect(page.locator("[data-sheet]")).toHaveCount(1)
  })
})
