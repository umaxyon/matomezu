// ステージの下の行のブックの名前のボタンと、その上に上がるフッタメニュー
import type { Locator, Page } from "@playwright/test"

// ブックの名前のボタン trigger の、フッタメニュー
export const menuOf = (trigger: Locator) => trigger.locator("xpath=../following-sibling::div[1]")

// i 番目のステージの下の行のブックの名前のボタンにマウスを乗せ、上がったフッタメニューの中のボタン name を返す
export async function fromMenu(page: Page, name: string, i = 0) {
  const trigger = page.locator('button[aria-haspopup="menu"]').nth(i)
  await trigger.hover()
  return menuOf(trigger).getByRole("button", { name })
}
