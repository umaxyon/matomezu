// スクロールバーが幅を取る環境（Windows など）での見た目。ヘッドレスのブラウザは既定でスクロールバーを隠すので、隠さずに起動する
import { expect, test } from "./fixtures"
import { fromMenu } from "./helpers/stage-menu"

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } })

test("分割した右のステージで中身が縦にスクロールしても、右上の閉じるボタンはスクロールバーに重ならない", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 240 })
  await page.goto("/")
  await (await fromMenu(page, "画面を分割")).click()
  const right = page.getByRole("region", { name: "ステージ" }).nth(1)
  await right.getByRole("option", { name: "マスター" }).click()
  await expect(right.getByRole("region", { name: "マスター" })).toBeVisible()
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
