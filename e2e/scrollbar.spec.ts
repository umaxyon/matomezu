// スクロールバーが幅を取る環境（Windows など）での見た目。ヘッドレスのブラウザは既定でスクロールバーを隠すので、隠さずに起動する
import { expect, test } from "./fixtures"
import { fromMenu } from "./helpers/stage-menu"

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } })

test("分割した右のステージで中身が縦にスクロールしても、右上の閉じるボタンはスクロールバーに重ならない", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 480 })
  await page.goto("/")
  await (await fromMenu(page, "画面を分割")).click()
  // 右のステージに長いマークダウンのページを作る（プレビューのペインは縦にスクロールし、右端にスクロールバーが出る）
  const right = page.getByRole("region", { name: "ステージ" }).nth(1)
  await right.getByRole("button", { name: "新しいブック" }).click()
  const add = page.getByRole("dialog", { name: "新しいブック" })
  await page.keyboard.type("長い文書")
  await add.getByLabel("ブックのタイプ").selectOption({ label: "マークダウン" })
  await add.getByRole("button", { name: "作成" }).click()
  await right.getByRole("button", { name: "ページを作る" }).click()
  await page.getByRole("dialog", { name: "新しいページ" }).getByRole("button", { name: "作成" }).click()
  await right.getByRole("region", { name: "ソース" }).getByRole("textbox").click()
  await page.keyboard.insertText(Array.from({ length: 60 }, (_, i) => `段落 ${i + 1}`).join("\n\n"))
  const preview = right.getByRole("region", { name: "プレビュー" })
  await expect(preview).toContainText("段落 60")
  const area = await preview.evaluate((pane: HTMLElement) => {
    const el = [pane, ...pane.querySelectorAll<HTMLElement>("*")].find(
      e => getComputedStyle(e).overflowY === "auto" && e.scrollHeight > e.clientHeight,
    )!
    const r = el.getBoundingClientRect()
    return { right: r.left + el.clientWidth, bar: el.offsetWidth - el.clientWidth }
  })
  expect(area.bar).toBeGreaterThan(0)
  const close = (await page.getByRole("button", { name: "ステージを閉じる" }).nth(1).boundingBox())!
  expect(close.x + close.width).toBeLessThanOrEqual(area.right)
})
