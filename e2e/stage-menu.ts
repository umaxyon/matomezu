// i 番目のステージの下の行のブックの名前のボタンにマウスを乗せ、せり上がったメニューの中のボタン name を返す
import type { Page } from "@playwright/test"

export async function fromMenu(page: Page, name: string, i = 0) {
  const trigger = page.locator('button[aria-haspopup="menu"]').nth(i)
  await trigger.hover()
  return trigger.locator("xpath=../following-sibling::div[1]").getByRole("button", { name })
}
