import { expect, type Page, test } from "@playwright/test"

// 見本の追加プラグイン hoge-flow のフォルダを結んだ常駐を順に使う
test.describe.configure({ mode: "serial" })

const data = async (page: Page) => (await page.request.get("/api/data")).json()
const flow = {
  type: "hoge-flow/flow",
  id: "flow-1",
  title: "フロー",
  pages: [
    {
      id: "p1",
      title: "P",
      paper: "a4",
      orientation: "landscape",
      items: [{ id: "d1", item: "hoge-flow/diamond", x: 40, y: 40, props: { caption: "判断" } }],
    },
  ],
}

test("常駐が結んだ追加プラグインを画面に渡し、画面はその見た目の JS を読む", async ({ page }) => {
  expect((await data(page)).plugins).toEqual([{ id: "hoge-flow", ui: "api/plugins/0/ui.js" }])
  const put = await page.request.put(`/api/books/${flow.id}`, { data: { book: flow, base: 0 } })
  expect(put.ok()).toBe(true)
  await page.goto("/")
  await expect(page.locator("[data-hoge-diamond]")).toHaveAccessibleName("判断")
})

test("追加プラグインの形を動かすと、常駐のエンジンも同じアクションを行って残し、読み直しても同じ所にある", async ({
  page,
}) => {
  await page.goto("/")
  const diamond = page.locator("[data-item]")
  const before = (await diamond.boundingBox())!
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
  await page.mouse.down()
  await page.mouse.move(before.x + before.width / 2 + 120, before.y + before.height / 2 + 80, { steps: 8 })
  await page.mouse.up()
  await expect.poll(async () => (await data(page)).books.find((b: { id: string }) => b.id === flow.id)?.version).toBe(2)
  const moved = (await diamond.boundingBox())!
  expect(moved.x).toBeGreaterThan(before.x)
  await page.reload()
  await expect(page.locator("[data-hoge-diamond]")).toBeVisible()
  expect(await page.locator("[data-item]").boundingBox()).toEqual(moved)
})

test("追加プラグインの形の道具を使うと、その形の追加のダイアログ（追加プラグインのビュー）が開く", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "hoge のひし形" }).click()
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  await page.mouse.click(paper.x + 400, paper.y + 300)
  await expect(page.getByRole("dialog", { name: "hoge のひし形の追加" })).toBeVisible()
})
