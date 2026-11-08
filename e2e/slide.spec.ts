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
  pages: [{ id: "p1", title: "1", paper: "@matomezu/base:wide", orientation: "landscape", slide: [] }],
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

  test("選んで動かす。角のつまみで大きさを変える(比率の固定中は縦横の比を保つ)。角度は数字で入れる", async ({
    page,
  }) => {
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
    // 比率を固定すると、辺を引いても縦横の比を保つ
    await page.getByRole("button", { name: "比率", exact: true }).click()
    const right = (await page.locator('[data-grip="right"]').boundingBox())!
    await page.mouse.move(right.x + right.width / 2, right.y + right.height / 2)
    await page.mouse.down()
    await page.mouse.move(right.x + right.width / 2 + 80 * z, right.y + right.height / 2, { steps: 5 })
    await page.mouse.up()
    await expect.poll(async () => Math.round((await e.boundingBox())!.width / z)).toBe(480)
    await expect.poll(async () => Math.round((await e.boundingBox())!.height / z)).toBe(300)
    // 角度は数字で入れる
    const angle = page.getByLabel("角度")
    await angle.fill("90")
    await angle.press("Enter")
    await expect(e).toHaveCSS("transform", /^matrix/)
    // 元の比率に戻す(置いたときは 2:1)
    await page.getByRole("button", { name: "元の比率に" }).click()
    await expect
      .poll(async () => Math.round(((await e.evaluate(el => el.getBoundingClientRect().height)) / z) as number))
      .toBe(480)
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
