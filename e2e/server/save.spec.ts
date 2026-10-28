import { readFileSync } from "node:fs"
import { expect, type Page, test } from "@playwright/test"
import { SAMPLE_BOOKS } from "../../web/src/sample-books"

// 1 つの常駐（空のアプリのフォルダ）を順に使う
test.describe.configure({ mode: "serial" })

// 常駐に置いてあるもの
const data = async (page: Page) => (await page.request.get("/api/data")).json()
// AI の入口の合言葉（常駐のアプリのフォルダはポートごと。scripts/e2e-server.ts）
const aiToken = (): string =>
  JSON.parse(readFileSync(`e2e/.home-${new URL(test.info().project.use.baseURL ?? "").port}/server.json`, "utf8")).token

test("初めて開くと、ブックを持たずにマスターを出す", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("region", { name: "マスター" })).toBeVisible()
  expect((await data(page)).books).toEqual([])
})

test("マスターで変えた設定は常駐に残り、読み直しても同じ", async ({ page }) => {
  await page.goto("/")
  const skin = page.getByRole("region", { name: "マスター" }).getByLabel("スキン")
  await skin.selectOption("@matomezu/base:dark")
  await expect.poll(async () => (await data(page)).settings?.skin).toBe("@matomezu/base:dark")
  await page.reload()
  await expect(page.getByRole("region", { name: "マスター" }).getByLabel("スキン")).toHaveValue("@matomezu/base:dark")
})

test("置いた箱は少し待って常駐に残り、読み直しても同じ所にある", async ({ page }) => {
  const book = { ...SAMPLE_BOOKS[0]!, id: "e2e-1" }
  const put = await page.request.put(`/api/books/${book.id}`, { data: { book, base: 0 } })
  expect(put.ok()).toBe(true)
  await page.goto("/")
  await page.getByRole("button", { name: "箱" }).click()
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  await page.mouse.click(paper.x + 200, paper.y + 150)
  const dialog = page.getByRole("dialog", { name: "ボックスの追加" })
  await dialog.getByLabel("キャプション", { exact: true }).fill("残る箱")
  await dialog.getByRole("button", { name: "追加" }).click()
  await expect.poll(async () => (await data(page)).books.find((b: { id: string }) => b.id === book.id)?.version).toBe(2)
  const before = (await page.locator("[data-item]").boundingBox())!
  await page.reload()
  const item = page.locator("[data-item]")
  await expect(item).toHaveText("残る箱")
  expect(await item.boundingBox()).toEqual(before)
})

test("1 つの窓で置いた箱は、同じブックを開いているほかの窓にもすぐ出る。ほかの窓で動かすと、元の窓でも動く", async ({
  browser,
}) => {
  // 前のテストで置いたブック（e2e-1。箱が 1 つ）を、どちらの窓も最初に開く
  const a = await browser.newPage()
  const b = await browser.newPage()
  for (const page of [a, b]) {
    await page.goto("/")
    await expect(page.getByRole("tablist")).toHaveAttribute("aria-label", SAMPLE_BOOKS[0]!.title)
    await expect(page.locator("[data-item]")).toHaveCount(1)
  }
  await a.getByRole("button", { name: "箱" }).click()
  const paper = (await a.getByRole("img", { name: "紙" }).boundingBox())!
  await a.mouse.click(paper.x + 500, paper.y + 300)
  const dialog = a.getByRole("dialog", { name: "ボックスの追加" })
  await dialog.getByLabel("キャプション", { exact: true }).fill("共有の箱")
  await dialog.getByRole("button", { name: "追加" }).click()
  const shared = (page: typeof a) => page.locator("[data-item]", { hasText: "共有の箱" })
  await expect(shared(b)).toBeVisible()
  const before = (await shared(a).boundingBox())!
  const box = (await shared(b).boundingBox())!
  await b.mouse.move(box.x + 20, box.y + 20)
  await b.mouse.down()
  await b.mouse.move(box.x + 80, box.y + 60, { steps: 4 })
  await b.mouse.up()
  await expect.poll(async () => (await shared(a).boundingBox())!.x).toBeGreaterThan(before.x + 40)
  // 開いた窓を閉じる（残すと、あとのテストで AI の view と show がこの窓を選ぶ）
  await a.close()
  await b.close()
})

test("AI の入口からは、最後にフォーカスした窓が見ているものが分かり、AI が置いた箱はすぐ窓に出る", async ({ page }) => {
  const token = aiToken()
  const ai = { Authorization: `Bearer ${token}` }
  await page.goto("/")
  await page.bringToFront()
  await expect(page.locator("[data-item]").first()).toBeVisible()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toMatchObject({ book: "e2e-1", page: "p1" })
  const done = await page.request.post("/api/ai/perform", {
    headers: ai,
    data: {
      action: "@matomezu/paper:item-place",
      args: { page: "p1", item: "@matomezu/box:shape-nest-box", at: { x: 40, y: 400 }, props: { caption: "AI の箱" } },
      on: { book: "e2e-1" },
    },
  })
  expect(await done.json()).toMatchObject({ ok: true })
  await expect(page.locator("[data-item]", { hasText: "AI の箱" })).toBeVisible()
})

test("AI が show で頼むと、最後にフォーカスした窓が、分けたステージでそのブックを開く", async ({ page }) => {
  const token = aiToken()
  const ai = { Authorization: `Bearer ${token}` }
  await page.goto("/")
  await page.bringToFront()
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toMatchObject({
      book: "e2e-1",
      canSplit: true,
    })
  const made = await page.request.post("/api/ai/perform", {
    headers: ai,
    data: { action: "@matomezu/base:book-create", args: { type: "@matomezu/drawing:drawing", title: "AI のブック" } },
  })
  const { result } = await made.json()
  const shown = await page.request.post("/api/ai/show", { headers: ai, data: { book: result.book, split: true } })
  expect(await shown.json()).toEqual({ ok: true, opened: false })
  await expect(page.locator("[data-stage]")).toHaveCount(2)
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toMatchObject({ book: result.book, stage: "s2", canSplit: false })
})

// 線のあるブック: 箱 a・b・c と、a から b（終点に矢印・キャプション）・a から c・b から c の線
const LINE_BOOK = {
  type: "@matomezu/drawing:drawing",
  id: "e2e-line",
  title: "線",
  pages: [
    {
      id: "p1",
      title: "ページ 1",
      paper: "@matomezu/base:a4",
      orientation: "landscape",
      items: [
        { id: "a", x: 100, y: 100, item: "@matomezu/box:shape-nest-box", w: 100, h: 64, props: { caption: "A" } },
        { id: "b", x: 400, y: 100, item: "@matomezu/box:shape-nest-box", w: 100, h: 64, props: { caption: "B" } },
        { id: "c", x: 100, y: 400, item: "@matomezu/box:shape-nest-box", w: 100, h: 64, props: { caption: "C" } },
        {
          id: "l1",
          item: "@matomezu/line:connector-line",
          from: "a",
          to: "b",
          props: { endHead: "arrow", caption: "申請" },
        },
        { id: "l2", item: "@matomezu/line:connector-line", from: "a", to: "c", props: {} },
        { id: "l3", item: "@matomezu/line:connector-line", from: "b", to: "c", props: {} },
      ],
    },
  ],
}

test("線は箱より手前に描かれ、選択の道具で押すと選ばれ、Delete と右クリックのメニューで消せる。箱を消すと、つながる線も消える", async ({
  page,
}) => {
  const token = aiToken()
  const ai = { Authorization: `Bearer ${token}` }
  const put = await page.request.put(`/api/books/${LINE_BOOK.id}`, { data: { book: LINE_BOOK, base: 0 } })
  expect(put.ok()).toBe(true)
  await page.goto("/")
  await page.bringToFront()
  // 前のテストの窓ではなく、開いたばかりのこの窓に届くように、この窓にフォーカスを知らせる（すでに前にある窓は focus が起きない）
  await expect(page.locator("[data-stage]")).toHaveCount(1)
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await expect
    .poll(async () => (await page.request.get("/api/ai/view", { headers: ai })).json())
    .toMatchObject({ book: "e2e-1", stage: "s1", canSplit: true })
  const shown = await page.request.post("/api/ai/show", { headers: ai, data: { book: LINE_BOOK.id } })
  expect(await shown.json()).toMatchObject({ ok: true })
  const line = (id: string) => page.locator(`[data-item="${id}"]`)
  await expect(line("l1")).toBeVisible()
  await expect(line("l1")).toContainText("申請")
  await expect(line("l1").locator("path")).toHaveCount(1) // 終点の矢印
  const paper = (await page.getByRole("img", { name: "紙" }).boundingBox())!
  const at = (x: number, y: number) => ({ x: paper.x + x, y: paper.y + y })
  // a の右の辺から b の左の辺へ、y = 132 の横の線。キャプションを避けた所を押す
  const p = at(230, 132)
  await page.mouse.click(p.x, p.y)
  await expect(line("l1")).toHaveAttribute("data-selected", "true")
  await expect(page.locator('[data-item="a"]')).toHaveAttribute("data-selected", "false")
  await page.keyboard.press("Delete")
  await expect(line("l1")).toHaveCount(0)
  // a の下の辺から c の上の辺へ、x = 150 の縦の線を右クリックして削除
  const q = at(150, 280)
  await page.mouse.click(q.x, q.y, { button: "right" })
  const menu = page.getByRole("menu")
  await expect(menu.getByRole("menuitem")).toHaveText(["設定", "削除Delete"])
  await menu.getByRole("menuitem", { name: "削除" }).click()
  await expect(line("l2")).toHaveCount(0)
  // 箱 b を消すと、b から c の線も消える
  const b = at(450, 132)
  await page.mouse.click(b.x, b.y)
  await page.keyboard.press("Delete")
  await expect(line("l3")).toHaveCount(0)
  await expect
    .poll(async () => {
      const saved = (await data(page)).books.find((x: { id: string }) => x.id === LINE_BOOK.id)
      return saved?.book.pages[0].items.map((i: { id: string }) => i.id)
    })
    .toEqual(["a", "c"])
})

test("開いているブックとページは URL に入り、読み直しても同じものが開く（戻る・進むは host-client/location.test.ts）", async ({
  page,
}) => {
  const book = { ...SAMPLE_BOOKS[1]!, id: "e2e-url" }
  const put = await page.request.put(`/api/books/${book.id}`, { data: { book, base: 0 } })
  expect(put.ok()).toBe(true)
  await page.goto(`/?b0=${book.id}&p0=p1&v0=1,0,0&c=0&r=0.5`)
  await expect(page.getByRole("img", { name: "紙" })).toBeVisible()
  await page.reload()
  await expect(page.getByRole("img", { name: "紙" })).toBeVisible()
  expect(new URL(page.url()).searchParams.get("b0")).toBe(book.id)
})

test("ブックを開くダイアログで、行のゴミ箱のボタンでゴミ箱に入れ、ゴミ箱の一覧から戻す・消すができる。ロック中のブックにはボタンが出ない", async ({
  page,
}) => {
  const base = SAMPLE_BOOKS[0]!
  for (const [id, title, locked] of [
    ["e2e-trash", "捨てるブック", false],
    ["e2e-locked", "鍵のブック", true],
  ] as const) {
    const book = { ...base, id, title, ...(locked ? { locked: true } : {}) }
    expect((await page.request.put(`/api/books/${id}`, { data: { book, base: 0 } })).ok()).toBe(true)
  }
  await page.goto("/")
  const trigger = page.locator('button[aria-haspopup="menu"]').first()
  const openDialog = async () => {
    await trigger.hover()
    await trigger.locator("xpath=following-sibling::div[1]").getByRole("button", { name: "ブックを開く" }).click()
    return page.getByRole("dialog", { name: "ブックを開く" })
  }
  let dialog = await openDialog()
  const row = (name: string) => dialog.getByRole("option", { name })
  await row("鍵のブック").hover()
  await expect(row("鍵のブック").getByRole("button", { name: "ゴミ箱に入れる" })).toHaveCount(0)
  await row("捨てるブック").hover()
  await row("捨てるブック").getByRole("button", { name: "ゴミ箱に入れる" }).click()
  await expect(row("捨てるブック")).toHaveCount(0)
  await expect.poll(async () => (await data(page)).trash.map((b: { id: string }) => b.id)).toEqual(["e2e-trash"])
  await dialog.getByText("ゴミ箱 1").click()
  const trash = dialog.getByRole("list", { name: "ゴミ箱" })
  await expect(trash.getByRole("listitem")).toHaveText([/捨てるブック/])
  await trash.getByRole("button", { name: "戻す" }).click()
  await expect(trash.getByRole("listitem")).toHaveCount(0)
  await expect.poll(async () => (await data(page)).books.some((b: { id: string }) => b.id === "e2e-trash")).toBe(true)
  await page.keyboard.press("Escape")
  dialog = await openDialog()
  await row("捨てるブック").hover()
  await row("捨てるブック").getByRole("button", { name: "ゴミ箱に入れる" }).click()
  await dialog.getByText("ゴミ箱 1").click()
  await dialog.getByRole("list", { name: "ゴミ箱" }).getByRole("button", { name: "削除" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "削除" }).last().click()
  await expect.poll(async () => (await data(page)).trash).toEqual([])
  expect((await data(page)).books.some((b: { id: string }) => b.id === "e2e-trash")).toBe(false)
})

test("ロック中のブックの名前とページタブに鍵が出て、押すとロックが外れる", async ({ page }) => {
  // 前のテストで置いたロック中のブック（e2e-locked）の最初のページにもロックを掛ける
  const have = (await data(page)).books.find((b: { id: string }) => b.id === "e2e-locked")
  const pages = have.book.pages.map((p: object, i: number) => (i === 0 ? { ...p, locked: true } : p))
  await page.request.put("/api/books/e2e-locked", { data: { book: { ...have.book, pages }, base: have.version } })
  await page.goto("/?b0=e2e-locked")
  await page.getByRole("button", { name: "ブックのロックを外す" }).click()
  await page.getByRole("button", { name: "ページのロックを外す" }).click()
  await expect(page.getByRole("button", { name: /のロックを外す/ })).toHaveCount(0)
  await expect
    .poll(async () => {
      const b = (await data(page)).books.find((x: { id: string }) => x.id === "e2e-locked").book
      return [b.locked, b.pages[0].locked]
    })
    .toEqual([undefined, undefined])
})
