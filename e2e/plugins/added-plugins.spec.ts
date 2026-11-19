import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pagesIn } from "../books"
import { aiAuth, BOOK_SCREEN_URL, expect, joinedAiAuth, type Page, test, urlPlace } from "../fixtures"
import { footerMenuTool } from "../helpers/footer-menu"
import { enablePlugins } from "../helpers/settings"
import { fromMenu } from "../helpers/stage-menu"
import { storedBook, storedBooks, storedPageVersion } from "../helpers/stored"

// 追加プラグインの見本 ex2 のフォルダを結んで立てた常駐（playwright.config.ts の plugins）を使う。ex1・ex3 などは、使うテストが自分で足し、テストが終われば外す

const data = async (page: Page) => (await page.request.get("/api/data")).json()
// 保存したフローのブックの、最初のページのテーマ
const pageTheme = async (page: Page) => {
  const found = await saved(page, flow.id)
  return found
    ? pagesIn<{ settings?: Record<string, unknown> }>(found)[0]?.settings?.["@matomezu/base:page-theme"]
    : undefined
}
const flow = {
  id: "flow-1",
  title: "フロー",
  lineup: [
    {
      kind: "page",
      id: "flow-p1",
      type: "ex2:flow",
      title: "P",
      paper: "@matomezu/base:a4",
      orientation: "landscape",
      items: [{ id: "d1", item: "ex2:diamond", x: 40, y: 40, props: { caption: "判断" } }],
    },
  ],
}

// どのテストも ex2 のフローのブック 1 冊で始める
test.use({ books: [flow] })

// テストが作った一時フォルダ
const temps: string[] = []

// テストが足した追加プラグインは、テストが終われば外す（常駐を空にする用意の口は、追加プラグインを残すため）。一時フォルダも消す
test.afterEach(async ({ context }) => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
  const { plugins } = await (await context.request.get("/api/data")).json()
  for (const { id } of plugins as { id: string }[])
    if (id !== "ex2") await context.request.post("/api/plugins/remove", { headers: aiAuth(), data: { id } })
})

test("常駐が結んだ追加プラグインを画面に渡し、画面はその見た目の JS を読む", async ({ page }) => {
  expect((await data(page)).plugins).toEqual([
    { id: "ex2", ui: expect.stringMatching(/^api\/plugins\/0\/ui\.js\?v=\d+$/) },
  ])
  await page.goto(BOOK_SCREEN_URL)
  await expect(page.locator("[data-ex2-diamond]")).toHaveAccessibleName("判断")
  // ひし形はテーマキー ex2:diamond-fill の色で塗る（見た目では --diamond-fill。変数が無ければ黒になる）
  const paint = await page.locator("[data-ex2-diamond] polygon").evaluate(el => ({
    declared: getComputedStyle(el).getPropertyValue("--diamond-fill").trim(),
    fill: getComputedStyle(el).fill,
  }))
  expect(paint.declared).not.toBe("")
  expect(paint.fill).not.toBe("rgb(0, 0, 0)")
})

test("追加プラグインの形を動かすと、常駐のエンジンも同じアクションを行って残し、読み直しても同じ所にある", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  const diamond = page.locator("[data-item]")
  const before = (await diamond.boundingBox())!
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
  await page.mouse.down()
  await page.mouse.move(before.x + before.width / 2 + 120, before.y + before.height / 2 + 80, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => storedPageVersion(page.request, "flow-p1")).toBe(2)
  const moved = (await diamond.boundingBox())!
  expect(moved.x).toBeGreaterThan(before.x)
  await page.reload()
  await expect(page.locator("[data-ex2-diamond]")).toBeVisible()
  expect(await page.locator("[data-item]").boundingBox()).toEqual(moved)
})

test("追加プラグインの形の道具を使うと、その形の追加のダイアログ（追加プラグインのビュー）が開く", async ({ page }) => {
  await page.goto(BOOK_SCREEN_URL)
  await (await footerMenuTool(page, "判断")).click()
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  await page.mouse.click(paper.x + 400, paper.y + 300)
  await expect(page.getByRole("dialog", { name: "判断の追加" })).toBeVisible()
})

const loaded = (page: Page) =>
  page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map(e => new URL(e.name).pathname)
      .filter(p => /^\/api\/plugins\/\d+\//.test(p)),
  )

test("動いている常駐にプラグインを足すと、開いている画面が読み直して取り込む。外すと読み直して消える", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await expect(page.locator("[data-ex2-diamond]")).toBeVisible()
  const mark = () => page.evaluate(() => Object.assign(window, { notReloaded: true }))
  const reloaded = () => page.waitForFunction(() => !("notReloaded" in window))
  await mark()
  const linked = await page.request.post("/api/plugins", {
    headers: aiAuth(),
    data: { dir: resolve("test/added-plugins/ex3") },
  })
  expect(await linked.json()).toEqual({ ok: true, id: "ex3" })
  await reloaded()
  await expect(page.locator("[data-ex2-diamond]")).toBeVisible()
  expect((await data(page)).plugins.map((p: { id: string }) => p.id)).toEqual(["ex2", "ex3"])
  await expect.poll(() => loaded(page)).toEqual(["/api/plugins/0/ui.js", "/api/plugins/1/ui.js"])

  await mark()
  const removed = await page.request.post("/api/plugins/remove", { headers: aiAuth(), data: { id: "ex3" } })
  expect(await removed.json()).toEqual({ ok: true })
  await reloaded()
  await expect(page.locator("[data-ex2-diamond]")).toBeVisible()
  expect((await data(page)).plugins.map((p: { id: string }) => p.id)).toEqual(["ex2"])
})

test("見た目の台帳アセンブルで食い違う追加プラグインは、画面が外して、ほかはそのまま使える。外したことは warning W011 として常駐に知らせ、AI の actions の warnings に出る", async ({
  page,
}) => {
  // 星のビューを結んでいない ex3（ホストのエンジンでは台帳アセンブルでき、画面の見た目の台帳アセンブルで食い違う）
  const dir = mkdtempSync(join(tmpdir(), "matomezu-e2e-"))
  temps.push(dir)
  cpSync(resolve("test/added-plugins/ex3"), dir, { recursive: true })
  const ui = join(dir, "ui.tsx")
  writeFileSync(ui, readFileSync(ui, "utf8").replace(`items: { [STAR.id]: { view: StarView, icon: STAR_ICON } },`, ""))
  const errors: string[] = []
  page.on("console", m => {
    if (m.type() === "error") errors.push(m.text())
  })
  await page.goto(BOOK_SCREEN_URL)
  const linked = await page.request.post("/api/plugins", { headers: aiAuth(), data: { dir } })
  expect(await linked.json()).toEqual({ ok: true, id: "ex3" })
  // 足したときは無効（名乗りと文言だけで組むので、見た目は食い違わない）。有効にすると、見た目の台帳アセンブルで外れる
  await page.request.post("/api/enable-plugins-for-test", { data: { ids: ["ex2", "ex3"] } })
  await expect.poll(() => errors.some(e => e.includes("plugin ex3 is not added"))).toBe(true)
  await expect(page.locator("[data-ex2-diamond]")).toBeVisible()
  // 常駐のエンジンには入っているので AI は使えるが、画面には出ない。そのことを warning として、MCP 公開ツールの actions が返す物に添える
  await expect
    .poll(async () => (await (await page.request.get("/api/ai/catalog", { headers: aiAuth() })).json()).warnings)
    .toEqual(expect.arrayContaining([expect.stringMatching(/^W011 ex3: /)]))
  const removed = await page.request.post("/api/plugins/remove", { headers: aiAuth(), data: { id: "ex3" } })
  expect(await removed.json()).toEqual({ ok: true })
})

test("取り込んだプラグインが置いてほしいと書いたウィジェットは、既定の UI マッピングに足されて出る", async ({
  page,
}) => {
  await page.goto(BOOK_SCREEN_URL)
  await expect(page.getByRole("button", { name: "あいさつする" })).toHaveCount(0)
  const mark = () => page.evaluate(() => Object.assign(window, { notReloaded: true }))
  await mark()
  const linked = await page.request.post("/api/plugins", {
    headers: aiAuth(),
    data: { dir: resolve("test/added-plugins/ex1") },
  })
  expect(await linked.json()).toEqual({ ok: true, id: "ex1" })
  await page.waitForFunction(() => !("notReloaded" in window))
  // 足したときは無効なので、有効にするまで置かない
  await expect(page.getByRole("button", { name: "あいさつする" })).toHaveCount(0)
  await enablePlugins(page, "ex1")
  await expect(page.getByRole("button", { name: "あいさつする" })).toBeVisible()
  const removed = await page.request.post("/api/plugins/remove", { headers: aiAuth(), data: { id: "ex1" } })
  expect(await removed.json()).toEqual({ ok: true })
})

// 作り手の違う見本を一緒に使うテストは、使う見本を自分で足す
// 足した追加プラグインは無効なので、足してから有効にする（テストの用意の口。有効にする操作そのものは、設定の「プラグイン」を使うテストが確かめる）。ex2 は、はじめから有効
const link = async (page: Page, ...dirs: string[]) => {
  const ids: string[] = ["ex2"]
  for (const dir of dirs) {
    const linked = await page.request.post("/api/plugins", { headers: aiAuth(), data: { dir: resolve(dir) } })
    const body = await linked.json()
    expect(body.ok).toBe(true)
    ids.push(body.id)
  }
  const enabled = await page.request.post("/api/enable-plugins-for-test", { data: { ids } })
  expect(enabled.ok()).toBe(true)
}
// 足すだけ（有効にしない）
const linkOnly = async (page: Page, ...dirs: string[]) => {
  for (const dir of dirs) {
    const linked = await page.request.post("/api/plugins", { headers: aiAuth(), data: { dir: resolve(dir) } })
    expect((await linked.json()).ok).toBe(true)
  }
}
const saved = (page: Page, id: string) => storedBook(page.request, id)

test("3 つを読ませると、作り手の違うプラグインのボタンが同じ UI マッピングに並び、ex3 のテーマを ex2 のブックに使える", async ({
  page,
}) => {
  await linkOnly(page, "test/added-plugins/ex1", "test/added-plugins/ex3")
  expect((await data(page)).plugins.map((p: { id: string }) => p.id)).toEqual(["ex2", "ex1", "ex3"])
  await page.goto(BOOK_SCREEN_URL)
  await expect(page.locator("[data-ex2-diamond]")).toBeVisible()
  await enablePlugins(page, "ex1", "ex3")
  await expect(page.getByRole("button", { name: "あいさつする" })).toBeVisible()
  await page.getByRole("button", { name: "ミントにする" }).click()
  await expect.poll(async () => await pageTheme(page)).toBe("ex3:mint")
  await page.reload()
  await expect(page.getByRole("button", { name: "ミントにする" })).toBeVisible()
  expect(await pageTheme(page)).toBe("ex3:mint")
})

test("AI は actions で追加プラグインのアクションを読み、perform で行える。形は選んだタイプのブックにだけ置ける", async ({
  page,
}) => {
  await link(page, "test/added-plugins/ex3")
  await page.goto(BOOK_SCREEN_URL)
  // 目次に追加プラグインのアクションとアイテムが出て、ids で全文を引ける
  const { index } = await (await page.request.get("/api/ai/catalog", { headers: aiAuth() })).json()
  expect(index.actions.map((a: { id: string }) => a.id)).toContain("ex2:diamond-answer")
  expect(index.items.map((i: { id: string }) => i.id)).toContain("ex3:star")
  const whole = await (
    await page.request.get("/api/ai/catalog?ids=ex2:diamond-answer&ids=ex3:star", { headers: aiAuth() })
  ).json()
  expect(whole.actions[0].description).toContain("Answer a decision")
  expect(whole.items[0].props.properties).toBeDefined()
  const perform = async (body: object) =>
    (await page.request.post("/api/ai/perform", { headers: aiAuth(), data: body })).json()
  expect(
    await perform({
      action: "ex2:diamond-answer",
      args: { item: "d1", answer: "yes" },
      on: { page: "flow-p1" },
    }),
  ).toMatchObject({ ok: true })
  await expect(page.locator('[data-ex2-diamond="yes"]')).toBeVisible()
  // ex3 の星は、ex3 を選んでいない ex2 のフローには置けない
  expect(
    await perform({
      action: "@matomezu/paper:item-place",
      args: { item: "ex3:star", at: { x: 300, y: 300 } },
      on: { page: "flow-p1" },
    }),
  ).toMatchObject({ ok: false, reason: "refused" })
})

test("新しいブックのダイアログに追加プラグインのタイプが並び、ex3 のボードは自分の紙で始まって、保存して読み直せる", async ({
  page,
}) => {
  await link(page, "test/added-plugins/ex3")
  await page.goto(BOOK_SCREEN_URL)
  await (await fromMenu(page, "画面を分割")).click()
  await page.getByRole("button", { name: "ブック新規作成" }).locator("visible=true").click()
  const dialog = page.getByRole("dialog", { name: "新しいブック" })
  await page.keyboard.type("星のボード")
  await page.keyboard.press("Enter")
  await expect(dialog).toBeHidden()
  await page.getByRole("button", { name: "ステージを閉じる" }).first().click()
  // ページタブの＋のメニューに、足したプラグインのページのタイプも並ぶ
  await page.getByRole("button", { name: "ページを足す" }).click()
  await expect(page.getByRole("menu").getByRole("menuitem")).toContainText(["フロー", "ボード"])
  await page.getByRole("menuitem", { name: "ボード" }).click()
  await page
    .getByRole("dialog", { name: /^新しい/ })
    .getByRole("button", { name: "作成" })
    .click()
  await expect(page.getByRole("img", { name: "紙" })).toBeVisible()
  const board = async () => (await storedBooks(page.request)).find((b: { title: string }) => b.title === "星のボード")
  await expect
    .poll(async () => {
      const found = await board()
      return found ? pagesIn<{ paper: string }>(found)[0]?.paper : undefined
    })
    .toBe("ex3:square")
  await page.reload()
  expect((await board())?.title).toBe("星のボード")
})

test("ex6 と ex7 を読ませると、ex7 の木箱が ex6 の拡張ポイントのメソッドに答え、ex6 のアクションがその答えを使う（ex7 は ex6 の仕様だけを読む）", async ({
  page,
}) => {
  await link(page, "test/added-plugins/ex6", "test/added-plugins/ex7")
  const yard = {
    id: "yard-1",
    title: "置き場",
    lineup: [
      {
        kind: "page",
        id: "yard-p1",
        type: "ex7:yard",
        title: "P",
        paper: "@matomezu/base:a4",
        orientation: "landscape",
        items: [
          { id: "c1", item: "ex7:crate", x: 40, y: 40, props: { load: 3 } },
          { id: "c2", item: "ex7:crate", x: 240, y: 40, props: { load: 4 } },
        ],
      },
    ],
  }
  expect((await page.request.put(`/api/books-for-test/${yard.id}`, { data: { book: yard, base: 0 } })).ok()).toBe(true)
  const perform = async (body: object) =>
    (await page.request.post("/api/ai/perform", { headers: aiAuth(), data: body })).json()
  expect(await perform({ action: "ex6:page-weight", args: {}, on: { page: "yard-p1" } })).toMatchObject({
    ok: true,
    result: { weight: 7 },
  })
  // 画面も ex7 の見た目を読み、置き場の木箱を描く
  await page.goto(`/?b0=${yard.id}&p0=yard-p1`)
  await expect(page.locator("[data-ex7-crate]")).toHaveCount(2)
})

test("ex9 と ex14 を読ませると、ex14 のアクションが、ex9 が許した（writableBy）棚を、自分のスタンプの作成と同じ 1 トランザクションで変えて残し、読み直しても同じ。ex9 が許していない種類には書けない", async ({
  page,
}) => {
  await link(page, "test/added-plugins/ex9", "test/added-plugins/ex14")
  const perform = async (body: object) =>
    (await page.request.post("/api/ai/perform", { headers: await joinedAiAuth(), data: body })).json()
  const shelf = await perform({ action: "ex9:shelf-add", args: { name: "本棚" } })
  expect(shelf.ok).toBe(true)
  const id = shelf.result.shelf as string
  expect(await perform({ action: "ex14:stamp-add", args: { shelf: id, mark: "★" } })).toMatchObject({ ok: true })
  expect(await perform({ action: "ex14:stamp-add", args: { shelf: id, mark: "◎" } })).toMatchObject({ ok: true })
  expect(await perform({ action: "ex14:stamp-add", args: { shelf: "nothing", mark: "★" } })).toMatchObject({
    ok: false,
  })
  const records = (await data(page)).records
  expect(records["ex9:shelf"][id].stamps).toBe(2)
  expect(
    Object.values(records["ex14:stamp"])
      .map(r => (r as { mark: string }).mark)
      .sort(),
  ).toEqual(["★", "◎"].sort())
  // 読み直しても同じ（常駐が 1 回の書き込みで残している）
  await page.reload()
  expect((await data(page)).records["ex9:shelf"][id].stamps).toBe(2)
})

test("ex8 を読ませると、自分のプレゼンテーションのビューが開いたページのカードを描き、印刷プレビューは印刷区画 1 つのビュー（printSheet）でページごとに紙を描く", async ({
  page,
}) => {
  await link(page, "test/added-plugins/ex8")
  const deck = {
    id: "deck-1",
    title: "単語帳",
    lineup: [
      {
        kind: "page",
        id: "p1",
        type: "ex8:deck",
        title: "1",
        paper: "@matomezu/base:a4",
        orientation: "portrait",
        cards: ["りんご", "みかん"],
      },
      {
        kind: "page",
        id: "p2",
        type: "ex8:deck",
        title: "2",
        paper: "@matomezu/base:a4",
        orientation: "portrait",
        cards: ["ぶどう"],
      },
    ],
  }
  expect((await page.request.put(`/api/books-for-test/${deck.id}`, { data: { book: deck, base: 0 } })).ok()).toBe(true)
  await page.goto(`/?b0=${deck.id}&p0=p1`)
  await expect(page.locator("[data-ex8-deck] [data-ex8-card]")).toHaveText(["りんご", "みかん"])
  await (await fromMenu(page, "印刷プレビュー")).click()
  const sheets = page.locator("[data-sheet]")
  await expect(sheets).toHaveCount(2)
  await expect(sheets.nth(0).locator("[data-ex8-card]")).toHaveText(["りんご", "みかん"])
  await expect(sheets.nth(1).locator("[data-ex8-card]")).toHaveText(["ぶどう"])
})

test("ex10 のステージに結ばない宣言（address が push）は、変えると URL の w に入ってブラウザの履歴に積まれ、読み直しても戻り、戻ると前の値に戻る", async ({
  page,
}) => {
  await linkOnly(page, "test/added-plugins/ex10")
  await page.goto(BOOK_SCREEN_URL)
  await enablePlugins(page, "ex10")
  const tabs = page.locator("[data-ex10-tabs]")
  await expect(tabs).toHaveAttribute("data-tab", "one")
  await tabs.locator("button").nth(1).click()
  await expect(tabs).toHaveAttribute("data-tab", "two")
  await expect.poll(() => urlPlace(page)?.w).toEqual({ "ex10:tab": "two" })
  await page.reload()
  await expect(page.locator("[data-ex10-tabs]")).toHaveAttribute("data-tab", "two")
  await page.goBack()
  await expect(page.locator("[data-ex10-tabs]")).toHaveAttribute("data-tab", "one")
})

test("ex12 のスクリーンアレンジメントに替えると、スクリーンが縦に並び、ブックスクリーンを 2 枚並べてもどちらのステージも大きさを持つ。押したスクリーンがカレントになり、読み直しても並んだまま", async ({
  page,
}) => {
  await linkOnly(page, "test/added-plugins/ex12")
  await page.goto(BOOK_SCREEN_URL)
  await enablePlugins(page, "ex12")
  await page.locator("[data-ex12-switch] button").nth(0).click()
  const rows = page.locator("[data-ex12-row]")
  await expect(rows).toHaveCount(2)
  // 下の行（巣箱のボタン）は、このスクリーンアレンジメントには無い
  await expect(page.getByRole("button", { name: "コントロールセンター" })).toHaveCount(0)
  await page.locator("[data-ex12-switch] button").nth(3).click()
  await expect(rows).toHaveCount(3)
  const stages = page.getByRole("region", { name: "ステージ" })
  await expect(stages).toHaveCount(2)
  for (const i of [0, 1]) {
    const box = await stages.nth(i).boundingBox()
    expect(box?.height ?? 0).toBeGreaterThan(100)
    expect(box?.width ?? 0).toBeGreaterThan(300)
  }
  // 開いたばかりの 2 枚目がカレント。1 枚目のステージを押すと、そちらがカレントになる
  await expect(rows.nth(2)).toHaveAttribute("data-current", "true")
  await stages.nth(0).click({ position: { x: 20, y: 60 } })
  await expect(rows.nth(1)).toHaveAttribute("data-current", "true")
  await expect.poll(() => urlPlace(page)?.s.length).toBe(3)
  await page.reload()
  await expect(page.locator("[data-ex12-row]")).toHaveCount(3)
  await expect(page.getByRole("region", { name: "ステージ" })).toHaveCount(2)
})
