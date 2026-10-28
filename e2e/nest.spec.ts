// 内包: 付け替えの道具のドラッグで、箱を内包ボックスの中へ入れ、外へ出す
import { expect, type Page, test } from "@playwright/test"

// キャプションの文字を含む形のうち、一番内側の形（親は子の文字も含むので、並びの最後）
const item = (page: Page, caption: string) => page.locator("[data-item]").filter({ hasText: caption }).last()

// 箱を置こうとして紙の左上から (x, y) で押し、開いた追加のダイアログでキャプションを入れて追加する
async function addBox(page: Page, x: number, y: number, caption: string) {
  await page.getByRole("button", { name: "箱" }).click()
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  await page.mouse.click(paper.x + x, paper.y + y)
  const dialog = page.getByRole("dialog", { name: "ボックスの追加" })
  await dialog.getByLabel("キャプション", { exact: true }).fill(caption)
  await dialog.getByRole("button", { name: "追加" }).click()
  await expect(dialog).toBeHidden()
}

// 形の左上の近くをつかんで、(dx, dy) だけドラッグする。離す前に、入る先の枠の出た形を返す
async function drag(page: Page, caption: string, dx: number, dy: number) {
  const box = (await item(page, caption).boundingBox())!
  await page.mouse.move(box.x + 10, box.y + 10)
  await page.mouse.down()
  await page.mouse.move(box.x + 10 + dx, box.y + 10 + dy, { steps: 8 })
  const target = await page.locator('[data-drop-target="true"]').count()
  await page.mouse.up()
  return target
}

test("付け替えの道具で箱を内包ボックスの上へドラッグすると、入る先に枠が出て、離すとその中に入る。紙へドラッグすると外へ出る", async ({
  page,
}) => {
  await page.goto("/")
  await addBox(page, 100, 100, "親")
  await addBox(page, 500, 100, "子")
  await page.getByRole("button", { name: "選択ツール" }).click()
  await expect(page.locator('section[data-tool="@matomezu/paper:reparent"]')).toHaveCount(1)
  const parent = (await item(page, "親").boundingBox())!
  const child = (await item(page, "子").boundingBox())!
  // ポインタ（子の左上から 10, 10 の所）を、親の真ん中へ
  const into = await drag(
    page,
    "子",
    parent.x + parent.width / 2 - child.x - 10,
    parent.y + parent.height / 2 - child.y - 10,
  )
  expect(into).toBe(1)
  await expect(item(page, "親").locator("[data-item]")).toHaveCount(1)
  const out = await drag(page, "子", 0, 300)
  expect(out).toBe(0)
  await expect(item(page, "親").locator("[data-item]")).toHaveCount(0)
})
