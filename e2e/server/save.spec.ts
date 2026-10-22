import { readFileSync } from "node:fs"
import { expect, type Page, test } from "@playwright/test"
import { SAMPLE_BOOKS } from "../../web/src/sample-books"

// 1 つの常駐（空のアプリのフォルダ）を順に使う
test.describe.configure({ mode: "serial" })

// 常駐に置いてあるもの
const data = async (page: Page) => (await page.request.get("/api/data")).json()

test("初めて開くと、ブックを持たずにマスターを出す", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("region", { name: "マスター" })).toBeVisible()
  expect((await data(page)).books).toEqual([])
})

test("マスターで変えた設定は常駐に残り、読み直しても同じ", async ({ page }) => {
  await page.goto("/")
  const skin = page.getByRole("region", { name: "マスター" }).getByLabel("スキン")
  await skin.selectOption("dark")
  await expect.poll(async () => (await data(page)).settings?.skin).toBe("dark")
  await page.reload()
  await expect(page.getByRole("region", { name: "マスター" }).getByLabel("スキン")).toHaveValue("dark")
})

test("置いた箱は少し待って常駐に残り、読み直しても同じ所にある", async ({ page }) => {
  const book = { ...SAMPLE_BOOKS[0]!, id: "e2e-1" }
  const put = await page.request.put(`/api/books/${book.id}`, { data: { book, base: 0 } })
  expect(put.ok()).toBe(true)
  await page.goto("/")
  await page.getByRole("button", { name: "箱" }).click()
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  await page.mouse.click(paper.x + 200, paper.y + 150)
  const dialog = page.getByRole("dialog", { name: "ボックスの追加" })
  await dialog.getByLabel("キャプション", { exact: true }).fill("残る箱")
  await dialog.getByRole("button", { name: "追加" }).click()
  await expect.poll(async () => (await data(page)).books.find((b: { id: string }) => b.id === book.id)?.version).toBe(2)
  const before = (await page.locator("[data-item]").boundingBox())!
  await page.reload()
  const item = page.locator("[data-item]")
  await expect(item).toHaveText("残る箱")
  expect(await item.boundingBox()).toEqual(before)
})

test("1 つの窓で置いた箱は、同じブックを開いているほかの窓にもすぐ出る。ほかの窓で動かすと、元の窓でも動く", async ({
  browser,
}) => {
  // 前のテストで置いたブック（e2e-1。箱が 1 つ）を、どちらの窓も最初に開く
  const a = await browser.newPage()
  const b = await browser.newPage()
  for (const page of [a, b]) {
    await page.goto("/")
    await expect(page.getByRole("tablist")).toHaveAttribute("aria-label", SAMPLE_BOOKS[0]!.title)
    await expect(page.locator("[data-item]")).toHaveCount(1)
  }
  await a.getByRole("button", { name: "箱" }).click()
  const paper = (await a.getByRole("img", { name: "紙" }).boundingBox())!
  await a.mouse.click(paper.x + 500, paper.y + 300)
  const dialog = a.getByRole("dialog", { name: "ボックスの追加" })
  await dialog.getByLabel("キャプション", { exact: true }).fill("共有の箱")
  await dialog.getByRole("button", { name: "追加" }).click()
  const shared = (page: typeof a) => page.locator("[data-item]", { hasText: "共有の箱" })
  await expect(shared(b)).toBeVisible()
  const before = (await shared(a).boundingBox())!
  const box = (await shared(b).boundingBox())!
  await b.mouse.move(box.x + 20, box.y + 20)
  await b.mouse.down()
  await b.mouse.move(box.x + 80, box.y + 60, { steps: 4 })
  await b.mouse.up()
  await expect.poll(async () => (await shared(a).boundingBox())!.x).toBeGreaterThan(before.x + 40)
})

test("AI の入口からは、最後にフォーカスした窓が見ているものが分かり、AI が置いた箱はすぐ窓に出る", async ({ page }) => {
  const { token } = JSON.parse(readFileSync("e2e/.home/server.json", "utf8"))
  const ai = { Authorization: `Bearer ${token}` }
  await page.goto("/")
  await page.bringToFront()
  await expect(page.locator("[data-item]").first()).toBeVisible()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toMatchObject({ book: "e2e-1", page: "p1" })
  const done = await page.request.post("/api/ai/perform", {
    headers: ai,
    data: {
      action: "item.place",
      args: { page: "p1", item: "shape.box", at: { x: 40, y: 400 }, props: { caption: "AI の箱" } },
      on: { book: "e2e-1" },
    },
  })
  expect(await done.json()).toMatchObject({ ok: true })
  await expect(page.locator("[data-item]", { hasText: "AI の箱" })).toBeVisible()
})

test("AI が show で頼むと、最後にフォーカスした窓が、分けたステージでそのブックを開く", async ({ page }) => {
  const { token } = JSON.parse(readFileSync("e2e/.home/server.json", "utf8"))
  const ai = { Authorization: `Bearer ${token}` }
  await page.goto("/")
  await page.bringToFront()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toMatchObject({
      book: "e2e-1",
      canSplit: true,
    })
  const made = await page.request.post("/api/ai/perform", {
    headers: ai,
    data: { action: "book.create", args: { type: "drawing", title: "AI のブック" } },
  })
  const { result } = await made.json()
  const shown = await page.request.post("/api/ai/show", { headers: ai, data: { book: result.book, split: true } })
  expect(await shown.json()).toEqual({ ok: true, opened: false })
  await expect(page.locator("[data-stage]")).toHaveCount(2)
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toMatchObject({ book: result.book, stage: "s2", canSplit: false })
})
