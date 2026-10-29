// 下の行に乗せてドロワーを上げ、ドロワーのブックの道具のボタン name を返す（i 番目のステージ）
import { expect, type Page } from "@playwright/test"

export async function drawerTool(page: Page, name: string, i = 0) {
  const tabs = (await page.getByRole("tablist").nth(i).boundingBox())!
  await page.mouse.move(tabs.x + tabs.width - 20, tabs.y + tabs.height / 2)
  await expect(page.locator('button[aria-haspopup="menu"]').nth(i)).toHaveAttribute("aria-expanded", "true")
  return page.getByRole("toolbar", { name: "ツール" }).nth(i).getByRole("button", { name, exact: true })
}
