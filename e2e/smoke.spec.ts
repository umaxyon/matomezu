import { expect, test } from "@playwright/test"

test("分割すると、右のステージは何も開かず真ん中でブックを選べ、選ぶと右に紙が出る", async ({ page }) => {
  await page.goto("/")
  const papers = page.getByRole("img", { name: "紙" })
  await expect(papers).toHaveCount(1)
  await page.getByRole("button", { name: "画面を分割" }).click()
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
  await page.getByRole("button", { name: "ブックを開く" }).click()
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
  await page.getByRole("button", { name: "画面を分割" }).click()
  const stage = page.getByRole("region", { name: "ステージ" }).nth(1)
  await page.getByRole("button", { name: "ブックを開く" }).first().click()
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
  await page.getByRole("button", { name: "ブックを開く" }).click()
  const dialog = page.getByRole("dialog", { name: "ブックを開く" })
  await expect(dialog).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("tablist")).toHaveAttribute("aria-label", "まとめ図の構想")
})

test("マスターのボタンで、カレントのステージがマスターの画面になり、ブックを開くと紙に戻る", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "マスター" }).click()
  await expect(page.getByRole("region", { name: "マスター" })).toBeVisible()
  await expect(page.getByRole("img", { name: "紙" })).toHaveCount(0)
  await expect(page.getByRole("tablist")).toHaveCount(0)
  await page.getByRole("button", { name: "ブックを開く" }).click()
  await page.keyboard.type("残課題")
  await page.keyboard.press("Enter")
  await expect(page.getByRole("img", { name: "紙" })).toHaveCount(1)
  await expect(page.getByRole("tablist")).toHaveAttribute("aria-label", "残課題")
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

test("＋でタブが増え、そのページが選ばれる", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "ページを足す" }).click()
  await expect(page.getByRole("tab")).toHaveText(["ページ 1", "ページ 2"])
  await expect(page.getByRole("tab", { name: "ページ 2" })).toHaveAttribute("aria-selected", "true")
})

test("分割して右で同じブックを開くと右にもタブがあり、右で足したページは右だけで開く", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "画面を分割" }).click()
  const right = page.getByRole("region", { name: "ステージ" }).nth(1)
  await right.getByRole("option", { name: "まとめ図の構想" }).click()
  const lists = page.getByRole("tablist")
  await expect(lists).toHaveCount(2)
  await lists.nth(1).getByRole("button", { name: "ページを足す" }).click()
  await expect(lists.nth(0).getByRole("tab", { selected: true })).toHaveText("ページ 1")
  await expect(lists.nth(1).getByRole("tab", { selected: true })).toHaveText("ページ 2")
  // 右のタブの区画は、右のステージの真上にある
  const bar = (await lists.nth(1).boundingBox())!
  const stage = (await right.boundingBox())!
  expect(bar.x).toBeGreaterThanOrEqual(stage.x)
  expect(bar.x).toBeLessThan(stage.x + 60)
})

test.describe("ブラウザの言語が英語のとき", () => {
  test.use({ locale: "en-US" })
  test("画面の文言が英語になる", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
    await page.getByRole("button", { name: "Split screen" }).click()
    await expect(page.getByText("Select a book")).toBeVisible()
    await expect(page.getByRole("combobox", { name: "Search books" })).toHaveAttribute(
      "placeholder",
      "Search by book name",
    )
  })
})
