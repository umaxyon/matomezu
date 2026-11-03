import { expect, type Page, test } from "@playwright/test"
import { footerMenuTool } from "./footer-menu"

const items = (page: Page) => page.locator("[data-item]")
const stands = (page: Page) => page.locator("[data-stand]")

// 紙の (x, 150) に箱を置く
async function addBox(page: Page, x: number, caption: string) {
  await (await footerMenuTool(page, "箱")).click()
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  await page.mouse.click(paper.x + x, paper.y + 150)
  const dialog = page.getByRole("dialog", { name: "ボックスの追加" })
  await dialog.getByLabel("キャプション", { exact: true }).fill(caption)
  await dialog.getByRole("button", { name: "追加" }).click()
  await expect(dialog).toBeHidden()
}

const panel = (page: Page) => page.getByRole("complementary", { name: "右サイドパネル" })

test("箱の右クリックの「AIに伝言」で、箱の右に伝言の下書きの吹き出しが開き、書いて付けると文の始めだけの吹き出しで出る。押すと右サイドパネルに出て、文を直して保存できる。消すと無くなる", async ({
  page,
}) => {
  await page.goto("/")
  await addBox(page, 200, "一")
  const box = items(page).filter({ hasText: "一" })
  await box.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに伝言" }).click()
  const draft = page.getByRole("group", { name: "伝言を付ける" })
  const text = draft.getByLabel("伝言", { exact: true })
  await expect(text).toBeFocused()
  await expect(draft.getByLabel("伝わったら自動で消す")).toBeChecked()
  // 幅は決まった幅で、上の辺を箱にそろえ、書いた分だけ下へ伸びる
  const b = (await box.boundingBox())!
  const before = (await draft.boundingBox())!
  expect(Math.round(before.y)).toBe(Math.round(b.y))
  expect(before.x).toBeGreaterThan(b.x + b.width)
  await text.fill("ここを直してほしい、二行目まで読んでから\n三行目")
  const after = (await draft.boundingBox())!
  expect(Math.round(after.y)).toBe(Math.round(before.y))
  expect(after.height).toBeGreaterThan(before.height)
  expect(Math.round(after.width)).toBe(Math.round(before.width))
  await draft.getByRole("button", { name: "付ける" }).click()
  await expect(draft).toHaveCount(0)

  // 吹き出しは文の始めの 20 字と …
  const bubble = page.getByRole("button", { name: "伝言を開く" })
  await expect(bubble).toHaveText("ここを直してほしい、二行目まで読んでから…")
  await bubble.click()
  const field = panel(page).getByLabel("伝言", { exact: true })
  await expect(field).toHaveValue("ここを直してほしい、二行目まで読んでから\n三行目")
  const save = panel(page).getByRole("button", { name: "保存" })
  await expect(save).toBeDisabled()
  await field.fill("短く")
  await save.click()
  await expect(bubble).toHaveText("短く")
  await panel(page).getByRole("button", { name: "消す" }).click()
  await expect(stands(page)).toHaveCount(0)
  await expect(panel(page)).toHaveCount(0)
})

test("伝言の下書きは Esc で付けずに閉じる。文が無ければ付けられない", async ({ page }) => {
  await page.goto("/")
  await addBox(page, 200, "一")
  const box = items(page).filter({ hasText: "一" })
  await box.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに伝言" }).click()
  const draft = page.getByRole("group", { name: "伝言を付ける" })
  await expect(draft.getByRole("button", { name: "付ける" })).toBeDisabled()
  await draft.getByLabel("伝言", { exact: true }).press("Escape")
  await expect(draft).toHaveCount(0)
  await expect(items(page)).toHaveCount(1)
})
