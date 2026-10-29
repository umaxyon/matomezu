// スクロールバーが幅を取る環境（Windows など）での見た目。ヘッドレスのブラウザは既定でスクロールバーを隠すので、隠さずに起動する
import { expect, test } from "@playwright/test"

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } })

test("分割した右のステージで中身が縦にスクロールしても、右上の閉じるボタンはスクロールバーに重ならない", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 500 })
  await page.goto("/")
  const trigger = page.locator('button[aria-haspopup="menu"]').first()
  await trigger.hover()
  await trigger.locator("xpath=../following-sibling::div[1]").getByRole("button", { name: "画面を分割" }).click()
  const right = page.getByRole("region", { name: "ステージ" }).nth(1)
  await right.getByRole("option", { name: "マスター" }).click()
  // マスターの画面は縦にスクロールし、右端にスクロールバーが出る
  const area = await page.evaluate(() => {
    const el = [...document.querySelectorAll<HTMLElement>("section")].find(
      e => getComputedStyle(e).overflowY === "auto" && e.scrollHeight > e.clientHeight,
    )!
    const r = el.getBoundingClientRect()
    return { right: r.left + el.clientWidth, bar: el.offsetWidth - el.clientWidth }
  })
  expect(area.bar).toBeGreaterThan(0)
  const close = (await page.getByRole("button", { name: "ステージを閉じる" }).nth(1).boundingBox())!
  expect(close.x + close.width).toBeLessThanOrEqual(area.right)
})
