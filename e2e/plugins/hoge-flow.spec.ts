import { readFileSync } from "node:fs"
import { resolve } from "node:path"
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
  expect((await data(page)).plugins).toEqual([{ id: "hoge-flow", ui: "api/plugins/0/ui.js?v=1" }])
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

// AI と CLI の入口の合言葉（常駐のアプリのフォルダはポートごと。scripts/e2e-server.ts）
const ai = () => ({
  Authorization: `Bearer ${JSON.parse(readFileSync(`e2e/.home-${new URL(test.info().project.use.baseURL ?? "").port}/server.json`, "utf8")).token}`,
})
const loaded = (page: Page) =>
  page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map(e => new URL(e.name).pathname)
      .filter(p => p.startsWith("/api/plugins/")),
  )

test("動いている常駐にプラグインを足すと、開いている画面が読み直して取り込む。外すと読み直して消える", async ({
  page,
}) => {
  await page.goto("/")
  await expect(page.locator("[data-hoge-diamond]")).toBeVisible()
  const mark = () => page.evaluate(() => Object.assign(window, { notReloaded: true }))
  const reloaded = () => page.waitForFunction(() => !("notReloaded" in window))
  await mark()
  const linked = await page.request.post("/api/plugins", {
    headers: ai(),
    data: { dir: resolve("test/examples/plugins/fuga") },
  })
  expect(await linked.json()).toEqual({ ok: true, id: "fuga" })
  await reloaded()
  await expect(page.locator("[data-hoge-diamond]")).toBeVisible()
  expect((await data(page)).plugins.map((p: { id: string }) => p.id)).toEqual(["hoge-flow", "fuga"])
  await expect.poll(() => loaded(page)).toEqual(["/api/plugins/0/ui.js", "/api/plugins/1/ui.js"])

  await mark()
  const removed = await page.request.post("/api/plugins/remove", { headers: ai(), data: { id: "fuga" } })
  expect(await removed.json()).toEqual({ ok: true })
  await reloaded()
  await expect(page.locator("[data-hoge-diamond]")).toBeVisible()
  expect((await data(page)).plugins.map((p: { id: string }) => p.id)).toEqual(["hoge-flow"])
})
