// 形のパネル（base のツールボックス）: ドロワーの「形」のボタンで形のアイコンの格子を開き、形を押してから紙を押すと、その形の追加のダイアログが開く。
// 図面のパネルには絵の形（@matomezu/art）が並ぶ
import { expect, type Page, test } from "@playwright/test"
import { drawerTool } from "./drawer"

const paper = (page: Page) => page.getByRole("img", { name: "紙" })

async function flowchartBook(page: Page) {
  await page.goto("/")
  const trigger = page.locator('button[aria-haspopup="menu"]').first()
  await trigger.hover()
  await trigger.locator("xpath=../following-sibling::div[1]").getByRole("button", { name: "ホーム" }).click()
  await page.getByRole("button", { name: "新しいブック" }).click()
  const dialog = page.getByRole("dialog", { name: "新しいブック" })
  await page.keyboard.type("流れ")
  await dialog.getByLabel("ブックのタイプ").selectOption({ label: "フローチャート" })
  await dialog.getByRole("button", { name: "作成" }).click()
  await page.getByRole("button", { name: "ページを作る" }).click()
  await page.getByRole("dialog", { name: "新しいページ" }).getByRole("button", { name: "作成" }).click()
  await expect(paper(page)).toBeVisible()
}

test("「形」のボタンでパネルを開き、乗せたまま形を押すとドロワーごと閉じ、紙を押した所でその形の追加のダイアログが開く。Escape はパネルだけを閉じる", async ({
  page,
}) => {
  await flowchartBook(page)
  const tabs = (await page.getByRole("tablist").boundingBox())!
  await page.mouse.move(tabs.x + tabs.width - 20, tabs.y + tabs.height / 2)
  const tools = page.getByRole("toolbar", { name: "ツール" })
  const shapes = tools.getByRole("button", { name: "形", exact: true })
  await shapes.click()
  const panel = tools.getByRole("group", { name: "形" })
  await expect(panel).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(panel).toBeHidden()
  await shapes.click()
  await panel.getByRole("button", { name: "ひし形" }).hover()
  await panel.getByRole("button", { name: "ひし形" }).click()
  await expect(panel).toBeHidden()
  // ドロワーは下がって読み上げから外れるので、ボタンそのもので見る
  await expect(page.locator(`button[aria-label="形"]`)).toHaveAttribute("aria-pressed", "true")
  const p = (await paper(page).boundingBox())!
  await page.mouse.click(p.x + 200, p.y + 200)
  const add = page.getByRole("dialog", { name: "形の追加" })
  await expect(add).toBeVisible()
  await add.getByRole("button", { name: "追加" }).click()
  await expect(page.locator('[data-shape-kind="diamond"]')).toHaveCount(1)
})

test("図面のパネルの絵の形を置くと、絵の足元にキャプションを出し、つかめるのは左右の辺だけ", async ({ page }) => {
  await page.goto("/")
  await (await drawerTool(page, "形")).click()
  const panel = page.getByRole("toolbar", { name: "ツール" }).getByRole("group", { name: "形" })
  await panel.getByRole("button", { name: "スティックマン" }).click()
  const p = (await paper(page).boundingBox())!
  await page.mouse.click(p.x + 200, p.y + 150)
  const add = page.getByRole("dialog", { name: "絵の追加" })
  await add.getByLabel("キャプション").fill("利用者")
  await add.getByRole("button", { name: "追加" }).click()
  const item = page.locator("[data-item]").first()
  await expect(item.locator('[data-part="figure"]').first()).toBeVisible()
  await expect(item).toContainText("利用者")
  const grips = item.locator("[data-grip]")
  await expect(grips).toHaveCount(2)
  expect(await grips.evaluateAll(gs => gs.map(g => g.getAttribute("data-grip")))).toEqual(["left", "right"])
})
