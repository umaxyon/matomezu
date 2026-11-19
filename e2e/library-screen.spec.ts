// 書庫のスクリーン: 「画面を分割」で、ブックスクリーンを左右に分けつつ窓の下半分に書庫のスクリーンを出し、選んだブックを右の空のステージに開く。
// 選ばずに閉じる・書庫の外を押すと、空のステージも閉じて分割をやめる。ブラウザの戻る 1 回で、分ける前に戻る。窓が低いときは書庫だけを窓いっぱいに出す。
import { BOOK_SCREEN_URL, expect, type Page, test } from "./fixtures"
import { fromMenu } from "./helpers/stage-menu"

const library = (page: Page) => page.getByRole("list", { name: "書庫 の中身" })
const stageNames = (page: Page) =>
  page.locator('button[aria-haspopup="menu"]:not([aria-label="ページを足す"])').locator("visible=true")

async function split(page: Page) {
  await page.goto(BOOK_SCREEN_URL)
  await page.bringToFront()
  await (await fromMenu(page, "画面を分割")).click()
  await expect(library(page)).toBeVisible()
  await expect(stageNames(page)).toHaveCount(2)
}

test("「画面を分割」で下に出た書庫でブックを 2 回押すと、右の空のステージに開き、書庫は引っ込む", async ({ page }) => {
  await split(page)
  await library(page).getByRole("button", { name: "残課題" }).dblclick()
  await expect(library(page)).toHaveCount(0)
  await expect(stageNames(page)).toHaveText([/まとめ図の構想/, /残課題/])
})

test("選ばずに「閉じる」・書庫の外を押すと、空のステージも閉じて分割をやめる", async ({ page }) => {
  await split(page)
  await page.getByRole("button", { name: "閉じる", exact: true }).click()
  await expect(library(page)).toHaveCount(0)
  await expect(stageNames(page)).toHaveCount(1)
  // もう一度分けて、上のブックスクリーンを押す
  await (await fromMenu(page, "画面を分割")).click()
  await expect(library(page)).toBeVisible()
  await page.mouse.click(300, 200)
  await expect(library(page)).toHaveCount(0)
  await expect(stageNames(page)).toHaveCount(1)
})

test("「広げる」で書庫が窓いっぱいになり、空のステージは閉じる。そのあと選ぶと新しいブックスクリーンに開く", async ({
  page,
}) => {
  await split(page)
  await page.getByRole("button", { name: "広げる" }).click()
  await expect(library(page)).toBeVisible()
  await expect(page.getByRole("button", { name: "閉じる", exact: true })).toHaveCount(1)
  await library(page).getByRole("button", { name: "残課題" }).dblclick()
  await expect(library(page)).toHaveCount(0)
  await expect(stageNames(page)).toHaveText([/残課題/])
})

test("ブラウザの戻る 1 回で、分ける前に戻る", async ({ page }) => {
  await split(page)
  await page.goBack()
  await expect(library(page)).toHaveCount(0)
  await expect(stageNames(page)).toHaveCount(1)
})

test("窓が低いときは、書庫だけを窓いっぱいに出し、選ぶと右のステージに開く", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 })
  await page.goto(BOOK_SCREEN_URL)
  await page.bringToFront()
  await (await fromMenu(page, "画面を分割")).click()
  await expect(library(page)).toBeVisible()
  await expect(stageNames(page)).toHaveCount(0)
  await library(page).getByRole("button", { name: "残課題" }).dblclick()
  await expect(stageNames(page)).toHaveText([/まとめ図の構想/, /残課題/])
})
