import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { expect, type Page, test } from "@playwright/test"

// 追加プラグインの見本 ex2 のフォルダを結んで立てた常駐を順に使う（途中で ex1・ex3 を足し、最後は 3 つを一緒に確かめる）
test.describe.configure({ mode: "serial" })

const data = async (page: Page) => (await page.request.get("/api/data")).json()
const flow = {
  type: "ex2/flow",
  id: "flow-1",
  title: "フロー",
  pages: [
    {
      id: "p1",
      title: "P",
      paper: "a4",
      orientation: "landscape",
      items: [{ id: "d1", item: "ex2/diamond", x: 40, y: 40, props: { caption: "判断" } }],
    },
  ],
}

test("常駐が結んだ追加プラグインを画面に渡し、画面はその見た目の JS を読む", async ({ page }) => {
  expect((await data(page)).plugins).toEqual([{ id: "ex2", ui: "api/plugins/0/ui.js?v=1" }])
  const put = await page.request.put(`/api/books/${flow.id}`, { data: { book: flow, base: 0 } })
  expect(put.ok()).toBe(true)
  await page.goto("/")
  await expect(page.locator("[data-ex2-diamond]")).toHaveAccessibleName("判断")
  // ひし形はテーマの欄 ex2/diamond.fill の色で塗る（変数が無ければ黒になる）
  const paint = await page.locator("[data-ex2-diamond] polygon").evaluate(el => ({
    declared: getComputedStyle(el).getPropertyValue("--theme-ex2--diamond-fill").trim(),
    fill: getComputedStyle(el).fill,
  }))
  expect(paint.declared).not.toBe("")
  expect(paint.fill).not.toBe("rgb(0, 0, 0)")
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
  await expect(page.locator("[data-ex2-diamond]")).toBeVisible()
  expect(await page.locator("[data-item]").boundingBox()).toEqual(moved)
})

test("追加プラグインの形の道具を使うと、その形の追加のダイアログ（追加プラグインのビュー）が開く", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "判断", exact: true }).click()
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  await page.mouse.click(paper.x + 400, paper.y + 300)
  await expect(page.getByRole("dialog", { name: "判断の追加" })).toBeVisible()
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
  await expect(page.locator("[data-ex2-diamond]")).toBeVisible()
  const mark = () => page.evaluate(() => Object.assign(window, { notReloaded: true }))
  const reloaded = () => page.waitForFunction(() => !("notReloaded" in window))
  await mark()
  const linked = await page.request.post("/api/plugins", {
    headers: ai(),
    data: { dir: resolve("test/added-plugins/ex3") },
  })
  expect(await linked.json()).toEqual({ ok: true, id: "ex3" })
  await reloaded()
  await expect(page.locator("[data-ex2-diamond]")).toBeVisible()
  expect((await data(page)).plugins.map((p: { id: string }) => p.id)).toEqual(["ex2", "ex3"])
  await expect.poll(() => loaded(page)).toEqual(["/api/plugins/0/ui.js", "/api/plugins/1/ui.js"])

  await mark()
  const removed = await page.request.post("/api/plugins/remove", { headers: ai(), data: { id: "ex3" } })
  expect(await removed.json()).toEqual({ ok: true })
  await reloaded()
  await expect(page.locator("[data-ex2-diamond]")).toBeVisible()
  expect((await data(page)).plugins.map((p: { id: string }) => p.id)).toEqual(["ex2"])
})

test("見た目の組み立てで食い違う追加プラグインは、画面が外して、ほかはそのまま使える", async ({ page }) => {
  // 星のビューを結んでいない ex3（ホストのエンジンでは組み立てられ、画面の見た目の組み立てで食い違う）
  const dir = mkdtempSync(join(tmpdir(), "matomezu-e2e-"))
  cpSync(resolve("test/added-plugins/ex3"), dir, { recursive: true })
  const ui = join(dir, "ui.tsx")
  writeFileSync(ui, readFileSync(ui, "utf8").replace(`items: { "ex3/star": { view: StarView, icon: STAR_ICON } },`, ""))
  const errors: string[] = []
  page.on("console", m => {
    if (m.type() === "error") errors.push(m.text())
  })
  await page.goto("/")
  const linked = await page.request.post("/api/plugins", { headers: ai(), data: { dir } })
  expect(await linked.json()).toEqual({ ok: true, id: "ex3" })
  await expect.poll(() => errors.some(e => e.includes("plugin ex3 is not added"))).toBe(true)
  await expect(page.locator("[data-ex2-diamond]")).toBeVisible()
  const removed = await page.request.post("/api/plugins/remove", { headers: ai(), data: { id: "ex3" } })
  expect(await removed.json()).toEqual({ ok: true })
})

test("取り込んだプラグインが置いてほしいと書いたウィジェットは、既定の配置に足されて出る", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("button", { name: "あいさつする" })).toHaveCount(0)
  const mark = () => page.evaluate(() => Object.assign(window, { notReloaded: true }))
  await mark()
  const linked = await page.request.post("/api/plugins", {
    headers: ai(),
    data: { dir: resolve("test/added-plugins/ex1") },
  })
  expect(await linked.json()).toEqual({ ok: true, id: "ex1" })
  await page.waitForFunction(() => !("notReloaded" in window))
  await expect(page.getByRole("button", { name: "あいさつする" })).toBeVisible()
  const removed = await page.request.post("/api/plugins/remove", { headers: ai(), data: { id: "ex1" } })
  expect(await removed.json()).toEqual({ ok: true })
})

// ここからは ex1・ex3 も足した常駐で、作り手の違う見本を一緒に使う
const link = async (page: Page, ...dirs: string[]) => {
  for (const dir of dirs) {
    const linked = await page.request.post("/api/plugins", { headers: ai(), data: { dir: resolve(dir) } })
    expect((await linked.json()).ok).toBe(true)
  }
}
const saved = async (page: Page, id: string) => (await data(page)).books.find((b: { id: string }) => b.id === id)?.book

test("3 つを読ませると、作り手の違うプラグインのボタンが同じ配置に並び、ex3 のテーマを ex2 のブックに使える", async ({
  page,
}) => {
  await link(page, "test/added-plugins/ex1", "test/added-plugins/ex3")
  expect((await data(page)).plugins.map((p: { id: string }) => p.id)).toEqual(["ex2", "ex1", "ex3"])
  await page.goto("/")
  await expect(page.locator("[data-ex2-diamond]")).toBeVisible()
  await expect(page.getByRole("button", { name: "あいさつする" })).toBeVisible()
  await page.getByRole("button", { name: "ミントにする" }).click()
  await expect.poll(async () => (await saved(page, flow.id))?.theme).toBe("ex3/mint")
  await page.reload()
  await expect(page.getByRole("button", { name: "ミントにする" })).toBeVisible()
  expect((await saved(page, flow.id))?.theme).toBe("ex3/mint")
})

test("AI は actions で追加プラグインのアクションを読み、perform で行える。形は選んだタイプのブックにだけ置ける", async ({
  page,
}) => {
  await page.goto("/")
  const catalog = await (await page.request.get("/api/ai/catalog", { headers: ai() })).json()
  const answer = catalog.actions.find((a: { id: string }) => a.id === "ex2/diamond.answer")
  expect(answer.description).toContain("Answer a decision")
  const perform = async (body: object) =>
    (await page.request.post("/api/ai/perform", { headers: ai(), data: body })).json()
  expect(
    await perform({
      action: "ex2/diamond.answer",
      args: { page: "p1", item: "d1", answer: "yes" },
      on: { book: flow.id },
    }),
  ).toMatchObject({ ok: true })
  await expect(page.locator('[data-ex2-diamond="yes"]')).toBeVisible()
  // ex3 の星は、ex3 を選んでいない ex2 のフローには置けない
  expect(
    await perform({
      action: "item.place",
      args: { page: "p1", item: "ex3/star", at: { x: 300, y: 300 } },
      on: { book: flow.id },
    }),
  ).toMatchObject({ ok: false })
})

test("新しいブックのダイアログに追加プラグインのタイプが並び、ex3 のボードは自分の紙で始まって、保存して読み直せる", async ({
  page,
}) => {
  await page.goto("/")
  await page.locator("button[aria-expanded]").first().hover()
  await page
    .locator("button[aria-expanded]")
    .first()
    .locator("xpath=following-sibling::div[1]")
    .getByRole("button", { name: "ホーム" })
    .click()
  await page.getByRole("button", { name: "新しいブック" }).click()
  const dialog = page.getByRole("dialog", { name: "新しいブック" })
  const types = dialog.getByLabel("ブックのタイプ")
  await expect(types.locator("option")).toContainText(["フロー", "ボード"])
  await types.selectOption({ label: "ボード" })
  await page.keyboard.type("星のボード")
  await page.keyboard.press("Enter")
  await expect(dialog).toBeHidden()
  await page.getByRole("button", { name: "ページを作る" }).click()
  await page.getByRole("dialog", { name: "新しいページ" }).getByRole("button", { name: "作成" }).click()
  await expect(page.getByRole("img", { name: "紙" })).toBeVisible()
  const board = async () =>
    (await data(page)).books.find((b: { book: { type: string } }) => b.book.type === "ex3/board")?.book
  await expect.poll(async () => (await board())?.pages?.[0]?.paper).toBe("ex3/square")
  await page.reload()
  expect((await board())?.title).toBe("星のボード")
})
