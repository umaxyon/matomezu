import { expect, type Page, test } from "@playwright/test"

const picker = (page: Page) => page.getByRole("toolbar", { name: "ツールの切り替え" })

async function paperPoint(page: Page, x: number, y: number) {
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  return { x: paper.x + x, y: paper.y + y }
}

async function longPress(page: Page, at: { x: number; y: number }) {
  await page.mouse.move(at.x, at.y)
  await page.mouse.down({ button: "right" })
  await page.waitForTimeout(350)
}

test("紙の上で右ボタンを長押しすると、ポインタの近くに道具のアイコンが出て、右クリックのメニューは出ない。ハンドを押すとハンドになる", async ({
  page,
}) => {
  await page.goto("/")
  const at = await paperPoint(page, 400, 300)
  await longPress(page, at)
  await expect(picker(page)).toBeVisible()
  await page.mouse.up({ button: "right" })
  await expect(page.getByRole("menu")).toHaveCount(0)
  const buttons = picker(page).getByRole("button")
  await expect(buttons).toHaveCount(3)
  await expect(picker(page).getByRole("button", { name: "選択ツール" })).toHaveAttribute("aria-pressed", "true")
  // 道具の組の並び（選択・付け替え・ハンド）で、横並びでポインタの上（真ん中が付け替え）
  const middle = (await picker(page).getByRole("button", { name: "付け替えツール" }).boundingBox())!
  expect(middle.y + middle.height).toBeLessThan(at.y)
  expect(Math.abs(middle.x + middle.width / 2 - at.x)).toBeLessThan(30)
  await picker(page).getByRole("button", { name: "ハンドツール" }).click()
  await expect(picker(page)).toHaveCount(0)
  await expect(page.getByRole("button", { name: "ハンドツール" })).toBeVisible()
})

test("短い右クリックはメニューを出す。押している間に動けば長押しにならず、離したときにメニューが出る", async ({
  page,
}) => {
  await page.goto("/")
  const at = await paperPoint(page, 400, 300)
  await page.mouse.click(at.x, at.y, { button: "right" })
  await expect(page.getByRole("menu")).toBeVisible()
  await page.keyboard.press("Escape")
  await page.mouse.move(at.x, at.y)
  await page.mouse.down({ button: "right" })
  await page.mouse.move(at.x + 20, at.y, { steps: 3 })
  await page.waitForTimeout(350)
  await expect(picker(page)).toHaveCount(0)
  await page.mouse.up({ button: "right" })
  await expect(page.getByRole("menu")).toBeVisible()
})

test("付け替えを押すと付け替えになる。Escape・離れる・外を押すと閉じる。Space で開いて、もう一度 Space で閉じる", async ({
  page,
}) => {
  await page.goto("/")
  const at = await paperPoint(page, 400, 300)
  await longPress(page, at)
  await page.mouse.up({ button: "right" })
  await picker(page).getByRole("button", { name: "付け替えツール" }).click()
  await expect(picker(page)).toHaveCount(0)
  await expect(page.getByRole("button", { name: "付け替えツール" })).toBeVisible()

  await longPress(page, at)
  await page.mouse.up({ button: "right" })
  await page.keyboard.press("Escape")
  await expect(picker(page)).toHaveCount(0)

  await longPress(page, at)
  await page.mouse.up({ button: "right" })
  await page.mouse.move(at.x + 300, at.y + 200, { steps: 5 })
  await expect(picker(page)).toHaveCount(0)

  await longPress(page, at)
  await page.mouse.up({ button: "right" })
  await page.mouse.click(at.x + 30, at.y + 30)
  await expect(picker(page)).toHaveCount(0)

  await page.mouse.move(at.x, at.y)
  await page.keyboard.press("Space")
  await expect(picker(page)).toBeVisible()
  const select = (await picker(page).getByRole("button", { name: "選択ツール" }).boundingBox())!
  expect(Math.abs(select.y + select.height - at.y)).toBeLessThan(60)
  await page.keyboard.press("Space")
  await expect(picker(page)).toHaveCount(0)
})

test("分けて別の図面を開いても、道具は左右で同じ。左でハンドにすると右もハンドになる", async ({ page }) => {
  await page.goto("/")
  const trigger = page.locator("button[aria-expanded]").first()
  await trigger.hover()
  await trigger.locator("xpath=following-sibling::div[1]").getByRole("button", { name: "画面を分割" }).click()
  const stages = page.getByRole("region", { name: "ステージ" })
  const input = stages.nth(1).getByRole("combobox", { name: "ブックを探す" })
  await input.click()
  await input.pressSequentially("振り返り")
  await input.press("Enter")
  await expect(page.getByRole("img", { name: "紙" })).toHaveCount(2)
  const left = (await page.getByRole("img", { name: "紙" }).first().boundingBox())!
  await longPress(page, { x: left.x + 200, y: left.y + 200 })
  await page.mouse.up({ button: "right" })
  await picker(page).getByRole("button", { name: "ハンドツール" }).click()
  await expect(stages.nth(0)).toHaveAttribute("data-tool", "@matomezu/base:hand")
  await expect(stages.nth(1)).toHaveAttribute("data-tool", "@matomezu/base:hand")
  await expect(page.getByRole("button", { name: "ハンドツール" })).toHaveCount(2)
})
