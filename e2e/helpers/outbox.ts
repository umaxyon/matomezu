// 左サイドパネルと送信トレイの e2e の補助
import { expect, type Page } from "@playwright/test"
import { fromMenu } from "./stage-menu"

export const leftPanel = (page: Page) => page.getByRole("complementary", { name: "左サイドパネル" })

export async function openLeftPanel(page: Page) {
  await (await fromMenu(page, "左サイドパネルを開く")).click()
  await expect(leftPanel(page)).toBeVisible()
}

// 送信トレイを開くボタンで左サイドパネルを開く（送信トレイのタブ）
export async function openOutbox(page: Page) {
  await openLeftPanel(page)
  await expect(leftPanel(page).getByRole("tab", { name: "送信トレイ" })).toHaveAttribute("aria-selected", "true")
}
