import { expect, type Page, test } from "@playwright/test"

// リストを置こうとして紙の (x, y) で押し、追加のダイアログでキャプションを入れて追加する
async function addList(page: Page, caption: string) {
  await page.getByRole("button", { name: "リスト", exact: true }).click()
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  await page.mouse.click(paper.x + 120, paper.y + 120)
  const dialog = page.getByRole("dialog", { name: "リストの追加" })
  await dialog.getByLabel("キャプション", { exact: true }).fill(caption)
  await dialog.getByRole("button", { name: "追加" }).click()
  await expect(dialog).toBeHidden()
  return page.locator("[data-item]", { hasText: caption })
}

async function addRow(page: Page, list: ReturnType<Page["locator"]>, caption: string, body = "") {
  await list.getByRole("button", { name: "行の追加" }).click()
  const dialog = page.getByRole("dialog", { name: "行の追加" })
  await dialog.getByLabel("キャプション", { exact: true }).fill(caption)
  if (body) await dialog.getByLabel("本文", { exact: true }).fill(body)
  await dialog.getByRole("button", { name: "追加" }).click()
  await expect(dialog).toBeHidden()
}

test("ツールボックスのリストで置くと、キャプションの見出しと「＋」の行だけのリストが出る。「＋」で行を足し、ダブルクリックで行を変え、右クリックで消す", async ({
  page,
}) => {
  await page.goto("/")
  const list = await addList(page, "買い物")
  await expect(list.getByRole("listitem")).toHaveCount(0)
  await addRow(page, list, "牛乳")
  await addRow(page, list, "卵", "6 個")
  await expect(list.getByRole("listitem")).toHaveText(["牛乳", "卵6 個"])
  // 行のダブルクリックは行の編集（リストの設定ではない）
  await list.getByRole("listitem").first().dblclick()
  const edit = page.getByRole("dialog", { name: "行の編集" })
  await expect(edit.getByLabel("キャプション", { exact: true })).toHaveValue("牛乳")
  await edit.getByLabel("キャプション", { exact: true }).fill("豆乳")
  await edit.getByRole("button", { name: "確定" }).click()
  await expect(list.getByRole("listitem").first()).toHaveText("豆乳")
  // 行の右クリックで行のメニュー
  await list.getByRole("listitem").first().click({ button: "right" })
  const menu = page.getByRole("menu")
  await expect(menu.getByRole("menuitem")).toHaveText(["行の編集", "行を削除"])
  await menu.getByRole("menuitem", { name: "行を削除" }).click()
  await expect(list.getByRole("listitem")).toHaveText(["卵6 個"])
})

test("チェックリストにすると行の左にチェックが出て、押すだけで入れ切りする。チェックの入ったリストでチェックリストを切ろうとすると、その場で確かめる", async ({
  page,
}) => {
  await page.goto("/")
  const list = await addList(page, "やること")
  await addRow(page, list, "牛乳")
  // リストの設定（見出しのダブルクリック）でチェックリストにする
  await list.getByText("やること").dblclick()
  const dialog = page.getByRole("dialog", { name: "リストの編集" })
  await dialog.getByRole("switch", { name: "チェックリスト" }).click()
  await dialog.getByRole("button", { name: "確定" }).click()
  const check = list.getByRole("checkbox", { name: "チェック" })
  await check.click()
  await expect(check).toBeChecked()
  // 切ろうとすると、上に重ねたモーダルで確かめる。戻すならそのまま、消すと切れる。どちらでも設定のダイアログは開いたまま
  await list.getByText("やること").dblclick()
  const size = await dialog.boundingBox()
  await dialog.getByRole("switch", { name: "チェックリスト" }).click()
  const confirm = page.getByRole("alertdialog", { name: "チェックの状態が消えます" })
  await expect(confirm).toBeVisible()
  await confirm.getByRole("button", { name: "戻す" }).click()
  await expect(confirm).toBeHidden()
  await expect(dialog.getByRole("switch", { name: "チェックリスト" })).toHaveAttribute("aria-checked", "true")
  await dialog.getByRole("switch", { name: "チェックリスト" }).click()
  await page.keyboard.press("Escape") // Escape はモーダルだけを閉じる
  await expect(confirm).toBeHidden()
  await expect(dialog).toBeVisible()
  await dialog.getByRole("switch", { name: "チェックリスト" }).click()
  await confirm.getByRole("button", { name: "消す" }).click()
  expect(await dialog.boundingBox()).toEqual(size) // 欄が減ってもダイアログの大きさは変わらない
  await expect(list.getByRole("checkbox")).toHaveCount(0) // 下書きで見せる
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  await expect(list.getByRole("checkbox")).toHaveCount(0)
})

test("行がリストの高さを超えるとリストの中でスクロールし、そのホイールで紙はずれない。行を交互に色分けできる", async ({
  page,
}) => {
  await page.goto("/")
  const list = await addList(page, "多い")
  for (const n of [1, 2, 3, 4, 5]) await addRow(page, list, `行 ${n}`)
  const rows = list.locator("ul").locator("..")
  expect(await rows.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true)
  const paper = page.getByRole("img", { name: "紙" })
  const before = await paper.boundingBox()
  const at = (await rows.boundingBox())!
  await page.mouse.move(at.x + 20, at.y + 20)
  await page.mouse.wheel(0, 200)
  await expect.poll(() => rows.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  expect(await paper.boundingBox()).toEqual(before)
  // 行を交互に色分け
  await list.getByText("多い").dblclick()
  const dialog = page.getByRole("dialog", { name: "リストの編集" })
  await dialog.getByRole("switch", { name: "行を交互に色分け" }).click()
  await dialog.getByRole("button", { name: "確定" }).click()
  // 行の地は、行の帯の内側に描く付箋（行の最初の子の中）の色
  const bg = (i: number) =>
    list
      .getByRole("listitem")
      .nth(i)
      .evaluate(el => getComputedStyle(el.firstElementChild?.firstElementChild as Element).backgroundColor)
  expect(await bg(0)).not.toBe(await bg(1))
})

test("行の下の端をドラッグすると、その行の高さが 1 行刻みで変わる。設定の「行の高さ」で全部の行をそろえ、キャンセルなら元のまま", async ({
  page,
}) => {
  await page.goto("/")
  const list = await addList(page, "高さ")
  await addRow(page, list, "一")
  await addRow(page, list, "二", "本文")
  const rows = list.getByRole("listitem")
  const height = async (i: number) => (await rows.nth(i).boundingBox())!.height
  const zoom = await page.evaluate(() => {
    const p = document.querySelector('[role="img"]') as HTMLElement
    return p.getBoundingClientRect().width / p.offsetWidth
  })
  const start = await height(0)
  expect(await height(1)).toBe(start)
  // 1 つめの行の下の端を、2 行ぶん下へ
  const grip = (await rows.nth(0).locator('[data-grip="row"]').boundingBox())!
  await page.mouse.move(grip.x + 30, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x + 30, grip.y + grip.height / 2 + 36 * zoom, { steps: 4 })
  await page.mouse.up()
  await expect.poll(() => height(0)).toBeCloseTo(start + 36 * zoom, 0)
  expect(await height(1)).toBe(start)
  // 設定で 3 行にそろえる: 全部の行が同じ高さ。確定の前から見せ、キャンセルで戻る
  await list.getByText("高さ").dblclick()
  const dialog = page.getByRole("dialog", { name: "リストの編集" })
  await dialog.getByLabel("行数").selectOption("3")
  await dialog.getByRole("button", { name: "にそろえる", exact: true }).click()
  await expect.poll(() => height(1)).toBeCloseTo(start + 36 * zoom, 0)
  expect(await height(0)).toBeCloseTo(start + 36 * zoom, 0)
  await dialog.getByRole("button", { name: "キャンセル" }).click()
  await expect.poll(() => height(1)).toBe(start)
  // 中身が見える高さにそろえる: 行ごとに、その行の本文が全部見える高さ（本文の無い行は本文なし、1 行の行は 1 行）
  await list.getByText("高さ").dblclick()
  await dialog.getByRole("button", { name: "中身が見える高さにそろえる" }).click()
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect.poll(() => height(0)).toBeLessThan(start)
  expect(await height(1)).toBe(start)
  // 最大行にそろえる: 本文の一番長い行（1 行）に、全部の行をそろえる
  await list.getByText("高さ").dblclick()
  await dialog.getByLabel("行数").selectOption("max")
  await dialog.getByRole("button", { name: "にそろえる", exact: true }).click()
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect.poll(() => height(0)).toBe(start)
})

test("チェックリストにすると「チェック済みを」の欄が出て、チェック済みの行を薄くし、先頭か最後に寄せて見せる（データの順は変えない）", async ({
  page,
}) => {
  await page.goto("/")
  const list = await addList(page, "順番")
  for (const c of ["一", "二", "三"]) await addRow(page, list, c)
  await list.getByText("順番").dblclick()
  const dialog = page.getByRole("dialog", { name: "リストの編集" })
  await expect(dialog.getByRole("group", { name: "チェック済みを" })).toHaveCount(0)
  await dialog.getByRole("switch", { name: "チェックリスト" }).click()
  const checked = dialog.getByRole("group", { name: "チェック済みを" })
  await checked.getByRole("switch", { name: "グレーアウトする" }).click()
  await checked.getByLabel("並べ替える").selectOption({ label: "最後" })
  await dialog.getByRole("button", { name: "確定" }).click()
  await list.getByRole("listitem").filter({ hasText: "一" }).getByRole("checkbox").click()
  await expect(list.getByRole("listitem")).toHaveText(["二", "三", "一"])
  await expect(list.getByRole("listitem").last()).toHaveCSS("opacity", "0.45")
  await list.getByText("順番").dblclick()
  await dialog.getByRole("group", { name: "チェック済みを" }).getByLabel("並べ替える").selectOption({ label: "先頭" })
  await expect(list.getByRole("listitem")).toHaveText(["一", "二", "三"]) // 下書きで見せる
  await dialog.getByRole("button", { name: "キャンセル" }).click()
  await expect(list.getByRole("listitem")).toHaveText(["二", "三", "一"])
})

test("リストのキャプションも、箱と同じく左・中央・右に寄せられる（既定は中央。確定の前から見せる）", async ({
  page,
}) => {
  await page.goto("/")
  const list = await addList(page, "寄せ")
  const head = list.getByText("寄せ")
  await expect(head).toHaveCSS("text-align", "center")
  await head.dblclick()
  const dialog = page.getByRole("dialog", { name: "リストの編集" })
  await dialog
    .getByRole("group", { name: "キャプションの寄せ" })
    .getByRole("radio", { name: "左寄せ" })
    .check({ force: true })
  await expect(head).toHaveCSS("text-align", "left")
  await dialog.getByRole("button", { name: "確定" }).click()
  await expect(dialog).toBeHidden()
  await expect(head).toHaveCSS("text-align", "left")
})
