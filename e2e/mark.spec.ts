import { expect, type Page, test } from "./fixtures"
import { addList, addRow } from "./helpers/list"
import { addBox, items } from "./helpers/paper"

const right = (box: { x: number; width: number } | null) => (box ? box.x + box.width : Number.NaN)

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
  await addBox(page, 200, 150, "一")
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
  await addBox(page, 200, 150, "一")
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
  await addBox(page, 200, 150, "一")
  const box = items(page).filter({ hasText: "一" })
  await box.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに示す" }).click()
  const picker = page.getByRole("group", { name: "マークを付ける" })
  await expect(picker.getByRole("button").first()).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(picker).toHaveCount(0)
})

test("箱の上の辺が画面の外に出ると、鳥はマークポインタ（鳥の顔の丸）に替わって画面の縁に付く。押すと紙がずれて箱が見え、鳥に戻る。びっくりマークは縁に寄って残り、押すと箱を見せる", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 900, height: 480 })
  await page.goto("/")
  await addBox(page, 200, 150, "一")
  await addBox(page, 500, 150, "二")
  await pickMark(page, items(page).filter({ hasText: "一" }), "インコ")
  await pickMark(page, items(page).filter({ hasText: "二" }), "びっくりマーク")
  const bird = page.getByRole("button", { name: "インコ", exact: true })
  const alert = page.getByRole("button", { name: "びっくりマーク", exact: true })
  await expect(bird).toHaveCount(1)
  const stage = (await page.locator("[data-stage]").boundingBox())!
  // 紙を上へずらして、箱を画面の上の外へ出す
  const away = async () => {
    await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height - 20)
    await page.mouse.wheel(0, 300)
  }
  await away()
  const pointer = page.getByRole("button", { name: "インコを見せる" })
  await expect(pointer).toHaveCount(1)
  await expect(bird).toHaveCount(0)
  const s = (await pointer.boundingBox())!
  expect(s.width).toBe(24)
  expect(Math.abs(s.y - stage.y - 4)).toBeLessThan(2) // 画面の上の縁に付く
  // びっくりマークも上の縁に寄って残る
  const alertPointer = page.getByRole("button", { name: "びっくりマークを見せる" })
  const a = (await alertPointer.boundingBox())!
  expect(Math.abs(a.y - stage.y - 4)).toBeLessThan(2)
  await pointer.click()
  await expect(bird).toHaveCount(1)
  await expect(pointer).toHaveCount(0)
  const box = (await items(page).filter({ hasText: "一" }).boundingBox())!
  expect(box.y).toBeGreaterThan(stage.y)
  // びっくりマークも、押すと付けた箱を見せる（「外す？」は出さない）
  await away()
  await alertPointer.click()
  await expect(alert).toHaveCount(1)
  await expect(page.getByRole("group", { name: "外す？" })).toHaveCount(0)
  expect((await items(page).filter({ hasText: "二" }).boundingBox())!.y).toBeGreaterThan(stage.y)
})

test("リストの中のスクロールで行の上の辺が隠れると、鳥はマークポインタに替わってリストの行の並びの縁に付き、リストが画面の外なら画面の縁に付く。押すとリストが画面に戻り、中もスクロールして行を見せる", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 560, height: 480 })
  await page.goto("/")
  const list = await addList(page, "多い")
  for (const n of [1, 2, 3, 4, 5]) await addRow(page, list, `行 ${n}`)
  const rows = list.locator("ul").locator("..")
  const last = list.getByRole("listitem").last()
  await pickMark(page, last, "文鳥")
  const bird = page.getByRole("button", { name: "文鳥", exact: true })
  const pointer = page.getByRole("button", { name: "文鳥を見せる" })
  await expect(bird).toHaveCount(1)
  // 行の並びを上へ戻して、印を付けた行をリストの下に隠す
  await rows.evaluate(el => {
    el.scrollTop = 0
  })
  await expect(pointer).toHaveCount(1)
  await expect(bird).toHaveCount(0)
  const seen = (await rows.boundingBox())!
  const p = (await pointer.boundingBox())!
  expect(Math.abs(p.y + p.height - (seen.y + seen.height - 4))).toBeLessThan(2) // 行の並びの下の縁に付く
  // 紙を左へずらして、リストごと画面の左の外へ出すと、画面の左の縁に付く
  const stage = (await page.locator("[data-stage]").boundingBox())!
  await page.mouse.move(stage.x + stage.width - 20, stage.y + 60)
  await page.mouse.wheel(800, 0)
  await expect.poll(async () => right(await rows.boundingBox())).toBeLessThan(stage.x)
  await expect.poll(async () => Math.abs((await pointer.boundingBox())!.x - stage.x - 4)).toBeLessThan(2)
  await pointer.click()
  await expect(bird).toHaveCount(1)
  await expect(pointer).toHaveCount(0)
  const box = (await rows.boundingBox())!
  const row = (await last.boundingBox())!
  expect(box.x).toBeGreaterThan(stage.x)
  expect(row.y).toBeGreaterThanOrEqual(box.y - 1)
  expect(row.y + row.height).toBeLessThanOrEqual(box.y + box.height + 1)
})
