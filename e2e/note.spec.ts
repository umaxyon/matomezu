import { expect, type Page, test } from "./fixtures"
import { panel, writeNote } from "./helpers/note"
import { addBox, items } from "./helpers/paper"

const stands = (page: Page) => page.locator("[data-stand]")

test("箱の右クリックの「AIに伝言」で右サイドパネルが開き、書いて付けると文の始めだけの吹き出しで出る。押すと右サイドパネルに出て、文を直して保存できる。消すと無くなる", async ({
  page,
}) => {
  await page.goto("/")
  await addBox(page, 200, 150, "一")
  const box = items(page).filter({ hasText: "一" })
  await box.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに伝言" }).click()
  const text = panel(page).getByLabel("伝言", { exact: true })
  await expect(text).toBeFocused()
  // 付ける先は名前のバッジで出る（カレントは押されている見た目）
  await expect(panel(page).getByRole("button", { name: "一" })).toHaveAttribute("aria-pressed", "true")
  const add = panel(page).getByRole("button", { name: "付ける" })
  await expect(add).toBeDisabled()
  await text.fill("ここを直してほしい、二行目まで読んでから\n三行目")
  await add.click()
  await expect(panel(page)).toHaveCount(0)

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
  await expect(panel(page)).toHaveCount(0)
  await expect(bubble).toHaveText("短く")
  await bubble.click()
  const removeOnRead = panel(page).getByLabel("伝わったら自動で消す")
  await expect(removeOnRead).toBeChecked()
  await removeOnRead.uncheck()
  await expect(removeOnRead).not.toBeChecked()
  await panel(page).getByRole("button", { name: "消す" }).click()
  await expect(stands(page)).toHaveCount(0)
  await expect(panel(page)).toHaveCount(0)
})

test("書いている間は、物を押すと付ける先が替わり、Ctrl+クリックで足す（押しても物は動かない）。バッジを押すとカレントが替わる。付けた伝言を開いて付ける先を変えて保存できる。何も無い所を押すと付けずに閉じ、選択も外れる", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  await addBox(page, 100, 150, "一")
  await addBox(page, 400, 150, "二")
  const one = items(page).filter({ hasText: "一" })
  const two = items(page).filter({ hasText: "二" })
  await one.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに伝言" }).click()
  const badge = (name: string) => panel(page).getByRole("button", { name, exact: true })
  await panel(page).getByLabel("伝言", { exact: true }).fill("両方")
  const before = (await two.boundingBox())!
  await two.click()
  await expect(badge("二")).toHaveAttribute("aria-pressed", "true")
  await expect(badge("一")).toHaveCount(0)
  const after = (await two.boundingBox())!
  expect(Math.round(after.width)).toBe(Math.round(before.width))
  await page.keyboard.down("Control")
  await one.click()
  await page.keyboard.up("Control")
  await expect(badge("一")).toHaveAttribute("aria-pressed", "true")
  await expect(badge("二")).toHaveAttribute("aria-pressed", "false")
  await badge("二").click()
  await expect(badge("二")).toHaveAttribute("aria-pressed", "true")
  // 書きかけは付ける先を替えても残る
  await expect(panel(page).getByLabel("伝言", { exact: true })).toHaveValue("両方")
  await panel(page).getByRole("button", { name: "付ける" }).click()
  await expect(panel(page)).toHaveCount(0)
  await expect(one).toHaveAttribute("data-selected", "false")
  // 吹き出しはカレント（二）のそば
  const bubble = page.getByRole("button", { name: "伝言を開く" })
  const b = (await bubble.boundingBox())!
  const t = (await two.boundingBox())!
  expect(b.x).toBeGreaterThan(t.x + t.width - 1)
  // 付けた伝言を開くと、付けた先を選んだ状態になる。一だけにして保存すると、吹き出しは一のそばへ
  await bubble.click()
  await expect(badge("一")).toBeVisible()
  await one.click()
  await expect(badge("二")).toHaveCount(0)
  await panel(page).getByRole("button", { name: "保存" }).click()
  await expect(panel(page)).toHaveCount(0)
  const o = (await one.boundingBox())!
  const moved = (await bubble.boundingBox())!
  expect(Math.abs(moved.x - (o.x + o.width))).toBeLessThan(40)
  // 何も無い所を押すと、付けずに閉じる
  await two.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに伝言" }).click()
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  await page.mouse.click(paper.x + 30, paper.y + 500)
  await expect(panel(page)).toHaveCount(0)
  await expect(two).toHaveAttribute("data-selected", "false")
  await expect(bubble).toHaveCount(1)
})

test("書いている間は Esc で付けずに閉じる", async ({ page }) => {
  await page.goto("/")
  await addBox(page, 200, 150, "一")
  const box = items(page).filter({ hasText: "一" })
  await box.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに伝言" }).click()
  await panel(page).getByLabel("伝言", { exact: true }).fill("やめる")
  await panel(page).getByLabel("伝言", { exact: true }).press("Escape")
  await expect(panel(page)).toHaveCount(0)
  await expect(page.getByRole("button", { name: "伝言を開く" })).toHaveCount(0)
})

test("書いている間は付ける先に鳥が出て、付ける先を足すと鳥も増える。鳥を押すと「外す？」が出て、「はい」で付ける先から外れる。最後の 1 羽を外すと閉じる", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  await addBox(page, 100, 150, "一")
  await addBox(page, 400, 150, "二")
  const one = items(page).filter({ hasText: "一" })
  const two = items(page).filter({ hasText: "二" })
  await one.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに伝言" }).click()
  const birds = page.locator("[data-note-bird]")
  await expect(birds).toHaveCount(1)
  await page.keyboard.down("Control")
  await two.click()
  await page.keyboard.up("Control")
  await expect(birds).toHaveCount(2)
  const badge = (name: string) => panel(page).getByRole("button", { name, exact: true })
  await page.locator("[data-note-bird]").first().click()
  await page.getByRole("group", { name: "外す？" }).getByRole("button", { name: "はい" }).click()
  await expect(badge("一")).toHaveCount(0)
  await expect(badge("二")).toHaveAttribute("aria-pressed", "true")
  await expect(birds).toHaveCount(1)
  await birds.first().click()
  await page.getByRole("group", { name: "外す？" }).getByRole("button", { name: "はい" }).click()
  await expect(panel(page)).toHaveCount(0)
  await expect(birds).toHaveCount(0)
})

test("書いている間に別の伝言の吹き出しを押すと、吹き出しの物を押したのと同じに付ける先が替わり、書きかけは残る。Ctrl+クリックなら足す", async ({
  page,
}) => {
  await page.goto("/")
  await addBox(page, 100, 150, "一")
  await addBox(page, 400, 150, "二")
  const one = items(page).filter({ hasText: "一" })
  const two = items(page).filter({ hasText: "二" })
  await writeNote(page, one, "前の伝言")
  await two.click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "AIに伝言" }).click()
  const text = panel(page).getByLabel("伝言", { exact: true })
  await text.fill("書きかけ")
  const badge = (name: string) => panel(page).getByRole("button", { name, exact: true })
  const bubble = page.getByRole("button", { name: "伝言を開く" })
  await bubble.click()
  await expect(badge("一")).toHaveAttribute("aria-pressed", "true")
  await expect(badge("二")).toHaveCount(0)
  await expect(text).toHaveValue("書きかけ")
  await two.click()
  await page.keyboard.down("Control")
  await bubble.click()
  await page.keyboard.up("Control")
  await expect(badge("一")).toHaveAttribute("aria-pressed", "true")
  await expect(badge("二")).toHaveCount(1)
  await expect(text).toHaveValue("書きかけ")
})
