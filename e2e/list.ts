import { expect, type Page } from "@playwright/test"
import { footerMenuTool } from "./footer-menu"

// リストを置こうとして紙の (x, y) で押し、追加のダイアログでキャプションを入れて追加する
export async function addList(page: Page, caption: string) {
  await (await footerMenuTool(page, "リスト")).click()
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  await page.mouse.click(paper.x + 120, paper.y + 120)
  const dialog = page.getByRole("dialog", { name: "リストの追加" })
  await dialog.getByLabel("キャプション", { exact: true }).fill(caption)
  await dialog.getByRole("button", { name: "追加" }).click()
  await expect(dialog).toBeHidden()
  return page.locator("[data-item]", { hasText: caption })
}

export async function addRow(page: Page, list: ReturnType<Page["locator"]>, caption: string, body = "") {
  await list.getByRole("button", { name: "行の追加" }).click()
  const dialog = page.getByRole("dialog", { name: "行の追加" })
  await dialog.getByLabel("キャプション", { exact: true }).fill(caption)
  if (body) await dialog.getByLabel("本文", { exact: true }).fill(body)
  await dialog.getByRole("button", { name: "追加" }).click()
  await expect(dialog).toBeHidden()
}
