import { expect, type Page, test } from "@playwright/test"

// i 番目のステージの下の行の名前の欄にマウスを乗せ、せり上がったメニューの中のボタンを返す
async function fromMenu(page: Page, name: string, i = 0) {
  const trigger = page.locator("button[aria-expanded]").nth(i)
  await trigger.hover()
  return trigger.locator("xpath=following-sibling::div[1]").getByRole("button", { name })
}

test("分割すると、右のステージは何も開かず真ん中でブックを選べ、選ぶと右に紙が出る", async ({ page }) => {
  await page.goto("/")
  const papers = page.getByRole("img", { name: "紙" })
  await expect(papers).toHaveCount(1)
  await (await fromMenu(page, "画面を分割")).click()
  const right = page.getByRole("region", { name: "ステージ" }).nth(1)
  await expect(right.getByText("ブックを選択してください")).toBeVisible()
  await expect(papers).toHaveCount(1)
  const input = right.getByRole("combobox", { name: "ブックを探す" })
  await input.click()
  await input.pressSequentially("振り返り")
  await expect(right.getByRole("option")).toHaveText(["週次の振り返り"])
  await input.press("Enter")
  await expect(papers).toHaveCount(2)
  const [left, r] = [await papers.nth(0).boundingBox(), await papers.nth(1).boundingBox()]
  expect(r!.x).toBeGreaterThan(left!.x)
  await expect(page.getByRole("tablist").nth(1)).toHaveAttribute("aria-label", "週次の振り返り")
})

test("タブの左のボタンでダイアログが開き、打った文字で絞り込んで選ぶと、そのステージで開く", async ({ page }) => {
  await page.goto("/")
  await (await fromMenu(page, "ブックを開く")).click()
  const dialog = page.getByRole("dialog", { name: "ブックを開く" })
  await expect(dialog).toBeVisible()
  const input = dialog.getByRole("combobox", { name: "ブックを探す" })
  await expect(input).toBeFocused()
  await page.keyboard.type("design")
  await expect(dialog.getByRole("option")).toHaveText(["Design Notes"])
  await page.keyboard.press("Enter")
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("tablist")).toHaveAttribute("aria-label", "Design Notes")
})

test("絞り込んで候補が減っても、探す欄の位置は変わらない（ステージの真ん中とダイアログ）", async ({ page }) => {
  await page.goto("/")
  await (await fromMenu(page, "画面を分割")).click()
  const stage = page.getByRole("region", { name: "ステージ" }).nth(1)
  await (await fromMenu(page, "ブックを開く")).click()
  const dialog = page.getByRole("dialog", { name: "ブックを開く" })
  for (const place of [dialog, stage]) {
    const input = place.getByRole("combobox", { name: "ブックを探す" })
    const before = await input.boundingBox()
    await input.fill("振り返り")
    await expect(place.getByRole("option")).toHaveText(["週次の振り返り"])
    expect(await input.boundingBox()).toEqual(before)
    await input.fill("当てはまらない言葉")
    await expect(place.getByText("当てはまるブックはありません")).toBeVisible()
    expect(await input.boundingBox()).toEqual(before)
    if (place === dialog) await page.keyboard.press("Escape")
  }
})

test("ダイアログは Esc で閉じ、ブックは変わらない", async ({ page }) => {
  await page.goto("/")
  await (await fromMenu(page, "ブックを開く")).click()
  const dialog = page.getByRole("dialog", { name: "ブックを開く" })
  await expect(dialog).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("tablist")).toHaveAttribute("aria-label", "まとめ図の構想")
})

test("マスターのボタンで、カレントのステージがマスターの画面になり、ブックを開くと紙に戻る", async ({ page }) => {
  await page.goto("/")
  await (await fromMenu(page, "ホーム")).click()
  await expect(page.getByRole("region", { name: "マスター" })).toBeVisible()
  await expect(page.getByRole("img", { name: "紙" })).toHaveCount(0)
  await expect(page.getByRole("tablist")).toHaveCount(0)
  await (await fromMenu(page, "ブックを開く")).click()
  await page.keyboard.type("残課題")
  await page.keyboard.press("Enter")
  await expect(page.getByRole("img", { name: "紙" })).toHaveCount(1)
  await expect(page.getByRole("tablist")).toHaveAttribute("aria-label", "残課題")
})

test("分割した右のステージで探す欄からマスターを選ぶと、右にマスターが開く", async ({ page }) => {
  await page.goto("/")
  await (await fromMenu(page, "画面を分割")).click()
  const right = page.getByRole("region", { name: "ステージ" }).nth(1)
  await expect(right.getByRole("option").first()).toHaveText("マスター")
  await right.getByRole("option", { name: "マスター" }).click()
  await expect(right.getByRole("region", { name: "マスター" })).toBeVisible()
  await expect(page.getByRole("img", { name: "紙" })).toHaveCount(1)
  await expect(await fromMenu(page, "ホーム", 1)).toHaveAttribute("aria-pressed", "true")
})

test("分割した右のステージを閉じると、左のステージが画面全体に広がる", async ({ page }) => {
  await page.goto("/")
  const full = await page.getByRole("region", { name: "ステージ" }).boundingBox()
  await (await fromMenu(page, "画面を分割")).click()
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(2)
  await page.getByRole("button", { name: "ステージを閉じる" }).nth(1).click()
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(1)
  await expect(page.getByRole("button", { name: "ステージを閉じる" })).toHaveCount(0)
  await expect(page.getByRole("img", { name: "紙" })).toHaveCount(1)
  expect(await page.getByRole("region", { name: "ステージ" }).boundingBox()).toEqual(full)
})

test("ドラッグで紙がずれ、ずらせるのは紙の周りの余白までで止まる", async ({ page }) => {
  await page.goto("/")
  const paper = page.getByRole("img", { name: "紙" })
  const stage = page.getByRole("region", { name: "ステージ" })
  const before = (await paper.boundingBox())!
  const box = (await stage.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 2000, box.y + box.height / 2 - 2000, { steps: 5 })
  await page.mouse.up()
  const after = (await paper.boundingBox())!
  expect(after.y).toBeLessThan(before.y)
  // 下の余白が見えきったところで止まる
  const bottomGap = box.y + box.height - (after.y + after.height)
  expect(bottomGap).toBeGreaterThan(80)
  expect(bottomGap).toBeLessThan(96)
})

test("＋で開くダイアログでページを作るとタブが増え、そのページが選ばれ、選んだ紙になる", async ({ page }) => {
  await page.goto("/")
  const before = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  await page.getByRole("button", { name: "ページを足す" }).click()
  const dialog = page.getByRole("dialog", { name: "新しいページ" })
  await expect(dialog.getByLabel("ページの名前")).toBeFocused()
  await dialog.getByLabel("向き").selectOption("portrait")
  await page.keyboard.press("Enter")
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("tab")).toHaveText(["ページ 1", "ページ 2"])
  const after = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  expect(after.height).toBeGreaterThan(before.height)
  await expect(page.getByRole("tab", { name: "ページ 2" })).toHaveAttribute("aria-selected", "true")
})

test("分割して右で同じブックを開くと右にもタブがあり、右で足したページは右だけで開く", async ({ page }) => {
  await page.goto("/")
  await (await fromMenu(page, "画面を分割")).click()
  const right = page.getByRole("region", { name: "ステージ" }).nth(1)
  await right.getByRole("option", { name: "まとめ図の構想" }).click()
  const lists = page.getByRole("tablist")
  await expect(lists).toHaveCount(2)
  await lists.nth(1).getByRole("button", { name: "ページを足す" }).click()
  await page.getByRole("dialog", { name: "新しいページ" }).getByRole("button", { name: "作成" }).click()
  await expect(lists.nth(0).getByRole("tab", { selected: true })).toHaveText("ページ 1")
  await expect(lists.nth(1).getByRole("tab", { selected: true })).toHaveText("ページ 2")
  // 右のタブは、右のステージの真下で、ブックの名前の欄（120px）の右にある
  const bar = (await lists.nth(1).boundingBox())!
  const stage = (await right.boundingBox())!
  expect(bar.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1)
  expect(bar.x).toBeGreaterThanOrEqual(stage.x + 120)
  expect(bar.x).toBeLessThan(stage.x + 180)
})

test("マスターで新しいブックを作ると空のブックが開き、ページを作ると最初のタブと紙が出る", async ({ page }) => {
  await page.goto("/")
  await (await fromMenu(page, "ホーム")).click()
  await page.getByRole("button", { name: "新しいブック" }).click()
  const dialog = page.getByRole("dialog", { name: "新しいブック" })
  await expect(dialog.getByRole("button", { name: "作成" })).toBeDisabled()
  await page.keyboard.type("新しい図")
  await page.keyboard.press("Enter")
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("tablist")).toHaveAttribute("aria-label", "新しい図")
  await expect(page.getByRole("img", { name: "紙" })).toHaveCount(0)
  await page.getByRole("button", { name: "ページを作る" }).click()
  await page.getByRole("dialog", { name: "新しいページ" }).getByRole("button", { name: "作成" }).click()
  await expect(page.getByRole("tab")).toHaveText(["ページ 1"])
  await expect(page.getByRole("img", { name: "紙" })).toHaveCount(1)
  // 作ったブックは探す欄にも出る
  await (await fromMenu(page, "ブックを開く")).click()
  await page.keyboard.type("新しい")
  await expect(page.getByRole("dialog", { name: "ブックを開く" }).getByRole("option")).toHaveText(["新しい図"])
})

test("マスターの設定で言語とスキンを変えると、画面がすぐに変わる", async ({ page }) => {
  await page.goto("/")
  await (await fromMenu(page, "ホーム")).click()
  await page.getByLabel("スキン").selectOption("light")
  await expect(page.locator("html")).toHaveAttribute("data-skin", "light")
  await page.getByLabel("言語").selectOption("en")
  await expect(page.getByRole("button", { name: "New book" })).toBeVisible()
  await expect(page.locator("html")).toHaveAttribute("lang", "en")
})

test("名前の欄にマウスを乗せるとメニューがせり上がり、離れると下がる。押しても出る", async ({ page }) => {
  await page.goto("/")
  const trigger = page.getByRole("button", { name: "まとめ図の構想" })
  const menu = trigger.locator("xpath=following-sibling::div[1]")
  await expect(menu).toBeHidden()
  await trigger.hover()
  await expect(menu).toBeVisible()
  await page.mouse.move(600, 300)
  await expect(menu).toBeHidden()
  await trigger.dispatchEvent("click")
  await expect(menu).toBeVisible()
  // 下の行はステージの下にあり、上の行（ツールボックス）より細い
  const footer = (await trigger.boundingBox())!
  const tools = (await page.getByRole("toolbar", { name: "ツール" }).boundingBox())!
  const stage = (await page.getByRole("region", { name: "ステージ" }).boundingBox())!
  expect(footer.y).toBeGreaterThanOrEqual(stage.y + stage.height)
  expect(footer.height).toBeLessThan(tools.height)
  expect(footer.width).toBe(120)
})

test("分割すると、ツールボックスの無いステージでも右上に閉じるボタンがある。画面は縦にはみ出さない", async ({
  page,
}) => {
  await page.goto("/")
  await (await fromMenu(page, "画面を分割")).click()
  // 何も開いていないステージの名前の欄は空。空でも下の行からはみ出さない
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBe(0)
  const right = page.getByRole("region", { name: "ステージ" }).nth(1)
  const close = (await page.getByRole("button", { name: "ステージを閉じる" }).nth(1).boundingBox())!
  const box = (await right.boundingBox())!
  expect(close.y).toBeLessThan(box.y + 20)
  expect(close.x + close.width).toBeGreaterThan(box.x + box.width - 20)
})

test.describe("ブラウザの言語が英語のとき", () => {
  test.use({ locale: "en-US" })
  test("画面の文言が英語になる", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
    await (await fromMenu(page, "Split screen")).click()
    await expect(page.getByText("Select a book")).toBeVisible()
    await expect(page.getByRole("combobox", { name: "Search books" })).toHaveAttribute(
      "placeholder",
      "Search by book name",
    )
  })
})
