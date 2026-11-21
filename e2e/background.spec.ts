// 背景（ページの slide）: 図面のページで、中身の下に敷かれ、ふだんは触れない。フッタの「背景を編集」ボタンかページの右クリックのメニューで背景編集モードに入ると、
// 中身が薄くなって触れず、ページタブが消え、帯が出て、背景の形を選んで直せる。終了・ボタンをもう一度・Escape で出る。印刷には、中身の載った印刷区画にだけ背景が出る（印刷対象で変えられる）
import { drawingPage, testBook, withSlide } from "../test/lineup"
import { BOOK_SCREEN_URL, expect, type Page, test } from "./fixtures"
import { band } from "./helpers/background"
import { footerMenuTool } from "./helpers/footer-menu"
import { addBox, items, onPaper } from "./helpers/paper"
import { fromMenu } from "./helpers/stage-menu"

const backdrop = {
  id: "bg1",
  x: 100,
  y: 100,
  item: "@matomezu/slide:slide-ellipse",
  w: 300,
  h: 200,
  props: { fill: "#f6c177", stroke: "#286983", width: 3 },
}

test.use({
  books: [
    testBook("b1", "図面", [
      withSlide(drawingPage("p1"), [backdrop]),
      withSlide(drawingPage("p2", { title: "ページ 2" }), [backdrop]),
    ]),
  ],
})

const bg = (page: Page) => page.locator('[data-item="bg1"]')

async function enter(page: Page) {
  await (await fromMenu(page, "背景を編集")).click()
  await expect(band(page)).toBeVisible()
}

test("背景はふだん描かれるだけで触れず、背景編集モードに入ると、ページタブが消え、帯が出て、背景の形を選んで消せる。終了で戻る", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await expect(bg(page)).toHaveCount(1)
  await expect(page.getByRole("tab")).toHaveCount(2)
  await addBox(page, 600, 400, "中身の箱")
  // ふだんは、背景の形を押しても選べない（つまみもバーも出ない）
  const box = (await bg(page).boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.locator("[data-grip]")).toHaveCount(0)
  await enter(page)
  await expect(page.getByRole("tab")).toHaveCount(0)
  // 中身は薄くして触れない（押しても箱は選ばれない）
  await expect(page.locator("[data-content-dimmed]")).toHaveCount(1)
  // 背景の形を押すと選べ、Delete で消せる
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.locator("[data-grip]").first()).toBeVisible()
  await page.keyboard.press("Delete")
  await expect(bg(page)).toHaveCount(0)
  await band(page).getByRole("button", { name: "終了" }).click()
  await expect(band(page)).toHaveCount(0)
  await expect(page.getByRole("tab")).toHaveCount(2)
  await expect(items(page).filter({ hasText: "中身の箱" })).toHaveCount(1)
})

test("「コンテンツを隠す」を押している間は中身を描かず、モードを出ると戻る。フッタのボタンをもう一度押すか Escape で出る", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await addBox(page, 600, 400, "中身の箱")
  await enter(page)
  await band(page).getByRole("button", { name: "コンテンツを隠す" }).click()
  await expect(page.locator('[data-content-hidden="true"]')).toHaveCount(1)
  await (await fromMenu(page, "背景を編集")).click() // もう一度押すと出る
  await expect(band(page)).toHaveCount(0)
  await expect(page.locator("[data-content-dimmed]")).toHaveCount(0)
  await enter(page)
  await expect(page.locator('[data-content-hidden="true"]')).toHaveCount(0) // 入り直すと見せる
  await page.keyboard.press("Escape")
  await expect(band(page)).toHaveCount(0)
})

test("ページのタブの右クリックのメニューの「背景を編集」で、そのページを開いて背景編集モードに入り、ページは替わらない", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await page.getByRole("tab", { name: "ページ 2" }).click({ button: "right" })
  await page.getByRole("menuitem", { name: "背景を編集" }).click()
  await expect(band(page)).toBeVisible()
  await expect(page.getByRole("tab")).toHaveCount(0)
})

test("印刷プレビューには、中身の載ったページにだけ背景が敷かれる。背景編集モードのフッタの「印刷対象」を「必ず」にすると、中身の無いページにも出る", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await addBox(page, 600, 400, "中身の箱")
  await (await fromMenu(page, "印刷プレビュー")).click()
  await expect(page.locator("[data-sheet]")).toHaveCount(1) // 背景だけのページ 2 は並べない
  await expect(page.locator("[data-sheet] svg").first()).toBeVisible() // 背景の楕円
  await page.keyboard.press("Escape")
  await page.getByRole("tab", { name: "ページ 2" }).click()
  await enter(page)
  await page.getByRole("button", { name: "必ず" }).click()
  await band(page).getByRole("button", { name: "終了" }).click()
  await (await fromMenu(page, "印刷プレビュー")).click()
  await expect(page.locator("[data-sheet]")).toHaveCount(2)
})

test("背景編集モードのツールボックスは背景の 4 つの形だけに替わり、楕円をドラッグで置ける。モードを出ると箱が戻る", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await enter(page)
  await (await fromMenu(page, "背景を編集")).hover()
  await expect(page.getByRole("button", { name: "箱", exact: true })).toHaveCount(0)
  const ellipse = await footerMenuTool(page, "楕円")
  await ellipse.click()
  const from = await onPaper(page, 500, 300)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 160, from.y + 100, { steps: 5 })
  await page.mouse.up()
  await expect(page.locator('[data-item]:not([data-item="bg1"])')).toHaveCount(1)
  await page.keyboard.press("Escape") // 置こうとしていないので、モードを出る
  await expect(band(page)).toHaveCount(0)
  await expect(await footerMenuTool(page, "箱")).toBeVisible()
})
