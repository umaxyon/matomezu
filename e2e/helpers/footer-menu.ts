// 下の行に乗せてフッタメニューを上げ、フッタメニューのブックの道具のボタン name を返す（i 番目のステージ）
import { expect, type Page } from "@playwright/test"

export async function footerMenuTool(page: Page, name: string, i = 0) {
  await footerMenu(page, i)
  return page.getByRole("toolbar", { name: "ツール" }).nth(i).getByRole("button", { name, exact: true })
}

// 下の行に乗せて、i 番目のステージのフッタメニューを上げる（上がるまで待つ）
export async function footerMenu(page: Page, i = 0) {
  const tabs = (await page.locator("[data-page-tabs]").nth(i).boundingBox())!
  await page.mouse.move(tabs.x + tabs.width - 20, tabs.y + tabs.height / 2)
  await expect(page.locator('button[aria-haspopup="menu"]').nth(i)).toHaveAttribute("aria-expanded", "true")
}
