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
  await expect(dialog.locator('[title="見直し"]')).toBeVisible()
  // 完了のレーンは、選んだレーンのプロンプトの上のスイッチで決める（最初のプロジェクトには完了のレーンがある）。
  // ほかのレーンが完了のレーンなら確かめる: やめると変わらず、変更すると移る。切ると完了のレーンは無し
  const doneSwitch = dialog.getByRole("switch", { name: "完了レーンにする" })
  await dialog.locator('[title="見直し"]').click()
  await expect(doneSwitch).not.toBeChecked()
  await doneSwitch.click()
  const confirm = page.getByRole("alertdialog", { name: /^完了レーンに「.+」が設定されています。変更しますか？$/ })
  await confirm.getByRole("button", { name: "やめる" }).click()
  await expect(confirm).toHaveCount(0)
  await expect(doneSwitch).not.toBeChecked()
  await doneSwitch.click()
  await confirm.getByRole("button", { name: "変更する" }).click()
  await expect(doneSwitch).toBeChecked()
  await doneSwitch.click()
  await expect(doneSwitch).not.toBeChecked()
  await doneSwitch.click()
  await expect(doneSwitch).toBeChecked()
  await dialog.getByRole("switch", { name: "未分類を表示する" }).click()
  await expect(dialog.getByText("未分類", { exact: true })).toBeVisible()
  await dialog.getByRole("button", { name: "保存" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(board.getByText("見直し", { exact: true })).toBeVisible()
  await expect(board.getByText("未分類", { exact: true })).toBeVisible()
})

test("プロジェクト設定でチケットサイズを変えると、ボードのチケットカードの大きさが変わる（レーンは継承か、自分のサイズ）", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(CONTROL_CENTER_URL)
  const ai = { headers: await joinedAiAuth() }
  if ((await projects(page)).length === 0)
    await page.request.post("/api/ai/perform", { ...ai, data: { action: "@matomezu/taskboard:project-add", args: {} } })
  const first = (await projects(page))[0] as unknown as {
    id: string
    lanes: { kind: string; id?: string; name?: string }[]
  }
  const lane = first.lanes.find(l => l.kind === "lane")!
  await page.request.post("/api/ai/perform", {
    ...ai,
    data: {
      action: "@matomezu/taskboard:ticket-add",
      args: { project: first.id, name: "大きさを見る", lane: lane.id },
    },
  })
  const board = page.locator(`[data-board="${first.id}"]`)
  const card = board.locator("[data-card]").filter({ hasText: "大きさを見る" })
  const dialog = page.getByRole("dialog", { name: "プロジェクト設定" })

  // 全般で L にすると、継承のレーンのカードが L になる
  await board.getByRole("button", { name: "プロジェクト設定" }).click()
  await dialog.getByTitle("大: 題を折り返す").click()
  await dialog.getByRole("button", { name: "保存" }).click()
  await expect(card).toHaveAttribute("data-size", "large")

  // レーンで S にすると、そのレーンのカードは S になる
  await board.getByRole("button", { name: "プロジェクト設定" }).click()
  await dialog.getByRole("tab", { name: "レーン" }).click()
  await dialog.locator(`[title="${lane.name}"]`).click()
  await dialog.locator(`label[title="小: 番号と題の 1 行"]:visible`).click()
  await dialog.getByRole("button", { name: "保存" }).click()
  await expect(card).toHaveAttribute("data-size", "small")
})
