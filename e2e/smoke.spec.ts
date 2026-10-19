import { expect, test } from "@playwright/test"

test("紙が 1 枚あり、分割のボタンでステージが 2 つになり、それぞれに紙がある", async ({ page }) => {
  await page.goto("/")
  const papers = page.getByRole("img", { name: "紙" })
  await expect(papers).toHaveCount(1)
  await page.getByRole("button", { name: "画面を分割" }).click()
  await expect(papers).toHaveCount(2)
  const [left, right] = [await papers.nth(0).boundingBox(), await papers.nth(1).boundingBox()]
  expect(left!.x + left!.width).toBeLessThanOrEqual(right!.x + right!.width)
  expect(right!.x).toBeGreaterThan(left!.x)
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

test("分割すると右のステージにもタブがあり、右で選んだページは右だけで開く", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "画面を分割" }).click()
  const lists = page.getByRole("tablist")
  await expect(lists).toHaveCount(2)
  await lists.nth(1).getByRole("button", { name: "ページを足す" }).click()
  await expect(lists.nth(0).getByRole("tab", { selected: true })).toHaveText("ページ 1")
  await expect(lists.nth(1).getByRole("tab", { selected: true })).toHaveText("ページ 2")
  // 右のタブの区画は、右のステージの真上にある
  const bar = (await lists.nth(1).boundingBox())!
  const stage = (await page.getByRole("region", { name: "ステージ" }).nth(1).boundingBox())!
  expect(bar.x).toBeGreaterThanOrEqual(stage.x)
  expect(bar.x).toBeLessThan(stage.x + 40)
})
