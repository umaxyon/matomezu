import { expect, type Page, test } from "@playwright/test"
import { drawerTool } from "./drawer"

const items = (page: Page) => page.locator("[data-item]")
const stands = (page: Page) => page.locator("[data-stand]")

// 紙の (x, 150) に箱を置く
async function addBox(page: Page, x: number, caption: string) {
  await (await drawerTool(page, "箱")).click()
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  await page.mouse.click(paper.x + x, paper.y + 150)
  const dialog = page.getByRole("dialog", { name: "ボックスの追加" })
  await dialog.getByLabel("キャプション", { exact: true }).fill(caption)
  await dialog.getByRole("button", { name: "追加" }).click()
  await expect(dialog).toBeHidden()
}

test("箱の右クリックの「コメント」で、箱の右にコメントの下書きの吹き出しが開き、書いて付けると吹き出しで出る。たたむと右上にコメントの絵が出て、押すと開く。消すと無くなる", async ({
  page,
}) => {
  await page.goto("/")
  await addBox(page, 200, "一")
  const box = items(page).filter({ hasText: "一" })
  await box.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "コメント" }).click()
  const draft = page.getByRole("group", { name: "コメントを付ける" })
  const text = draft.getByLabel("コメント", { exact: true })
  await expect(text).toBeFocused()
  // 幅は決まった幅で、上の辺を箱にそろえ、書いた分だけ下へ伸びる
  const b = (await box.boundingBox())!
  const before = (await draft.boundingBox())!
  expect(Math.round(before.y)).toBe(Math.round(b.y))
  expect(before.x).toBeGreaterThan(b.x + b.width)
  await text.fill("ここを直して\n二行目\n三行目")
  const after = (await draft.boundingBox())!
  expect(Math.round(after.y)).toBe(Math.round(before.y))
  expect(after.height).toBeGreaterThan(before.height)
  expect(Math.round(after.width)).toBe(Math.round(before.width))
  await draft.getByRole("button", { name: "付ける" }).click()
  await expect(draft).toHaveCount(0)

  const bubble = page.getByRole("group", { name: "コメント", exact: true })
  await expect(bubble).toContainText("ここを直して")
  await bubble.getByLabel("返す", { exact: true }).fill("まだです")
  await bubble.getByRole("button", { name: "返す" }).click()
  await expect(bubble).toContainText("まだです")

  await bubble.getByRole("button", { name: "たたむ" }).click()
  const mark = page.getByRole("button", { name: "コメントを開く" })
  await expect(mark).toBeVisible()
  await mark.click()
  await bubble.getByRole("button", { name: "消す" }).click()
  await expect(stands(page)).toHaveCount(0)
})

test("コメントの下書きは Esc で付けずに閉じる。指すだけのマーク（文の無い「指すだけ」）は、吹き出しを出さず箱の上の辺に絵を出す", async ({
  page,
}) => {
  await page.goto("/")
  await addBox(page, 200, "一")
  const box = items(page).filter({ hasText: "一" })
  await box.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "コメント" }).click()
  const draft = page.getByRole("group", { name: "コメントを付ける" })
  await draft.getByLabel("コメント", { exact: true }).press("Escape")
  await expect(draft).toHaveCount(0)
  await expect(items(page)).toHaveCount(1)

  await box.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "コメント" }).click()
  await draft.getByText("指すだけ").click()
  await draft.getByRole("button", { name: "付ける" }).click()
  const walker = page.getByRole("button", { name: "コメントを開く" })
  await expect(walker).toBeVisible()
  const b = (await box.boundingBox())!
  const w = (await walker.boundingBox())!
  expect(w.y + w.height).toBeLessThanOrEqual(b.y + 5)
})
