// 画面を分割する e2e の補助: 「画面を分割」で左右に分けると、窓の下半分に書庫のスクリーンが出る。そこでブックを選ぶと右のステージに開き、書庫のスクリーンは引っ込む
import { expect, type Page } from "@playwright/test"
import { fromMenu } from "./stage-menu"

// 下に出た書庫のスクリーンのスクリーンの、右の枠の中身（コントロールセンターの書庫の画面は隠れているので、見えている物）
export const lowerLibrary = (page: Page) => page.getByRole("list", { name: /の中身$/ }).locator("visible=true")

// i 番目のステージで「画面を分割」し、下に出た書庫のスクリーンのスクリーンで名前 title のブックを 2 回押して右のステージに開く
export async function splitWith(page: Page, title: string, i = 0) {
  await (await fromMenu(page, "画面を分割", i)).click()
  await lowerLibrary(page).getByRole("button", { name: title, exact: true }).dblclick()
  await expect(lowerLibrary(page)).toHaveCount(0)
}
