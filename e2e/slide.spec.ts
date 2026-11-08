// スライドのブック（@matomezu/slide-book）: ページの slide に置いたアイテム（文字枠・自由な線・直線・楕円）を、書いた位置と大きさ・角度で重ねの順に描く。紙の外にはみ出た部分は切る
import { expect, test } from "./fixtures"

const SLIDE_BOOK = {
  type: "@matomezu/slide-book:slide",
  id: "b1",
  title: "スライド",
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
  await page.goto("/")
  const items = page.locator("[data-item]")
  await expect(items).toHaveCount(6)
  await expect(items.first()).toHaveText("題名のスライド")
  await expect(page.locator('[data-item="t2"]')).toHaveCSS("transform", /^matrix/) // 角度をかけた枠
  await expect(page.locator('[data-item="t1"]')).toHaveCSS("transform", "none")
})
