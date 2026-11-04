// 紙と、紙に置いた物を扱う e2e の補助
import { expect, type Locator, type Page } from "@playwright/test"
import { footerMenuTool } from "./footer-menu"

export const paper = (page: Page) => page.getByRole("img", { name: "紙" })

export const items = (page: Page) => page.locator("[data-item]")

// e2e が置く図面のブック（e2e/books.ts）の、A4 横の紙の幅
export const A4_LANDSCAPE_WIDTH = 1123

// A4 横の紙の上の 1px が、画面の何 px か
export async function zoomOf(page: Page) {
  return (await paper(page).boundingBox())!.width / A4_LANDSCAPE_WIDTH
}

// 物 at（既定は紙）が止まるのを待つ（続けて測った位置と大きさが同じになるまで）
export async function settled(page: Page, at: Locator = paper(page)) {
  let last = ""
  await expect
    .poll(async () => {
      const now = JSON.stringify(await at.boundingBox())
      const same = now === last
      last = now
      return same
    })
    .toBe(true)
}

// 紙の左上から (x, y) の画面の座標
export async function onPaper(page: Page, x: number, y: number) {
  const at = (await paper(page).boundingBox())!
  return { x: at.x + x, y: at.y + y }
}

// 開いている箱の追加のダイアログで、キャプションを入れて追加する
export async function confirmBox(page: Page, caption = "") {
  const dialog = page.getByRole("dialog", { name: "ボックスの追加" })
  await dialog.getByLabel("キャプション", { exact: true }).fill(caption)
  await dialog.getByRole("button", { name: "追加" }).click()
  await expect(dialog).toBeHidden()
}

// 箱のツールを押し、紙の (x, y) に、キャプションを付けた箱を置く
export async function addBox(page: Page, x: number, y: number, caption = "") {
  await (await footerMenuTool(page, "箱")).click()
  const at = await onPaper(page, x, y)
  await page.mouse.click(at.x, at.y)
  await confirmBox(page, caption)
}
