// ツリーのブック（@matomezu/tree）: 道具の組は編集とハンド。編集の間はホイール・ミニマップ・紙のドラッグのどれでも紙をずらさず、ハンドで紙をずらして見る
import { expect, type Page, test } from "@playwright/test"

const paper = (page: Page) => page.getByRole("img", { name: "紙" })

async function fromMenu(page: Page, name: string) {
  const trigger = page.locator("button[aria-expanded]").first()
  await trigger.hover()
  return trigger.locator("xpath=following-sibling::div[1]").getByRole("button", { name })
}

// マスターでツリーのブックを作り、根だけのページを作る
async function treeBook(page: Page) {
  await page.goto("/")
  await (await fromMenu(page, "ホーム")).click()
  await page.getByRole("button", { name: "新しいブック" }).click()
  const dialog = page.getByRole("dialog", { name: "新しいブック" })
  await page.keyboard.type("木")
  await dialog.getByLabel("ブックのタイプ").selectOption({ label: "ツリー" })
  await dialog.getByRole("button", { name: "作成" }).click()
  await page.getByRole("button", { name: "ページを作る" }).click()
  const add = page.getByRole("dialog", { name: "新しいページ" })
  await add.getByLabel("根のキャプション").fill("根")
  await add.getByRole("button", { name: "作る" }).click()
  await expect(paper(page)).toBeVisible()
}

const paperAt = async (page: Page) => (await paper(page).boundingBox())!

test("ツリーの道具は編集とハンド。編集の間は、ホイールでも紙のドラッグでも紙が動かず、ハンドにすると動く", async ({
  page,
}) => {
  await treeBook(page)
  const tool = page.getByRole("button", { name: "編集ツール" })
  await expect(tool).toBeVisible()
  const before = await paperAt(page)
  const stage = (await page.getByRole("region", { name: "ステージ" }).boundingBox())!
  const x = stage.x + stage.width / 2
  const y = stage.y + stage.height / 2
  await page.mouse.move(x, y)
  await page.mouse.wheel(0, 200)
  await page.mouse.down()
  await page.mouse.move(x, y - 80, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(100)
  expect((await paperAt(page)).y).toBe(before.y)
  await tool.click()
  await expect(page.getByRole("button", { name: "ハンドツール" })).toBeVisible()
  await page.mouse.move(x, y)
  await page.mouse.wheel(0, 200)
  await expect.poll(async () => (await paperAt(page)).y).toBeLessThan(before.y)
})

test("編集の間は、左下のミニマップの四角をドラッグしても紙が動かない。ハンドにすると動く", async ({ page }) => {
  await treeBook(page)
  await (await fromMenu(page, "ミニマップ")).click()
  const seen = page.locator("[data-minimap=corner] [data-minimap-seen]")
  await expect(seen).toBeVisible()
  const drag = async () => {
    const box = (await seen.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 15, { steps: 5 })
    await page.mouse.up()
  }
  const before = await paperAt(page)
  await drag()
  await page.waitForTimeout(100)
  expect((await paperAt(page)).y).toBe(before.y)
  await page.getByRole("button", { name: "編集ツール" }).click()
  await expect(page.getByRole("button", { name: "ハンドツール" })).toBeVisible()
  // ポインタが離れて閉じたミニマップを、もう一度開く
  if (!(await seen.isVisible())) await (await fromMenu(page, "ミニマップ")).click()
  await drag()
  await expect.poll(async () => (await paperAt(page)).y).toBeLessThan(before.y - 20)
})
