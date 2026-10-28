// ツリーのブック（@matomezu/tree）: 道具の組は編集とハンド。編集の間はホイール・ミニマップ・紙のドラッグのどれでも紙をずらさず、ハンドで紙をずらして見る
import { expect, type Page, test } from "@playwright/test"

const paper = (page: Page) => page.getByRole("img", { name: "紙" })

async function fromMenu(page: Page, name: string) {
  const trigger = page.locator("button[aria-expanded]").first()
  await trigger.hover()
  return trigger.locator("xpath=following-sibling::div[1]").getByRole("button", { name })
}

// マスターでツリーのブックを作り、根だけのページを作る（grow は伸びる向きのボタンの名前。無ければブック継承）
async function treeBook(page: Page, grow?: string) {
  await page.goto("/")
  await (await fromMenu(page, "ホーム")).click()
  await page.getByRole("button", { name: "新しいブック" }).click()
  const dialog = page.getByRole("dialog", { name: "新しいブック" })
  await page.keyboard.type("木")
  await dialog.getByLabel("ブックのタイプ").selectOption({ label: "ツリー" })
  await dialog.getByRole("button", { name: "作成" }).click()
  await page.getByRole("button", { name: "ページを作る" }).click()
  const add = page.getByRole("dialog", { name: "新しいページ" })
  if (grow) await add.getByRole("radio", { name: grow }).check({ force: true })
  await add.getByLabel("根のキャプション").fill("根")
  await add.getByRole("button", { name: "作る" }).click()
  await expect(paper(page)).toBeVisible()
}

const paperAt = async (page: Page) => (await paper(page).boundingBox())!

test("ツリーの道具は編集とハンド。編集の間は、ホイールでも紙のドラッグでも紙が動かず、ハンドにすると動く", async ({
  page,
}) => {
  await treeBook(page)
  const tool = page.getByRole("button", { name: "編集ツール" })
  await expect(tool).toBeVisible()
  const before = await paperAt(page)
  const stage = (await page.getByRole("region", { name: "ステージ" }).boundingBox())!
  const x = stage.x + stage.width / 2
  const y = stage.y + stage.height / 2
  await page.mouse.move(x, y)
  await page.mouse.wheel(0, 200)
  await page.mouse.down()
  await page.mouse.move(x, y - 80, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(100)
  expect((await paperAt(page)).y).toBe(before.y)
  await tool.click()
  await expect(page.getByRole("button", { name: "ハンドツール" })).toBeVisible()
  await page.mouse.move(x, y)
  await page.mouse.wheel(0, 200)
  await expect.poll(async () => (await paperAt(page)).y).toBeLessThan(before.y)
})

test("編集の間は、左下のミニマップの四角をドラッグしても紙が動かない。ハンドにすると動く", async ({ page }) => {
  await treeBook(page)
  await (await fromMenu(page, "ミニマップ")).click()
  const seen = page.locator("[data-minimap=corner] [data-minimap-seen]")
  await expect(seen).toBeVisible()
  const drag = async () => {
    const box = (await seen.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 15, { steps: 5 })
    await page.mouse.up()
  }
  const before = await paperAt(page)
  await drag()
  await page.waitForTimeout(100)
  expect((await paperAt(page)).y).toBe(before.y)
  await page.getByRole("button", { name: "編集ツール" }).click()
  await expect(page.getByRole("button", { name: "ハンドツール" })).toBeVisible()
  // ポインタが離れて閉じたミニマップを、もう一度開く
  if (!(await seen.isVisible())) await (await fromMenu(page, "ミニマップ")).click()
  await drag()
  await expect.poll(async () => (await paperAt(page)).y).toBeLessThan(before.y - 20)
})

test("編集の道具の間は、選んでいる節がステージの真ん中に来る。ハンドで紙をずらしても、編集に戻すと真ん中に戻る", async ({
  page,
}) => {
  await treeBook(page, "中央")
  const root = page.locator('[data-root="true"]')
  const stage = page.getByRole("region", { name: "ステージ" })
  const offset = async () => {
    const r = (await root.boundingBox())!
    const s = (await stage.boundingBox())!
    return { x: r.x + r.width / 2 - (s.x + s.width / 2), y: r.y + r.height / 2 - (s.y + s.height / 2) }
  }
  await expect(root).toHaveAttribute("data-selected", "true")
  await expect.poll(async () => Math.abs((await offset()).x) + Math.abs((await offset()).y)).toBeLessThan(2)
  await page.getByRole("button", { name: "編集ツール" }).click()
  const s = (await stage.boundingBox())!
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2)
  await page.mouse.wheel(0, 150)
  await expect.poll(async () => Math.abs((await offset()).y)).toBeGreaterThan(20)
  await page.getByRole("button", { name: "ハンドツール" }).click()
  await expect.poll(async () => Math.abs((await offset()).x) + Math.abs((await offset()).y)).toBeLessThan(2)
})

test("＋で子を足してその場で書き、Enter で確定する。書いている間は字に合わせて節が広がり、確定したら矢印キーで根へ戻れる", async ({
  page,
}) => {
  await treeBook(page)
  const paperEl = paper(page)
  await paperEl.getByRole("button", { name: "子を足す" }).click()
  const input = paperEl.getByRole("textbox", { name: "キャプション" })
  await expect(input).toBeFocused()
  const before = (await input.boundingBox())!.width
  await page.keyboard.type("とても長いキャプションの子")
  await expect.poll(async () => (await input.boundingBox())!.width).toBeGreaterThan(before)
  await page.keyboard.press("Enter")
  await expect(input).toHaveCount(0)
  const child = paperEl.locator('[data-node]:not([data-root="true"])')
  await expect(child).toHaveText("とても長いキャプションの子")
  await expect(child).toHaveAttribute("data-selected", "true")
  await page.keyboard.press("ArrowUp")
  await expect(paperEl.locator('[data-root="true"]')).toHaveAttribute("data-selected", "true")
})

test("キャプションは普通の太さ。＋で足した節は太字で書き始め、入力欄のすぐ上のボックスで色を付けられる（押しても編集は続く）", async ({
  page,
}) => {
  await treeBook(page)
  const paperEl = paper(page)
  await expect(paperEl.locator('[data-root="true"]')).toHaveCSS("font-weight", "400")
  await paperEl.getByRole("button", { name: "子を足す" }).click()
  const input = paperEl.getByRole("textbox", { name: "キャプション" })
  await expect(input).toHaveValue("****")
  await page.keyboard.type("大事")
  await expect(input).toHaveValue("**大事**")
  await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(2, 4))
  const bar = paperEl.getByRole("toolbar", { name: "本文の装飾" })
  const box = (await bar.boundingBox())!
  const field = (await input.boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(field.y)
  await bar.getByRole("button", { name: "エラー" }).click()
  await expect(input).toHaveValue("**{error:大事}**")
  await expect(input).toBeFocused()
  await page.keyboard.press("Enter")
  const span = paperEl.locator('[data-node]:not([data-root="true"]) span').first()
  await expect(span).toHaveText("大事")
  await expect(span).toHaveCSS("font-weight", "700")
  await expect(span).toHaveCSS("color", "rgb(220, 38, 38)")
})
