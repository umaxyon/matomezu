import { expect, type Page, test } from "./fixtures"
import { footerMenuTool } from "./footer-menu"
import { addList, addRow } from "./list"
import { panel, writeNote } from "./note"
import { fromMenu } from "./stage-menu"

const items = (page: Page) => page.locator("[data-item]")
// 隠した列も数えるので、役割ではなく名前で探す
const stages = (page: Page) => page.locator('[aria-label="ステージ"]')

// 紙の (x, 150) に箱を置き、伝言を付けてたたむ
async function foldedNote(page: Page, x: number, caption: string, text: string) {
  await (await footerMenuTool(page, "箱")).click()
  const paper = (await page.getByRole("img", { name: "紙" }).first().boundingBox())!
  await page.mouse.click(paper.x + x, paper.y + 150)
  const dialog = page.getByRole("dialog", { name: "ボックスの追加" })
  await dialog.getByLabel("キャプション", { exact: true }).fill(caption)
  await dialog.getByRole("button", { name: "追加" }).click()
  await expect(dialog).toBeHidden()
  await writeNote(page, items(page).filter({ hasText: caption }), text)
  await foldNote(page, text)
}

// 吹き出しに文 text を出している伝言を、右サイドパネルでたたんで閉じる
async function foldNote(page: Page, text: string) {
  await page.getByRole("button", { name: "伝言を開く" }).filter({ hasText: text }).click()
  await panel(page).getByRole("button", { name: "たたむ" }).click()
  await page.keyboard.press("Escape")
  await expect(panel(page)).toHaveCount(0)
}

const widths = async (page: Page) => {
  const boxes = await stages(page).evaluateAll(els => els.map(e => e.parentElement!.getBoundingClientRect().width))
  return boxes.map(Math.round)
}

test("伝言の絵を押すと、窓の右から 320px の右サイドパネルが出て、分けていればそのステージを窓いっぱいに広げ、もう片方の幅は 0。Esc か閉じるボタンで閉じると、分けた幅に戻る", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  await foldedNote(page, 200, "一", "見てほしい")
  await (await fromMenu(page, "画面を分割")).click()
  const split = await widths(page)
  expect(split[1]).toBeGreaterThan(100)
  await page.getByRole("button", { name: "伝言を開く" }).click()
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
  await page.getByRole("button", { name: "伝言を開く" }).click()
  await panel(page).getByRole("button", { name: "右サイドパネルを閉じる" }).click()
  await expect(panel(page)).toHaveCount(0)
  expect(await widths(page)).toEqual(split)
})

test("外を押すと閉じる。ハンドツールの間は閉じない。ステージで押しても Esc で閉じる。開いている間に別の伝言を押すと、その物が付ける先になる（開いた伝言のまま）。たたんだ絵を押してもたたんだまま", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  await foldedNote(page, 200, "一", "一つ目")
  await foldedNote(page, 500, "二", "二つ目")
  const icons = page.getByRole("button", { name: "伝言を開く" })
  await icons.first().click()
  await expect(panel(page)).toContainText("一つ目")
  await expect(icons).toHaveCount(2)
  await icons.nth(1).click()
  await expect(panel(page)).toContainText("一つ目")
  await expect(panel(page).getByRole("button", { name: "二", exact: true })).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("Escape")
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
  // フォーカスが右サイドパネルの外にあっても、Esc で閉じる（置こうとしている物が無ければ）
  expect(await panel(page).evaluate(e => e.contains(document.activeElement))).toBe(false)
  await page.keyboard.press("Escape")
  await expect(panel(page)).toHaveCount(0)
  await icons.nth(1).click()
  await expect(panel(page)).toContainText("二つ目")
  await tool("選択ツール")
  await expect(panel(page)).toContainText("二つ目")
  await page.mouse.click(paper.x + 40, paper.y + 400)
  await expect(panel(page)).toHaveCount(0)
  // たたんだまま（押して開いても、吹き出しを出すかは変えない）
  await expect(icons).toHaveCount(2)
})

test("開いたステージのページが替わるか、分けると閉じる。中の「吹き出しを出す」で吹き出しに戻り、吹き出しはキーでも右サイドパネルに出せる", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  await foldedNote(page, 200, "一", "見てほしい")
  const icon = page.getByRole("button", { name: "伝言を開く" })
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
  const bubble = page.getByRole("group", { name: "伝言", exact: true })
  await expect(bubble).toContainText("見てほしい")
  await page.keyboard.press("Escape")
  await expect(panel(page)).toHaveCount(0)
  await bubble.getByRole("button", { name: "伝言を開く" }).focus()
  await page.keyboard.press("Enter")
  await expect(panel(page)).toContainText("見てほしい")
})

test("窓が右サイドパネルの幅より狭ければ、右サイドパネルが窓の幅でステージを覆う。閉じれば戻る", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  await foldedNote(page, 200, "一", "見てほしい")
  await page.setViewportSize({ width: 300, height: 700 })
  await page.getByRole("button", { name: "伝言を開く" }).click()
  await expect(panel(page)).toContainText("見てほしい")
  expect(Math.round((await panel(page).boundingBox())!.width)).toBe(300)
  expect(await widths(page)).toEqual([0])
  await page.keyboard.press("Escape")
  await expect(panel(page)).toHaveCount(0)
  expect(await widths(page)).toEqual([300])
})

const paperBox = async (page: Page) => {
  const b = (await page.getByRole("img", { name: "紙" }).first().boundingBox())!
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width) }
}

// 紙が止まっているか（少し間を置いて 2 回測り、同じなら止まっている）
async function steady(page: Page) {
  const a = await paperBox(page)
  await page.waitForTimeout(50)
  const b = await paperBox(page)
  return a.x === b.x && a.y === b.y && a.w === b.w
}

// 紙の上で Ctrl+ホイールを回して小さくする
async function zoomOut(page: Page) {
  const p = (await page.getByRole("img", { name: "紙" }).first().boundingBox())!
  await page.mouse.move(p.x + 40, p.y + 40)
  await page.keyboard.down("Control")
  await page.mouse.wheel(0, 400)
  await page.keyboard.up("Control")
}

test("開くと倍率を 100% にして、付けた物を見せる。閉じれば開く前の見え方に戻る", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  const full = (await paperBox(page)).w
  await foldedNote(page, 1000, "端", "見てほしい")
  await zoomOut(page)
  await expect.poll(async () => (await paperBox(page)).w).toBeLessThan(full * 0.7)
  const before = await paperBox(page)
  await page.getByRole("button", { name: "伝言を開く" }).click()
  await expect(panel(page)).toContainText("見てほしい")
  await expect.poll(async () => (await paperBox(page)).w).toBe(full)
  // 付けた物は、ステージの見えている所に入っている
  const stage = (await page.locator("[data-stage]").first().boundingBox())!
  const item = (await items(page).filter({ hasText: "端" }).boundingBox())!
  expect(item.x).toBeGreaterThanOrEqual(stage.x)
  expect(item.x + item.width).toBeLessThanOrEqual(stage.x + stage.width)
  expect(item.y).toBeGreaterThanOrEqual(stage.y)
  expect(item.y + item.height).toBeLessThanOrEqual(stage.y + stage.height)
  await page.keyboard.press("Escape")
  await expect(panel(page)).toHaveCount(0)
  await expect.poll(() => paperBox(page)).toEqual(before)
})

test("開いている間に紙をずらすか倍率を変えたら、閉じても戻さない", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  const full = (await paperBox(page)).w
  await foldedNote(page, 1000, "端", "見てほしい")
  await zoomOut(page)
  await expect.poll(async () => (await paperBox(page)).w).toBeLessThan(full * 0.7)
  await page.getByRole("button", { name: "伝言を開く" }).click()
  await expect.poll(async () => (await paperBox(page)).w).toBe(full)
  // ホイールで紙をずらす
  const shown = await paperBox(page)
  const stage = (await page.locator("[data-stage]").first().boundingBox())!
  await page.mouse.move(stage.x + 40, stage.y + stage.height - 40)
  await page.mouse.wheel(-120, 0)
  await expect.poll(async () => (await paperBox(page)).x).not.toBe(shown.x)
  await page.keyboard.press("Escape")
  await expect(panel(page)).toHaveCount(0)
  // 倍率は 100% のまま（ずらす量は、広がった表示領域に収め直される）。戻すなら閉じ終えたときなので、紙が止まってから見る
  await expect.poll(() => steady(page)).toBe(true)
  expect((await paperBox(page)).w).toBe(full)
})

test("リストの中のスクロールの奥の行を開くと、リストもスクロールしてその行を見せる。閉じてもリストのスクロールは戻さない", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  const list = await addList(page, "多い")
  for (const n of [1, 2, 3, 4, 5]) await addRow(page, list, `行 ${n}`)
  const rows = list.locator("ul").locator("..")
  const last = list.getByRole("listitem").last()
  await writeNote(page, last, "奥の行")
  await foldNote(page, "奥の行")
  await rows.evaluate(el => {
    el.scrollTop = 0
  })
  await page.getByRole("button", { name: "伝言を開く" }).click()
  await expect(panel(page)).toContainText("奥の行")
  await expect.poll(() => rows.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  const box = (await rows.boundingBox())!
  const row = (await last.boundingBox())!
  expect(row.y).toBeGreaterThanOrEqual(box.y - 1)
  expect(row.y + row.height).toBeLessThanOrEqual(box.y + box.height + 1)
  const scrolled = await rows.evaluate(el => el.scrollTop)
  await page.keyboard.press("Escape")
  await expect(panel(page)).toHaveCount(0)
  await expect.poll(() => steady(page)).toBe(true)
  expect(await rows.evaluate(el => el.scrollTop)).toBe(scrolled)
})
