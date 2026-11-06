// 左サイドパネルと送信トレイの e2e の補助
import { expect, type Page } from "@playwright/test"
import { fromMenu } from "./stage-menu"

export const leftPanel = (page: Page) => page.getByRole("complementary", { name: "左サイドパネル" })

export async function openLeftPanel(page: Page) {
  await (await fromMenu(page, "左サイドパネルを開く")).click()
  await expect(leftPanel(page)).toBeVisible()
}

// 左サイドパネルを開いて、送信トレイのタブにする（最初に開くのは郵便箱のタブ）
export async function openOutbox(page: Page) {
  await openLeftPanel(page)
  await expect(leftPanel(page).getByRole("tab", { name: "郵便箱" })).toHaveAttribute("aria-selected", "true")
  await leftPanel(page).getByRole("tab", { name: "送信トレイ" }).click()
}
