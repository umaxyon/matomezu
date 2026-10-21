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
  await dialog.getByLabel("キャプション").fill("残る箱")
  await dialog.getByRole("button", { name: "追加" }).click()
  await expect.poll(async () => (await data(page)).books.find((b: { id: string }) => b.id === book.id)?.version).toBe(2)
  const before = (await page.locator("[data-item]").boundingBox())!
  await page.reload()
  const item = page.locator("[data-item]")
  await expect(item).toHaveText("残る箱")
  expect(await item.boundingBox()).toEqual(before)
})
