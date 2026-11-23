// プロジェクト設定: ボードの歯車で開き、レーンの名前を直し、完了と作業中のスイッチ（同じレーンには片方だけ）を切り替え、未分類を表示すると、保存でボードに出る。「件数を表示する」を切ると、レーンのタイトル帯に数が出ない。名前が重なる間は保存できない。全般の「優先度を出す」「チケットボリュームを出す」を切ると、チケットカードに優先度・チケットボリュームが出ない
import { CONTROL_CENTER_URL, expect, joinedAiAuth, type Page, test } from "./fixtures"
import { aiPerform } from "./helpers/ai"
import { storedRecords } from "./helpers/stored"

const PROJECT = "@matomezu/taskboard:project"

test("ボードの歯車でプロジェクト設定を開き、レーンを直して保存するとボードに出る", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(CONTROL_CENTER_URL)
  if ((await storedRecords<{ id: string }>(page.request, PROJECT)).length === 0)
    await aiPerform(page, { action: "@matomezu/taskboard:project-add", args: {} })
  const first = (await storedRecords<{ id: string }>(page.request, PROJECT))[0]!
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
  const workingSwitch = dialog.getByRole("switch", { name: "作業中レーンにする" })
  await dialog.locator('[title="見直し"]').click()
  // 最初のプロジェクトの作業中のレーンなら、先に作業中の印を切る（作業中の間は完了にできない）
  if (await workingSwitch.isChecked()) {
    await expect(doneSwitch).toBeDisabled()
    await workingSwitch.click()
  }
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
  // 作業中のスイッチ: 同じレーンを完了と作業中の両方にはできず、片方が入っている間はもう片方を押せない
  await expect(workingSwitch).toBeDisabled()
  await doneSwitch.click()
  await expect(doneSwitch).not.toBeChecked()
  await workingSwitch.click()
  await expect(workingSwitch).toBeChecked()
  await expect(doneSwitch).toBeDisabled()
  await workingSwitch.click()
  await expect(workingSwitch).not.toBeChecked()
  await doneSwitch.click()
  await expect(doneSwitch).toBeChecked()
  await dialog.getByRole("switch", { name: "未分類を表示する" }).click()
  await expect(dialog.getByText("未分類", { exact: true })).toBeVisible()
  await dialog.getByRole("button", { name: "保存" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(board.getByText("見直し", { exact: true })).toBeVisible()
  await expect(board.getByText("未分類", { exact: true })).toBeVisible()
  // 「件数を表示する」（入っている）を切ると、レーンのタイトル帯に数が出ない
  await expect(board.locator("[data-lane-count]").first()).toBeVisible()
  await board.getByRole("button", { name: "プロジェクト設定" }).click()
  await dialog.getByRole("tab", { name: "レーン" }).click()
  const countSwitch = dialog.getByRole("switch", { name: "件数を表示する" })
  await expect(countSwitch).toBeChecked()
  await countSwitch.click()
  await dialog.getByRole("button", { name: "保存" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(board.locator("[data-lane-count]")).toHaveCount(0)
})

test("プロジェクト設定でチケットサイズを変えると、ボードのチケットカードの大きさが変わる（レーンは継承か、自分のサイズ）", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(CONTROL_CENTER_URL)
  if ((await storedRecords<{ id: string }>(page.request, PROJECT)).length === 0)
    await aiPerform(page, { action: "@matomezu/taskboard:project-add", args: {} })
  const first = (await storedRecords<{ id: string }>(page.request, PROJECT))[0] as unknown as {
    id: string
    lanes: { kind: string; id?: string; name?: string }[]
  }
  const lane = first.lanes.find(l => l.kind === "lane")!
  await aiPerform(page, {
    action: "@matomezu/taskboard:ticket-add",
    args: { project: first.id, name: "大きさを見る", lane: lane.id },
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

test("プロジェクト設定の全般で、プレフィクスの入力とチケットサイズの枠は中身の幅で、名前の入力より狭い", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(CONTROL_CENTER_URL)
  if ((await storedRecords<{ id: string }>(page.request, PROJECT)).length === 0)
    await aiPerform(page, { action: "@matomezu/taskboard:project-add", args: {} })
  const first = (await storedRecords<{ id: string }>(page.request, PROJECT))[0]!
  await page.locator(`[data-board="${first.id}"]`).getByRole("button", { name: "プロジェクト設定" }).click()
  const dialog = page.getByRole("dialog", { name: "プロジェクト設定" })
  const width = async (locator: ReturnType<Page["locator"]>) => (await locator.boundingBox())!.width
  const nameWidth = await width(dialog.getByRole("textbox", { name: "プロジェクト名" }))
  expect(await width(dialog.getByRole("textbox", { name: "タスクプレフィクス" }))).toBeLessThan(nameWidth * 0.8)
  expect(await width(dialog.getByRole("group", { name: "チケットサイズ" }))).toBeLessThan(nameWidth * 0.4)
})

test("プロジェクト設定のタグ・レーンは、中身が少ないとスクロールバーが出ず、増えると一覧だけがスクロールする（追加ボタンは一覧の上）", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(CONTROL_CENTER_URL)
  if ((await storedRecords<{ id: string }>(page.request, PROJECT)).length === 0)
    await aiPerform(page, { action: "@matomezu/taskboard:project-add", args: {} })
  const first = (await storedRecords<{ id: string }>(page.request, PROJECT))[0]!
  await page.locator(`[data-board="${first.id}"]`).getByRole("button", { name: "プロジェクト設定" }).click()
  const dialog = page.getByRole("dialog", { name: "プロジェクト設定" })
  const scrolls = (tab: string) =>
    dialog.getByRole("tabpanel", { name: tab }).evaluate(el => el.scrollHeight > el.clientHeight)
  for (const [tab, add] of [
    ["チケットタグ", "タグ追加"],
    ["レーン", "レーン追加"],
  ] as const) {
    await dialog.getByRole("tab", { name: tab }).click()
    expect(await scrolls(tab)).toBe(false)
    const button = dialog.getByRole("button", { name: add })
    const list = button.locator("xpath=../following-sibling::*[1]")
    const listTop = (await list.boundingBox())!.y
    expect((await button.boundingBox())!.y).toBeLessThan(listTop)
    for (let i = 0; i < 14; i++) {
      await button.click()
      const input = dialog.getByRole("textbox", { name: tab === "レーン" ? "レーン名" : "タグ名" })
      await input.fill(`many${i}`)
    }
    expect(await scrolls(tab)).toBe(false)
    expect(await list.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true)
    await expect(button).toBeInViewport()
  }
})

test("プロジェクト設定で追加した行の名前は、1 文字ずつ打っても入力Formのままで、離れるとラベルになる", async ({
  page,
}) => {
  await page.goto(CONTROL_CENTER_URL)
  if ((await storedRecords<{ id: string }>(page.request, PROJECT)).length === 0)
    await aiPerform(page, { action: "@matomezu/taskboard:project-add", args: {} })
  const first = (await storedRecords<{ id: string }>(page.request, PROJECT))[0]!
  await page.locator(`[data-board="${first.id}"]`).getByRole("button", { name: "プロジェクト設定" }).click()
  const dialog = page.getByRole("dialog", { name: "プロジェクト設定" })
  for (const [tab, add, field] of [
    ["チケットタグ", "タグ追加", "タグ名"],
    ["レーン", "レーン追加", "レーン名"],
  ] as const) {
    await dialog.getByRole("tab", { name: tab }).click()
    await dialog.getByRole("button", { name: add }).click()
    const input = dialog.getByRole("textbox", { name: field })
    await input.pressSequentially("abc")
    await expect(input).toHaveValue("abc")
    await input.press("Enter")
    await expect(dialog.getByRole("textbox", { name: field })).toHaveCount(0)
    await expect(dialog.getByText("abc", { exact: true }).locator("visible=true")).toHaveCount(1)
  }
})

test("全般の「優先度を出す」「規模を出す」を切って保存すると、チケットカードの右下に優先度もチケットボリュームも出ない", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(CONTROL_CENTER_URL)
  if ((await storedRecords<{ id: string }>(page.request, PROJECT)).length === 0)
    await aiPerform(page, { action: "@matomezu/taskboard:project-add", args: {} })
  const first = (await storedRecords<{ id: string }>(page.request, PROJECT))[0] as unknown as {
    id: string
    doneLane?: string
    lanes: { kind: string; id?: string; cardSize?: string }[]
  }
  // 優先度とチケットボリュームの印は small のカードには出ないので、完了でない、large か medium か継承のレーンに置く
  const lane = first.lanes.find(l => l.kind === "lane" && l.id !== first.doneLane && l.cardSize !== "small")!
  const added = await page.request.post("/api/ai/perform", {
    headers: await joinedAiAuth(),
    data: {
      action: "@matomezu/taskboard:ticket-add",
      args: { project: first.id, name: "優先度の確かめ", lane: lane.id, volume: "m" },
    },
  })
  expect(added.ok()).toBe(true)
  const board = page.locator(`[data-board="${first.id}"]`)
  const card = board.locator("[data-card]", { hasText: "優先度の確かめ" })
  await expect(card.getByTitle(/^優先度/)).toBeVisible()
  await expect(card.getByTitle("規模 M")).toBeVisible()
  await board.getByRole("button", { name: "プロジェクト設定" }).click()
  const dialog = page.getByRole("dialog", { name: "プロジェクト設定" })
  const shows = dialog.getByRole("switch", { name: "優先度を出す" })
  await expect(shows).toBeChecked()
  await shows.click()
  const volume = dialog.getByRole("switch", { name: "規模を出す" })
  await expect(volume).toBeChecked()
  await volume.click()
  await dialog.getByRole("button", { name: "保存" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(card).toBeVisible()
  await expect(card.getByTitle(/^優先度/)).toHaveCount(0)
  await expect(card.getByTitle(/^規模/)).toHaveCount(0)
})
