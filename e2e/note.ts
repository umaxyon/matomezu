import { expect, type Locator, type Page } from "@playwright/test"

export const panel = (page: Page) => page.getByRole("complementary", { name: "右サイドパネル" })

// 物 target を右クリックして「AIに伝言」を選び、右サイドパネルで文 text を書いて付ける（付けると右サイドパネルは閉じる）
export async function writeNote(page: Page, target: Locator, text: string) {
  await target.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに伝言" }).click()
  await panel(page).getByLabel("伝言", { exact: true }).fill(text)
  await panel(page).getByRole("button", { name: "付ける" }).click()
  await expect(panel(page)).toHaveCount(0)
}
