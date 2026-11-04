// 画面の履歴: 置いた箱を Ctrl+Z で元に戻し、Ctrl+Shift+Z でやり直す。フッタメニューの元に戻す・やり直すのボタンも同じで、押してもフッタメニューは下がらない
import { expect, type Page, test } from "./fixtures"
import { footerMenuTool } from "./helpers/footer-menu"
import { items } from "./helpers/paper"

async function placeBox(page: Page, caption: string) {
  await (await footerMenuTool(page, "箱")).click()
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  await page.mouse.click(paper.x + 200, paper.y + 150)
  const dialog = page.getByRole("dialog", { name: "ボックスの追加" })
  await dialog.getByLabel("キャプション", { exact: true }).fill(caption)
  await dialog.getByRole("button", { name: "追加" }).click()
  await expect(dialog).toBeHidden()
}

test("置いた箱を Ctrl+Z で元に戻すと消え、Ctrl+Shift+Z と Ctrl+Y でやり直すと戻る", async ({ page }) => {
  await page.goto("/")
  await placeBox(page, "戻す箱")
  await expect(items(page)).toHaveCount(1)
  await page.keyboard.press("Control+z")
  await expect(items(page)).toHaveCount(0)
  await page.keyboard.press("Control+Shift+z")
  await expect(items(page)).toHaveText("戻す箱")
  await page.keyboard.press("Control+z")
  await expect(items(page)).toHaveCount(0)
  await page.keyboard.press("Control+y")
  await expect(items(page)).toHaveText("戻す箱")
})

test("フッタメニューの元に戻す・やり直すのボタンで戻し、やり直せる。押してもフッタメニューは下がらず、続けて押せる", async ({
  page,
}) => {
  await page.goto("/")
  await placeBox(page, "1")
  await placeBox(page, "2")
  await expect(items(page)).toHaveCount(2)
  await footerMenuTool(page, "箱")
  const undo = page.getByRole("button", { name: "元に戻す" })
  const redo = page.getByRole("button", { name: "やり直す" })
  await expect(redo).toBeDisabled()
  await undo.click()
  await expect(items(page)).toHaveCount(1)
  await undo.click()
  await expect(items(page)).toHaveCount(0)
  await expect(undo).toBeDisabled()
  await redo.click()
  await expect(items(page)).toHaveText("1")
})

test("ツリーで＋で足して書いた節は、1 回の Ctrl+Z で消える。あとで書き直したのは、書き直しだけが 1 つの画面の履歴の段", async ({
  page,
}) => {
  await page.goto("/")
  const trigger = page.locator('button[aria-haspopup="menu"]').first()
  await trigger.hover()
  await trigger.locator("xpath=../following-sibling::div[1]").getByRole("button", { name: "ホーム" }).click()
  await page.getByRole("button", { name: "新しいブック" }).click()
  const dialog = page.getByRole("dialog", { name: "新しいブック" })
  await page.keyboard.type("木")
  await dialog.getByLabel("ブックのタイプ").selectOption({ label: "ツリー" })
  await dialog.getByRole("button", { name: "作成" }).click()
  await page.getByRole("button", { name: "ページを作る" }).click()
  const add = page.getByRole("dialog", { name: "新しいページ" })
  await add.getByLabel("根のキャプション").fill("根")
  await add.getByRole("button", { name: "作る" }).click()
  const paper = page.getByRole("img", { name: "紙" })
  const child = paper.locator('[data-node]:not([data-root="true"])')
  await paper.getByRole("button", { name: "子を足す" }).click()
  await page.keyboard.type("子")
  await page.keyboard.press("Enter")
  await expect(child).toHaveText("子")
  // 書き直す
  await child.dblclick()
  await page.keyboard.press("Control+a")
  await page.keyboard.type("書き直した")
  await page.keyboard.press("Enter")
  await expect(child).toHaveText("書き直した")
  await page.keyboard.press("Control+z")
  await expect(child).toHaveText("子")
  await page.keyboard.press("Control+z")
  await expect(child).toHaveCount(0)
})

test("ページタブをドラッグして並べ替えられ、元に戻すで元の並びに、やり直すで動かした並びになる。タブの外で離すと動かさない", async ({
  page,
}) => {
  await page.goto("/")
  await page.getByRole("button", { name: "ページを足す" }).click()
  const dialog = page.getByRole("dialog", { name: "新しいページ" })
  await page.keyboard.press("Enter")
  await expect(dialog).toBeHidden()
  const tabs = page.getByRole("tab")
  await expect(tabs).toHaveText(["ページ 1", "ページ 2"])
  const first = (await tabs.nth(0).boundingBox())!
  const second = (await tabs.nth(1).boundingBox())!
  const grab = { x: first.x + first.width / 2, y: first.y + first.height / 2 }
  // タブの外（紙の真ん中）で離すと動かさない
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  await page.mouse.move(grab.x + 20, grab.y)
  await page.mouse.move(400, 400)
  await page.mouse.up()
  await expect(tabs).toHaveText(["ページ 1", "ページ 2"])
  // 2 枚目の右へ落とす
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  await page.mouse.move(grab.x + 20, grab.y)
  await page.mouse.move(second.x + second.width - 4, grab.y)
  await page.mouse.up()
  await expect(tabs).toHaveText(["ページ 2", "ページ 1"])
  await page.keyboard.press("Control+z")
  await expect(tabs).toHaveText(["ページ 1", "ページ 2"])
  await page.keyboard.press("Control+Shift+z")
  await expect(tabs).toHaveText(["ページ 2", "ページ 1"])
})
