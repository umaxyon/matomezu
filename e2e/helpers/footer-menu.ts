// 下の行に乗せてフッタメニューを上げ、フッタメニューのブックの道具のボタン name を返す（i 番目のステージ）
import { expect, type Page } from "@playwright/test"
import { settled } from "./paper"

export async function footerMenuTool(page: Page, name: string, i = 0) {
  await footerMenu(page, i)
  return page.getByRole("toolbar", { name: "ツール" }).nth(i).getByRole("button", { name, exact: true })
}

// 下の行に乗せて、i 番目のステージのフッタメニューを上げる（上がるまで待つ）。
// 下の行が止まってから乗せる（ブックを開いたすぐ後は、ステージの大きさが決まるまで下の行が動く。動いているうちに乗せると、止まったポインタの下から行が抜けてメニューが下がり、ポインタを動かすまで上がらない）
export async function footerMenu(page: Page, i = 0) {
  const row = page.locator("[data-page-tabs]").nth(i)
  await settled(page, row)
  const tabs = (await row.boundingBox())!
  await page.mouse.move(tabs.x + tabs.width - 20, tabs.y + tabs.height / 2)
  await expect(page.locator('button[aria-haspopup="menu"]').nth(i)).toHaveAttribute("aria-expanded", "true")
}
