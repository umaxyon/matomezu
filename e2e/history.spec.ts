// 画面の履歴: 置いた箱を Ctrl+Z で元に戻し、Ctrl+Shift+Z でやり直す。ドロワーの元に戻す・やり直すのボタンも同じで、押してもドロワーは下がらない
import { expect, type Page, test } from "@playwright/test"
import { drawerTool } from "./drawer"

const items = (page: Page) => page.locator("[data-item]")

async function placeBox(page: Page, caption: string) {
  await (await drawerTool(page, "箱")).click()
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  await page.mouse.click(paper.x + 200, paper.y + 150)
  const dialog = page.getByRole("dialog", { name: "ボックスの追加" })
  await dialog.getByLabel("キャプション", { exact: true }).fill(caption)
  await dialog.getByRole("button", { name: "追加" }).click()
  await expect(dialog).toBeHidden()
}

test("置いた箱を Ctrl+Z で元に戻すと消え、Ctrl+Shift+Z と Ctrl+Y でやり直すと戻る", async ({ page }) => {
  await page.goto("/")
  await placeBox(page, "戻す箱")
  await expect(items(page)).toHaveCount(1)
  await page.keyboard.press("Control+z")
  await expect(items(page)).toHaveCount(0)
  await page.keyboard.press("Control+Shift+z")
  await expect(items(page)).toHaveText("戻す箱")
  await page.keyboard.press("Control+z")
  await expect(items(page)).toHaveCount(0)
  await page.keyboard.press("Control+y")
  await expect(items(page)).toHaveText("戻す箱")
})

test("ドロワーの元に戻す・やり直すのボタンで戻し、やり直せる。押してもドロワーは下がらず、続けて押せる", async ({
  page,
}) => {
  await page.goto("/")
  await placeBox(page, "1")
  await placeBox(page, "2")
  await expect(items(page)).toHaveCount(2)
  await drawerTool(page, "箱")
  const undo = page.getByRole("button", { name: "元に戻す" })
  const redo = page.getByRole("button", { name: "やり直す" })
  await expect(redo).toBeDisabled()
  await undo.click()
  await expect(items(page)).toHaveCount(1)
  await undo.click()
  await expect(items(page)).toHaveCount(0)
  await expect(undo).toBeDisabled()
  await redo.click()
  await expect(items(page)).toHaveText("1")
})
