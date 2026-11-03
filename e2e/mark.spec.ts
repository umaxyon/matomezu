import { expect, type Page, test } from "@playwright/test"
import { footerMenuTool } from "./footer-menu"

const items = (page: Page) => page.locator("[data-item]")

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

async function pickMark(page: Page, box: ReturnType<typeof items>, kind: string) {
  await box.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに示す" }).click()
  const picker = page.getByRole("group", { name: "マークを付ける" })
  await expect(picker.getByRole("button")).toHaveCount(6)
  await picker.getByRole("button", { name: kind }).click()
  await expect(picker).toHaveCount(0)
}

// 飛んでくる・顔を出す動きは単体のテスト（mark-flight）が見る。ここは動きを減らす設定で、降りた所だけを見る
test("箱の右クリックの「AIに示す」で 6 つの種類を選ぶスタンドが出て、選んだ鳥が箱の上の辺に乗る。押すと「外す？」が出て、はいで外れる", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  await addBox(page, 200, "一")
  const box = items(page).filter({ hasText: "一" })
  await pickMark(page, box, "ツナギドリ")
  const bird = page.getByRole("button", { name: "ツナギドリ" })
  await expect(bird).toHaveCount(1)
  // 足元は箱の上の辺のあたり
  const b = (await box.boundingBox())!
  const w = (await bird.boundingBox())!
  expect(Math.abs(w.y + w.height - b.y)).toBeLessThan(12)
  await bird.click()
  const ask = page.getByRole("group", { name: "外す？" })
  await expect(ask).toBeVisible()
  // 鳥から「はい」へ、ポインタを少しずつ動かしても吹き出しは消えない
  const yes = page.getByRole("button", { name: "はい" })
  const y = (await yes.boundingBox())!
  await page.mouse.move(y.x + y.width / 2, y.y + y.height / 2, { steps: 20 })
  await expect(ask).toBeVisible()
  await page.mouse.down()
  await page.mouse.up()
  await expect(bird).toHaveCount(0)
})

test("1 つの箱のマークは 1 つで、別の種類を選ぶと置き換わる。びっくりマークは右上の角に出て、ほかを押すかポインタが離れると「外す？」が隠れる", async ({
  page,
}) => {
  await page.goto("/")
  await addBox(page, 200, "一")
  const box = items(page).filter({ hasText: "一" })
  await pickMark(page, box, "フクロウ")
  await pickMark(page, box, "びっくりマーク")
  await expect(page.getByRole("button", { name: "フクロウ" })).toHaveCount(0)
  const alert = page.getByRole("button", { name: "びっくりマーク" })
  const b = (await box.boundingBox())!
  const a = (await alert.boundingBox())!
  expect(a.x + a.width / 2).toBeGreaterThan(b.x + b.width - 20)
  expect(a.y + a.height / 2).toBeLessThan(b.y + 20)
  await alert.click()
  const ask = page.getByRole("group", { name: "外す？" })
  await expect(ask).toBeVisible()
  await page.mouse.click(10, 400)
  await expect(ask).toHaveCount(0)
  await expect(alert).toHaveCount(1)
  // ポインタが離れたまま少し経っても隠れる
  await alert.click()
  await expect(ask).toBeVisible()
  await page.mouse.move(10, 400)
  await expect(ask).toHaveCount(0)
})

test("種類を選ぶスタンドは Esc で付けずに閉じる", async ({ page }) => {
  await page.goto("/")
  await addBox(page, 200, "一")
  const box = items(page).filter({ hasText: "一" })
  await box.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに示す" }).click()
  const picker = page.getByRole("group", { name: "マークを付ける" })
  await expect(picker.getByRole("button").first()).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(picker).toHaveCount(0)
})

test("箱の上の辺が画面の外に出ると、鳥は画面の縁の印（鳥の顔の丸）に替わる。押すと紙がずれて箱が見え、鳥に戻る。びっくりマークは縁に寄って残る", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 900, height: 480 })
  await page.goto("/")
  await addBox(page, 200, "一")
  await addBox(page, 500, "二")
  await pickMark(page, items(page).filter({ hasText: "一" }), "インコ")
  await pickMark(page, items(page).filter({ hasText: "二" }), "びっくりマーク")
  const bird = page.getByRole("button", { name: "インコ", exact: true })
  await expect(bird).toHaveCount(1)
  const stage = (await page.locator("[data-stage]").boundingBox())!
  // 紙を上へずらして、箱を画面の上の外へ出す
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height - 20)
  await page.mouse.wheel(0, 300)
  const sign = page.getByRole("button", { name: "インコを見せる" })
  await expect(sign).toHaveCount(1)
  await expect(bird).toHaveCount(0)
  const s = (await sign.boundingBox())!
  expect(s.width).toBe(24)
  expect(Math.abs(s.y - stage.y - 4)).toBeLessThan(2) // 画面の上の縁に付く
  // びっくりマークも上の縁に寄って残る
  const alert = (await page.getByRole("button", { name: "びっくりマーク" }).boundingBox())!
  expect(Math.abs(alert.y - stage.y - 4)).toBeLessThan(2)
  await sign.click()
  await expect(bird).toHaveCount(1)
  await expect(sign).toHaveCount(0)
  const box = (await items(page).filter({ hasText: "一" }).boundingBox())!
  expect(box.y).toBeGreaterThan(stage.y)
})
