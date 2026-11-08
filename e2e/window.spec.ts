// 窓: コントロールセンターかブックスクリーンを前に出す。開いた直後はコントロールセンター、止まり木のボタンで行き来し、戻ってもブックスクリーンの中は残る。
// 前に出す物を替えるのはブラウザの履歴に 1 つ積み、戻る・進むで戻る
import { BOOK_SCREEN_URL, expect, test } from "./fixtures"
import { fromMenu } from "./helpers/stage-menu"

const center = (page: import("@playwright/test").Page) => page.getByRole("heading", { name: "コントロールセンター" })

test("開いた直後（URL が無いとき）はコントロールセンターが前に出て、後ろのブックスクリーンは隠れている", async ({
  page,
}) => {
  await page.goto("/")
  await expect(center(page)).toBeVisible()
  await expect(page.getByRole("heading", { name: "参加者" })).toBeVisible()
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(0)
  await expect(page).toHaveURL(/f=center/)
})

test("止まり木のボタンでコントロールセンターへ行き、押すとブックスクリーンへ戻る。戻ってもステージの中は残る", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await expect(center(page)).toBeHidden()
  await (await fromMenu(page, "画面を分割")).click()
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(2)
  await (await fromMenu(page, "コントロールセンター")).click()
  await expect(center(page)).toBeVisible()
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(0)
  // センターの下の行の止まり木は押された状態で、押すと戻る
  const perch = page.getByRole("button", { name: "コントロールセンター" })
  await expect(perch).toHaveAttribute("aria-pressed", "true")
  await perch.click()
  await expect(center(page)).toBeHidden()
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(2)
})

test("前に出す物を替えるのはブラウザの履歴に 1 つ積み、戻る・進むで戻る", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  await (await fromMenu(page, "コントロールセンター")).click()
  await expect(center(page)).toBeVisible()
  await expect(page).toHaveURL(/f=center/)
  await page.goBack()
  await expect(center(page)).toBeHidden()
  await expect(page.getByRole("img", { name: "紙" })).toBeVisible()
  await page.goForward()
  await expect(center(page)).toBeVisible()
})
