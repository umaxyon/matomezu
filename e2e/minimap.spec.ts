// ミニマップ（base/minimap）: フッタのメニューで開閉するステージの左下のものと、右ボタンの長押しのアイコンから出すもの。
// 見えている範囲の四角をドラッグすると、紙がついて動く
import { expect, type Page, test } from "@playwright/test"

const paper = (page: Page) => page.getByRole("img", { name: "紙" })
const corner = (page: Page) => page.locator("[data-minimap=corner]")
const seen = (page: Page, where: "corner" | "picker") => page.locator(`[data-minimap=${where}] [data-minimap-seen]`)

// フッタのブック名に乗せて、せり上がるメニューのミニマップのボタン
async function toggle(page: Page) {
  const trigger = page.locator("button[aria-expanded]").first()
  await trigger.hover()
  return trigger.locator("xpath=following-sibling::div[1]").getByRole("button", { name: "ミニマップ" })
}

// 四角の真ん中をつかんで、下へ dy だけドラッグする
async function dragSeen(page: Page, where: "corner" | "picker", dy: number) {
  const box = (await seen(page, where).boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + dy, { steps: 5 })
  await page.mouse.up()
}

test("フッタのメニューで開くと、ステージの左下に紙の全体と見えている範囲が出る。四角をドラッグすると紙が動き、もう一度押すと閉じる", async ({
  page,
}) => {
  await page.goto("/")
  await expect(paper(page)).toBeVisible()
  const button = await toggle(page)
  await expect(button).toBeEnabled()
  await expect(button).toHaveAttribute("aria-pressed", "false")
  await button.click()
  await expect(corner(page)).toBeVisible()
  // ステージの左下
  const stage = (await page.getByRole("region", { name: "ステージ" }).boundingBox())!
  const map = (await corner(page).boundingBox())!
  expect(map.x - stage.x).toBeLessThan(20)
  expect(stage.y + stage.height - (map.y + map.height)).toBeLessThan(20)
  const before = (await paper(page).boundingBox())!.y
  await dragSeen(page, "corner", 15)
  await expect.poll(async () => (await paper(page).boundingBox())!.y).toBeLessThan(before - 20)
  await expect(await toggle(page)).toHaveAttribute("aria-pressed", "true")
  await (await toggle(page)).click()
  await expect(corner(page)).toHaveCount(0)
})

test("紙が収まっていると押せない。開いたあと収まると閉じる", async ({ page }) => {
  await page.goto("/")
  await expect(paper(page)).toBeVisible()
  await (await toggle(page)).click()
  await expect(corner(page)).toBeVisible()
  await page.setViewportSize({ width: 2000, height: 1400 })
  await expect(corner(page)).toHaveCount(0)
  const button = await toggle(page)
  await expect(button).toBeDisabled()
  await expect(button).toHaveAttribute("aria-pressed", "false")
})

test("右ボタンの長押しのアイコンのミニマップを押すと、アイコンの代わりにその場にミニマップが出る。ドラッグで紙が動き、Escape で閉じる", async ({
  page,
}) => {
  await page.goto("/")
  const p = (await paper(page).boundingBox())!
  const at = { x: p.x + 400, y: p.y + 300 }
  await page.mouse.move(at.x, at.y)
  await page.mouse.down({ button: "right" })
  await page.waitForTimeout(350)
  await page.mouse.up({ button: "right" })
  const picker = page.getByRole("toolbar", { name: "ツールの切り替え" })
  await picker.getByRole("button", { name: "ミニマップ" }).click()
  await expect(page.locator("[data-minimap=picker]")).toBeVisible()
  await expect(picker.getByRole("button")).toHaveCount(0)
  const before = (await paper(page).boundingBox())!.y
  // 並びから離れてドラッグしても閉じない
  await dragSeen(page, "picker", 30)
  await expect.poll(async () => (await paper(page).boundingBox())!.y).toBeLessThan(before - 20)
  await expect(page.locator("[data-minimap=picker]")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(picker).toHaveCount(0)
})
