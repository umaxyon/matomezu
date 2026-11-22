// 書庫の画面の作業机: ワークルームのフォルダの下に、今参加者がいるワークルームの作業机（鳥の顔）、その下にワーカーブックを映す。
// ワークルームのフォルダと映した節の中では、作るボタンは出したまま押せない。ワーカーブックを開くと、ブックの画面に出る
import { expect, test } from "./fixtures"
import { aiPerform } from "./helpers/ai"

test("参加者がいるワークルームの作業机の下に、AI が足したワーカーブックが映り、開ける。中では何も作れない", async ({
  page,
}) => {
  await page.goto("/")
  await page.bringToFront()
  const added = await aiPerform(page, {
    action: "@matomezu/base:worker-page-add",
    args: { type: "@matomezu/drawing:drawing", title: "作業のメモ" },
  })
  expect(added, JSON.stringify(added)).toMatchObject({ ok: true })

  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  await page.getByRole("list", { name: "書庫 の中身" }).getByRole("button", { name: "ワークルーム" }).dblclick()
  const rooms = page.getByRole("list", { name: "ワークルーム の中身" })
  await expect(rooms.getByRole("button", { name: "e2e" })).toBeVisible()
  await expect(rooms.locator("img")).toHaveCount(1)
  for (const name of ["ブック新規作成", "フォルダ新規作成", "ページ新規作成"])
    await expect(page.getByRole("button", { name })).toBeDisabled()

  await rooms.getByRole("button", { name: "e2e" }).dblclick()
  const desk = page.getByRole("list", { name: "e2e の中身" })
  await expect(desk.getByRole("button")).toHaveCount(1)
  await desk.getByRole("button").click()
  await expect(page.getByRole("button", { name: "ページ新規作成" })).toBeDisabled()
  await page.screenshot({ path: "test-results/workdesk-library.png" })
  await desk.getByRole("button").dblclick()
  await expect(page.getByText("作業のメモ").first()).toBeVisible()
})
