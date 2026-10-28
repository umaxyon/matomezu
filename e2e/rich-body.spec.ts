// 本文の装飾（base の RichBody・RichText）: 本文のテキストFormの上のボックスで、選んだ範囲を太字・文字の色にし、箱に装飾して描く
import { expect, type Page, test } from "@playwright/test"

async function onPaper(page: Page, x: number, y: number) {
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  return { x: paper.x + x, y: paper.y + y }
}

test("本文の上のボックスで、選んだ範囲を太字と注意の色にすると、記号が入り、箱では記号を外して太字・色で描く", async ({
  page,
}) => {
  await page.goto("/")
  await page.getByRole("button", { name: "箱" }).click()
  const at = await onPaper(page, 200, 150)
  await page.mouse.click(at.x, at.y)
  const dialog = page.getByRole("dialog", { name: "ボックスの追加" })
  const body = dialog.getByLabel("本文", { exact: true })
  await body.fill("気をつける所")
  await body.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 3))
  const bar = dialog.getByRole("toolbar", { name: "本文の装飾" })
  await bar.getByRole("button", { name: "太字" }).click()
  await expect(body).toHaveValue("**気をつ**ける所")
  await bar.getByRole("button", { name: "注意" }).click()
  await expect(body).toHaveValue("**{warn:気をつ}**ける所")
  await dialog.getByRole("button", { name: "追加" }).click()
  const span = page.locator("[data-item] [data-line] span").first()
  await expect(span).toHaveText("気をつ")
  await expect(span).toHaveCSS("font-weight", "700")
  await expect(span).toHaveCSS("color", "rgb(217, 119, 6)")
  expect((await page.locator("[data-item] [data-line]").allTextContents()).join("")).toBe("気をつける所")
})

test("範囲を囲んだ色の中で色なしを押すと色が外れ、太字を押し直すと太字が外れる", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "箱" }).click()
  const at = await onPaper(page, 200, 150)
  await page.mouse.click(at.x, at.y)
  const dialog = page.getByRole("dialog", { name: "ボックスの追加" })
  const body = dialog.getByLabel("本文", { exact: true })
  const bar = dialog.getByRole("toolbar", { name: "本文の装飾" })
  await body.fill("{info:メモ}")
  await body.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(6, 8))
  await bar.getByRole("button", { name: "色なし" }).click()
  await expect(body).toHaveValue("メモ")
  await bar.getByRole("button", { name: "太字" }).click()
  await expect(body).toHaveValue("**メモ**")
  await bar.getByRole("button", { name: "太字" }).click()
  await expect(body).toHaveValue("メモ")
})
