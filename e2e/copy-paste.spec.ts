// 図面のコピー・貼り付け: 選んだ箱を Ctrl+C で写して Ctrl+V で貼ると、同じ箱が増えて貼った箱が選ばれる。Ctrl+Z で 1 段戻る。右クリックのメニューにも出る。
// 写しは OS のクリップボードにも書くので、別のタブの Ctrl+V でも貼れる
import { BOOK_SCREEN_URL, expect, startingAtFirstBook, test } from "./fixtures"
import { addBox, items } from "./helpers/paper"

test("箱を選んで Ctrl+C・Ctrl+V で貼ると箱が増えて貼った箱が選ばれ、Ctrl+Z で 1 段戻る。Ctrl+D は選んだ箱を複製する", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await addBox(page, 100, 150)
  await expect(items(page)).toHaveCount(1)
  const box = (await items(page).first().boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(items(page).first()).toHaveAttribute("data-selected", "true")
  await page.keyboard.press("Control+c")
  await page.keyboard.press("Control+v")
  await expect(items(page)).toHaveCount(2)
  await expect(page.locator('[data-item][data-selected="true"]')).toHaveCount(1)
  await page.keyboard.press("Control+z")
  await expect(items(page)).toHaveCount(1)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.keyboard.press("Control+d")
  await expect(items(page)).toHaveCount(2)
})

test("箱を右クリックしたメニューから切り取って、紙を右クリックしたメニューから貼る", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  await addBox(page, 100, 150)
  const box = (await items(page).first().boundingBox())!
  await items(page).first().click({ button: "right" })
  await page.getByRole("menuitem", { name: "切り取り" }).click()
  await expect(items(page)).toHaveCount(0)
  await page.mouse.click(box.x + 400, box.y + 200, { button: "right" })
  await page.getByRole("menuitem", { name: "貼り付け" }).click()
  await expect(items(page)).toHaveCount(1)
})

test("メニューから写した箱を、別のタブで Ctrl+V で貼る", async ({ page, context }) => {
  await page.goto(BOOK_SCREEN_URL)
  await addBox(page, 100, 150)
  await items(page).first().click({ button: "right" })
  await page.getByRole("menuitem", { name: "コピー" }).click()
  const other = startingAtFirstBook(await context.newPage())
  await other.goto(BOOK_SCREEN_URL)
  await expect(items(other)).toHaveCount(1)
  const box = (await items(other).first().boundingBox())!
  await other.mouse.click(box.x + 400, box.y + 200)
  await other.keyboard.press("Control+v")
  await expect(items(other)).toHaveCount(2)
})
