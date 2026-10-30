// 箱を数百と線を置いたときの速さ。合否は付けず、数値を端末の表と e2e/.perf/<日時>.json に出す。
// - 描き方: 箱 100・200・300 と線のブックを置き（JSON を PUT）、開くまで・パン（ホイール）・箱のドラッグ・〇から線を引く・左右に同じブックを開いてのパンを測る
// - アクション: AI の入口から item-place と line-connect を 300 まで重ね、1 回の perform の時間を 100 ずつに分けて測る
import { execSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { expect, type Page, test } from "@playwright/test"
import { BOX_SIZE, boxAt, gridBook, PAGE } from "./books"
import { awaitItems, installProbe, readyAt, startRecording, stopRecording } from "./probe"

test.describe.configure({ mode: "serial" })

const COUNTS = [100, 200, 300]
const PAN_STEPS = 60 // ホイールを回す回数（行きと帰りで半分ずつ）
const DRAG_STEPS = 60 // ドラッグでポインタを動かす回数（行きと帰りで半分ずつ）

// 並びの要約（ms、小数 1 桁）
function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
  const r = (n: number) => Math.round(n * 10) / 10
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
  return { count: values.length, avg: r(avg), p50: r(at(0.5)), p95: r(at(0.95)), max: r(sorted.at(-1) ?? 0) }
}

type Recorded = Awaited<ReturnType<typeof stopRecording>>
const measured = (rec: Recorded) => ({
  frame: summary(rec.frames),
  longTasks: { count: rec.longTasks.length, total: Math.round(rec.longTasks.reduce((a, t) => a + t.duration, 0)) },
  commits: rec.commits,
  renders: rec.renders,
  itemRedraws: rec.itemRedraws,
})

const results: { drawing: Record<string, unknown>[]; actions: Record<string, unknown>[] } = { drawing: [], actions: [] }

// 開いて、アイテムの要素が want 個そろうまでの時間（ページを開き始めてから）
async function open(page: Page, search: string, want: number) {
  await installProbe(page)
  await awaitItems(page, want)
  await page.goto(`/${search}`)
  await expect.poll(() => readyAt(page), { timeout: 60_000 }).not.toBeNull()
  const ms = Math.round((await readyAt(page))!)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
  return ms
}

// 1 つ目のステージの真ん中でホイールを回し、紙を下へずらしてから戻す
async function pan(page: Page) {
  const stage = (await page.locator("[data-stage]").first().boundingBox())!
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2)
  const since = await startRecording(page)
  for (let i = 0; i < PAN_STEPS; i++) await page.mouse.wheel(0, i < PAN_STEPS / 2 ? 20 : -20)
  await page.waitForTimeout(200)
  return measured(await stopRecording(page, since))
}

// 真ん中あたりの箱をつかみ、右下へ 200 動かしてから元の所へ戻して放す
async function drag(page: Page, n: number) {
  const box = (await page.locator(`[data-item="b${Math.floor(n / 2)}"]`).boundingBox())!
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(from.x, from.y)
  const since = await startRecording(page)
  await page.mouse.down()
  await page.mouse.move(from.x + 200, from.y + 200, { steps: DRAG_STEPS / 2 })
  await page.mouse.move(from.x, from.y, { steps: DRAG_STEPS / 2 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  return measured(await stopRecording(page, since))
}

// 4 行目の左端の箱（画面に入り、ドラッグで選んだ箱でない）の右の〇から、2 つ右の箱（線でつながっていない）へ線を引く。離してから線が描かれるまでの時間も測る
async function connect(page: Page) {
  const from = page.locator('[data-item="b45"]')
  const s = (await from.boundingBox())!
  const to = (await page.locator('[data-item="b47"]').boundingBox())!
  const lines = page.locator("[data-item]:not([data-shape])")
  const before = await lines.count()
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2)
  const port = (await from.locator('[data-port="r"]').boundingBox({ timeout: 10_000 }))!
  await page.mouse.move(port.x + port.width / 2, port.y + port.height / 2)
  const since = await startRecording(page)
  await page.mouse.down()
  await page.mouse.move(to.x + 10, to.y + to.height / 2, { steps: DRAG_STEPS / 2 })
  const up = await page.evaluate(() => performance.now())
  await page.mouse.up()
  await expect(lines).toHaveCount(before + 1)
  const drawnMs = Math.round((await page.evaluate(() => performance.now())) - up)
  await page.waitForTimeout(200)
  return { ...measured(await stopRecording(page, since)), drawnMs }
}

const one = (book: string) => `?b0=${book}&p0=${PAGE}&v0=1,0,0&c=0&r=0.5`
const split = (book: string) => `?b0=${book}&p0=${PAGE}&v0=1,0,0&b1=${book}&p1=${PAGE}&v1=1,0,0&c=0&r=0.5`

for (const n of COUNTS) {
  test(`描き方: 箱 ${n}・線 ${n - 1}`, async ({ browser, request }) => {
    const id = `perf-${n}`
    const put = await request.put(`/api/books/${id}`, { data: { book: gridBook(id, n), base: 0 } })
    expect(put.ok()).toBe(true)
    const items = n + n - 1

    const single = await browser.newPage()
    const openMs = await open(single, one(id), items)
    const panned = await pan(single)
    const dragged = await drag(single, n)
    const connected = await connect(single)
    await single.close()

    const both = await browser.newPage()
    const openSplitMs = await open(both, split(id), items * 2)
    await expect(both.locator("[data-stage]")).toHaveCount(2)
    const pannedSplit = await pan(both)
    await both.close()

    results.drawing.push({
      boxes: n,
      lines: n - 1,
      openMs,
      openSplitMs,
      pan: panned,
      drag: dragged,
      connect: connected,
      panSplit: pannedSplit,
    })
  })
}

test("アクション: AI の入口から箱と線を 300 まで足す", async ({ page, request }) => {
  const port = new URL(test.info().project.use.baseURL ?? "").port
  const token = JSON.parse(readFileSync(`e2e/.home-${port}/server.json`, "utf8")).token
  const headers = { Authorization: `Bearer ${token}` }
  await page.goto("/")
  const perform = async (body: Record<string, unknown>) => {
    const start = performance.now()
    const res = await request.post("/api/ai/perform", { headers, data: body })
    const ms = performance.now() - start
    const json = await res.json()
    expect(json, JSON.stringify(body)).toMatchObject({ ok: true })
    return { ms, result: json.result }
  }
  const n = Math.max(...COUNTS)
  const made = await perform({
    action: "@matomezu/base:book-create",
    args: { type: "@matomezu/drawing:drawing", title: "速さ" },
  })
  const book = made.result.book as string
  const on = { book }
  const added = await perform({
    action: "@matomezu/base:page-add",
    args: { title: "ページ 1", paper: "@matomezu/base:a3", orientation: "landscape" },
    on,
  })
  const pageId = added.result.page as string
  const places: number[] = []
  const ids: string[] = []
  for (let i = 0; i < n; i++) {
    const done = await perform({
      action: "@matomezu/paper:item-place",
      args: {
        page: pageId,
        item: "@matomezu/box:shape-nest-box",
        at: boxAt(i),
        ...BOX_SIZE,
        props: { caption: String(i + 1) },
      },
      on,
    })
    places.push(done.ms)
    ids.push(done.result.item as string)
  }
  const connects: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const done = await perform({
      action: "@matomezu/line:line-connect",
      args: { page: pageId, from: ids[i], to: ids[i + 1] },
      on,
    })
    connects.push(done.ms)
  }
  for (const upTo of COUNTS) {
    const from = upTo - 100
    results.actions.push({
      range: `${from + 1}-${upTo}`,
      itemPlace: summary(places.slice(from, upTo)),
      lineConnect: summary(connects.slice(from, upTo)),
    })
  }
})

test.afterAll(({ browserName }) => {
  const sha = execSync("git rev-parse --short HEAD").toString().trim()
  const at = new Date().toISOString()
  const report = {
    at,
    commit: sha,
    browser: browserName,
    viewport: { width: 1280, height: 800 },
    panSteps: PAN_STEPS,
    dragSteps: DRAG_STEPS,
    ...results,
  }
  mkdirSync("e2e/.perf", { recursive: true })
  const file = `e2e/.perf/${at.replace(/[:.]/g, "-")}.json`
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`)
  const f = (s: { avg: number; p50: number; p95: number; max: number }) => `${s.avg}/${s.p50}/${s.p95}/${s.max}`
  type M = ReturnType<typeof measured>
  const redraws = (m: M) =>
    Object.entries(m.itemRedraws)
      .map(([s, c]) => `${s}:${c}`)
      .join(" ") || "0"
  const rows = results.drawing.flatMap(d => {
    const r = d as {
      boxes: number
      openMs: number
      openSplitMs: number
      pan: M
      drag: M
      connect: M & { drawnMs: number }
      panSplit: M
    }
    return (
      [
        ["パン", r.pan, r.openMs, null],
        ["ドラッグ", r.drag, null, null],
        ["線を引く", r.connect, null, r.connect.drawnMs],
        ["左右でパン", r.panSplit, r.openSplitMs, null],
      ] as const
    ).map(([what, m, openMs, drawnMs]) => ({
      箱: r.boxes,
      操作: what,
      "開くまで ms": openMs ?? "",
      "離して描くまで ms": drawnMs ?? "",
      "1コマ ms 平均/中央/95%/最大": f(m.frame),
      "長い処理 回/ms": `${m.longTasks.count}/${m.longTasks.total}`,
      コミット: m.commits,
      描き直したコンポーネント: m.renders,
      "描き直したアイテム（ステージ:数）": redraws(m),
    }))
  })
  // -g で一部だけ流したときは、流した方の表だけを出す
  if (rows.length > 0) {
    console.log("\n描き方")
    console.table(rows)
  }
  if (results.actions.length > 0) {
    console.log("\nアクション（1 回の perform の ms 平均/中央/95%/最大）")
    console.table(
      results.actions.map(a => {
        const r = a as { range: string; itemPlace: M["frame"]; lineConnect: M["frame"] }
        return { 何個目: r.range, "item-place": f(r.itemPlace), "line-connect": f(r.lineConnect) }
      }),
    )
  }
  console.log(`書き出した: ${file}`)
})
