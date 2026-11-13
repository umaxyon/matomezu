// プロジェクト設定: ボードの歯車で開き、レーンの名前を直して未分類を表示すると、保存でボードに出る。名前が重なる間は保存できない
import { CONTROL_CENTER_URL, expect, joinedAiAuth, type Page, test } from "./fixtures"

const projects = async (page: Page) =>
  Object.values(
    (
      (await (await page.request.get("/api/data", { headers: await joinedAiAuth() })).json()) as {
        records: Record<string, Record<string, unknown>>
      }
    ).records["@matomezu/taskboard:project"] ?? {},
  ) as { id: string }[]

test("ボードの歯車でプロジェクト設定を開き、レーンを直して保存するとボードに出る", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(CONTROL_CENTER_URL)
  if ((await projects(page)).length === 0)
    await page.request.post("/api/ai/perform", {
      headers: await joinedAiAuth(),
      data: { action: "@matomezu/taskboard:project-add", args: {} },
    })
  const first = (await projects(page))[0]!
  const board = page.locator(`[data-board="${first.id}"]`)
  await board.getByRole("button", { name: "プロジェクト設定" }).click()
  const dialog = page.getByRole("dialog", { name: "プロジェクト設定" })
  await dialog.getByRole("tab", { name: "レーン" }).click()

  // 名前はラベルで、鉛筆を押すと入力Formになる（Enter で終える）。名前が重なる間は保存できず、知らせが出る
  const pencils = dialog.getByRole("button", { name: "名前を編集" })
  const name = dialog.getByRole("textbox", { name: "レーン名" })
  await expect(name).toHaveCount(0)
  await pencils.nth(0).click()
  const firstName = await name.inputValue()
  await name.press("Enter")
  await expect(name).toHaveCount(0)
  await pencils.nth(1).click()
  await name.fill(firstName)
  await expect(dialog.getByText("名前が重なっています")).toBeVisible()
  await expect(dialog.getByRole("button", { name: "保存" })).toBeDisabled()

  await name.fill("見直し")
  await name.press("Enter")
  await expect(dialog.getByText("見直し", { exact: true })).toBeVisible()
  await dialog.getByRole("switch", { name: "未分類を表示する" }).click()
  await expect(dialog.getByText("未分類", { exact: true })).toBeVisible()
  await dialog.getByRole("button", { name: "保存" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(board.getByText("見直し", { exact: true })).toBeVisible()
  await expect(board.getByText("未分類", { exact: true })).toBeVisible()
})
