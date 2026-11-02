import { expect, type Page, test } from "@playwright/test"
import { drawerTool } from "./drawer"
import { fromMenu } from "./stage-menu"

const items = (page: Page) => page.locator("[data-item]")
const panel = (page: Page) => page.getByRole("complementary", { name: "右サイドパネル" })
// 隠した列も数えるので、役割ではなく名前で探す
const stages = (page: Page) => page.locator('[aria-label="ステージ"]')

// 紙の (x, 150) に箱を置き、コメントを付けてたたむ
async function foldedComment(page: Page, x: number, caption: string, text: string) {
  await (await drawerTool(page, "箱")).click()
  const paper = (await page.getByRole("img", { name: "紙" }).first().boundingBox())!
  await page.mouse.click(paper.x + x, paper.y + 150)
  const dialog = page.getByRole("dialog", { name: "ボックスの追加" })
  await dialog.getByLabel("キャプション", { exact: true }).fill(caption)
  await dialog.getByRole("button", { name: "追加" }).click()
  await expect(dialog).toBeHidden()
  await items(page).filter({ hasText: caption }).click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "コメント" }).click()
  const draft = page.getByRole("group", { name: "コメントを付ける" })
  await draft.getByLabel("コメント", { exact: true }).fill(text)
  await draft.getByRole("button", { name: "付ける" }).click()
  await page.getByRole("group", { name: "コメント", exact: true }).getByRole("button", { name: "たたむ" }).click()
}

const widths = async (page: Page) => {
  const boxes = await stages(page).evaluateAll(els => els.map(e => e.parentElement!.getBoundingClientRect().width))
  return boxes.map(Math.round)
}

test("コメントの絵を押すと、窓の右から 320px の右サイドパネルが出て、分けていればそのステージを窓いっぱいに広げ、もう片方の幅は 0。Esc か閉じるボタンで閉じると、分けた幅に戻る", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  await foldedComment(page, 200, "一", "見てほしい")
  await (await fromMenu(page, "画面を分割")).click()
  const split = await widths(page)
  expect(split[1]).toBeGreaterThan(100)
  await page.getByRole("button", { name: "コメントを開く" }).click()
  await expect(panel(page)).toContainText("見てほしい")
  expect(Math.round((await panel(page).boundingBox())!.width)).toBe(320)
  const viewport = page.viewportSize()!
  expect(Math.round((await panel(page).boundingBox())!.x + 320)).toBe(viewport.width)
  const opened = await widths(page)
  expect(opened[1]).toBe(0)
  expect(opened[0]).toBeGreaterThan(split[0]!)
  await page.keyboard.press("Escape")
  await expect(panel(page)).toHaveCount(0)
  expect(await widths(page)).toEqual(split)
  await page.getByRole("button", { name: "コメントを開く" }).click()
  await panel(page).getByRole("button", { name: "右サイドパネルを閉じる" }).click()
  await expect(panel(page)).toHaveCount(0)
  expect(await widths(page)).toEqual(split)
})

test("外を押すと閉じる。ハンドツールの間は閉じない。開いている間に別のコメントを押すと、閉じるだけ。たたんだ絵を押してもたたんだまま", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  await foldedComment(page, 200, "一", "一つ目")
  await foldedComment(page, 500, "二", "二つ目")
  const icons = page.getByRole("button", { name: "コメントを開く" })
  await icons.first().click()
  await expect(panel(page)).toContainText("一つ目")
  await expect(icons).toHaveCount(2)
  await icons.nth(1).click()
  await expect(panel(page)).toHaveCount(0)
  await icons.nth(1).click()
  await expect(panel(page)).toContainText("二つ目")
  // ハンドツールの間は、紙を押しても閉じない（道具は右の長押しで出る道具のアイコンで替える）
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  const tool = async (name: string) => {
    await page.mouse.move(paper.x + 40, paper.y + 500)
    await page.mouse.down({ button: "right" })
    await page.waitForTimeout(350)
    await page.mouse.up({ button: "right" })
    await page.getByRole("toolbar", { name: "ツールの切り替え" }).getByRole("button", { name }).click()
  }
  await tool("ハンドツール")
  await expect(panel(page)).toContainText("二つ目")
  await page.mouse.click(paper.x + 40, paper.y + 400)
  await expect(panel(page)).toContainText("二つ目")
  await tool("選択ツール")
  await expect(panel(page)).toContainText("二つ目")
  await page.mouse.click(paper.x + 40, paper.y + 400)
  await expect(panel(page)).toHaveCount(0)
  // たたんだまま（押して開いても、吹き出しを出すかは変えない）
  await expect(icons).toHaveCount(2)
})

test("開いたステージのページが替わるか、分けると閉じる。中の「吹き出しを出す」で吹き出しに戻り、吹き出しの書き込みはキーでも右サイドパネルに出せる", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  await foldedComment(page, 200, "一", "見てほしい")
  const icon = page.getByRole("button", { name: "コメントを開く" })
  // ハンドツールの間は外を押しても閉じないので、ページや分割で閉じるかだけを見られる
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  await page.mouse.move(paper.x + 40, paper.y + 500)
  await page.mouse.down({ button: "right" })
  await page.waitForTimeout(350)
  await page.mouse.up({ button: "right" })
  await page.getByRole("toolbar", { name: "ツールの切り替え" }).getByRole("button", { name: "ハンドツール" }).click()
  await icon.click()
  await expect(panel(page)).toContainText("見てほしい")
  await page.getByRole("button", { name: "ページを足す" }).click()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("tab", { name: "ページ 2" })).toHaveAttribute("aria-selected", "true")
  await expect(panel(page)).toHaveCount(0)
  await page.getByRole("tab", { name: "ページ 1" }).click()
  await icon.click()
  await expect(panel(page)).toContainText("見てほしい")
  await (await fromMenu(page, "画面を分割")).click()
  await expect(panel(page)).toHaveCount(0)
  await (await fromMenu(page, "分割をやめる")).click()
  // 吹き出しに戻す
  await icon.click()
  await panel(page).getByRole("button", { name: "吹き出しを出す" }).click()
  const bubble = page.getByRole("group", { name: "コメント", exact: true })
  await expect(bubble).toContainText("見てほしい")
  await page.keyboard.press("Escape")
  await expect(panel(page)).toHaveCount(0)
  await bubble.getByRole("button", { name: "コメントを開く" }).focus()
  await page.keyboard.press("Enter")
  await expect(panel(page)).toContainText("見てほしい")
})
