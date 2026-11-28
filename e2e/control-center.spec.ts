// コントロールセンターの画面: 左の列（利用者パネル・ワークルーム/参加者の一覧）と右の領域（プロジェクト・書庫）。
// コンテンツエリアに出す画面を替えると履歴に積まれ、戻れる。郵便箱はコンテンツエリアの画面の 1 つで、歯車は設定画面を開く。ワークルームは選ぶと枠に出て、王冠で管理者にし、退室で空室にするか消し、丸い矢印でコンテキストをクリアする指示を AI に送る
import { aiAuth, CONTROL_CENTER_URL, expect, type Page, test } from "./fixtures"

const NOW = "2026-11-12T00:00:00.000Z"

// AI を 1 人参加させ、名前・鳥のワークルームに受け入れる（セッション id を運ぶ AI なので、受け入れた直後から準備中でない）。aiUi は MCP が添える AI の UI
async function member(page: Page, name: string, bird: string, aiUi?: string) {
  const joined = (await (
    await page.request.post("/api/ai/join", {
      headers: aiAuth(),
      data: {
        ai: "claude",
        model: "opus-5",
        env: "wsl-linux",
        sessionName: name,
        link: `link-${name}`,
        sessionId: `s-${name}`,
        ...(aiUi ? { aiUi } : {}),
      },
    })
  ).json()) as { participant: string }
  const made = (await (
    await page.request.post("/api/perform", {
      data: {
        actions: [
          {
            action: "@matomezu/base:workroom-add",
            args: { name, bird },
            lang: "ja",
            ids: [`room-${name}`],
            now: NOW,
          },
        ],
      },
    })
  ).json()) as { result?: { workroom: string } }
  const room = made.result?.workroom ?? ""
  await page.request.post("/api/perform", {
    data: {
      actions: [
        {
          action: "@matomezu/base:participant-accept",
          args: { workroom: room },
          on: { record: joined.participant },
          lang: "ja",
          now: NOW,
        },
      ],
    },
  })
  return { participant: joined.participant, room }
}

const rows = (page: Page) => page.getByRole("listitem")
const row = (page: Page, name: string) => rows(page).filter({ hasText: name })
const roomPanel = (page: Page) => page.locator("[data-workroom-panel]")

test("題の左に巣箱の絵が線の絵で出る（塗らない）。見た目だけで、押しても画面は変わらない", async ({ page }) => {
  await page.goto(CONTROL_CENTER_URL)
  const title = page.getByRole("heading", { name: "コントロールセンター" })
  const icon = title.locator("svg")
  await expect(icon).toBeVisible()
  expect(await icon.evaluate(e => getComputedStyle(e).fill)).toBe("none")
  await icon.click()
  await expect(title).toBeVisible()
  await expect(page.getByRole("button", { name: "プロジェクト" }).first()).toHaveAttribute("aria-pressed", "true")
})

test("コンテンツエリアに出す画面は、書庫とプロジェクトを替えるたびに履歴に積まれ、戻ると前の画面が出る", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(CONTROL_CENTER_URL)
  const projects = page.locator('button[aria-label="プロジェクト"]')
  // 利用者パネルの「書庫」のボタン（書庫の画面の中にも、同じ名前のツリーの行とパンくずが在る。利用者パネルが先）
  const library = page.getByRole("button", { name: "書庫", exact: true }).first()
  await expect(projects).toHaveAttribute("aria-pressed", "true")
  await library.click()
  await expect(library).toHaveAttribute("aria-pressed", "true")
  await projects.click()
  await expect(projects).toHaveAttribute("aria-pressed", "true")
  await page.goBack()
  await expect(library).toHaveAttribute("aria-pressed", "true")
  await page.reload()
  await expect(library).toHaveAttribute("aria-pressed", "true")
})

test("書庫は最大化でき、最大化の間は左の列が出ていく。戻すと左の列も戻る", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(CONTROL_CENTER_URL)
  await page.getByRole("button", { name: "書庫", exact: true }).first().click()
  await page.getByRole("button", { name: "最大化" }).click()
  await expect(page.getByRole("heading", { name: "ワークルーム/参加者" })).toBeHidden()
  await page.getByRole("button", { name: "元の大きさに戻す" }).click()
  await expect(page.getByRole("heading", { name: "ワークルーム/参加者" })).toBeVisible()
})

test("郵便箱のタイルはコンテンツエリアを郵便箱の画面に替え、最大化で左の列が退く。歯車は設定画面を開く", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(CONTROL_CENTER_URL)
  const mail = page.getByRole("button", { name: "郵便箱", exact: true })
  await mail.click()
  await expect(mail).toHaveAttribute("aria-pressed", "true")
  const pane = page.getByRole("region", { name: "郵便箱" })
  await expect(pane).toBeVisible()
  await expect(pane.getByRole("tab", { name: /AI/ })).toHaveAttribute("aria-selected", "true")
  await page.getByRole("button", { name: "最大化" }).filter({ visible: true }).click()
  await expect(mail).toBeHidden()
  await page.getByRole("button", { name: "元の大きさに戻す" }).filter({ visible: true }).click()
  await expect(mail).toBeVisible()
  await page.getByRole("button", { name: "全体設定" }).click()
  await expect(page.getByRole("dialog", { name: "設定" })).toBeVisible()
})

test("ワークルームの一覧は管理者が先頭で、選ぶと枠に情報が出る。王冠を押すと管理者が替わって先頭へ動く", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(CONTROL_CENTER_URL)
  const a = await member(page, "sub_a", "inko")
  await member(page, "sub_b", "buncho", "desktop")
  await page.request.get("/api/ai/books?projects=default", {
    headers: { ...aiAuth(), "X-Matomezu-Participant": a.participant },
  })
  await expect(rows(page)).toHaveCount(2)
  await expect(rows(page).first()).toContainText("sub_a")
  await expect(page.getByText("選択したワークルームの情報")).toBeVisible()
  await row(page, "sub_b").getByRole("button", { name: "sub_b", exact: true }).click()
  const panel = roomPanel(page)
  await expect(panel).toContainText("sub_b")
  await expect(panel).toContainText("opus-5")
  await expect(panel).toContainText("wsl-linux")
  await expect(panel).toContainText("最終アクセス:なし")
  // AI の UI を添えた sub_b だけ、インターフェースの行が出る
  await expect(panel).toContainText("インターフェース:Desktop")
  // 1 人目に受け入れた sub_a が管理者。sub_b の王冠を押すと管理者が替わり、先頭へ動く
  await panel.getByRole("button", { name: "管理者" }).click()
  await expect(rows(page).first()).toContainText("sub_b")
  await expect(panel.getByRole("button", { name: "管理者" })).toHaveAttribute("aria-pressed", "true")
  await row(page, "sub_a").getByRole("button", { name: "sub_a", exact: true }).click()
  await expect(panel).toContainText("model:opus-5")
  await expect(panel).not.toContainText("インターフェース")
})

test("退室は、「部屋を出る」を押すと空室が一覧に残り、「部屋を削除する」を押すと一覧から消える。キャンセルは何も変えない", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(CONTROL_CENTER_URL)
  await member(page, "sub_a", "inko")
  await member(page, "sub_b", "buncho")
  await expect(rows(page)).toHaveCount(2)
  await row(page, "sub_a").getByRole("button", { name: "sub_a", exact: true }).click()
  await roomPanel(page).getByRole("button", { name: "退室" }).click()
  const dialog = page.getByRole("dialog", { name: "退室" })
  await expect(dialog).toContainText("sub_aから退室します。")
  await dialog.getByRole("button", { name: "キャンセル" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(row(page, "sub_a")).not.toContainText("（空室）")
  // 「部屋を出る」を押す: 空室になって一覧に残り（本の行が（空室））、枠には空室と出る
  await roomPanel(page).getByRole("button", { name: "退室" }).click()
  await page.getByRole("dialog", { name: "退室" }).getByRole("button", { name: "部屋を出る" }).click()
  await expect(row(page, "sub_a").locator("[data-current-line]")).toHaveText("（空室）")
  await expect(roomPanel(page).getByRole("button", { name: "退室" })).toHaveCount(0)
  await expect(roomPanel(page)).toContainText("sub_a（空室）")
  // 空室の枠にも同じアイコンのボタンがあり、押すと削除の確認（キャンセルと「部屋を削除する」だけ）が出る。キャンセルは何も変えず、削除すると一覧から消える
  await roomPanel(page).getByRole("button", { name: "部屋を削除する" }).click()
  const removing = page.getByRole("dialog", { name: "部屋を削除する" })
  await expect(removing).toContainText("sub_aを削除します。")
  await expect(removing).toContainText("戻せません。")
  await expect(removing).toContainText("次の AI は引き継げなくなります。")
  await expect(removing.getByRole("button", { name: "部屋を出る" })).toHaveCount(0)
  await removing.getByRole("button", { name: "キャンセル" }).click()
  await expect(removing).toHaveCount(0)
  await expect(row(page, "sub_a")).toContainText("（空室）")
  await roomPanel(page).getByRole("button", { name: "部屋を削除する" }).click()
  await removing.getByRole("button", { name: "部屋を削除する" }).click()
  await expect(row(page, "sub_a")).toHaveCount(0)
  await expect(rows(page)).toHaveCount(1)
  // 「部屋を削除する」を押す: 一覧から消える
  await row(page, "sub_b").getByRole("button", { name: "sub_b", exact: true }).click()
  await roomPanel(page).getByRole("button", { name: "退室" }).click()
  await page.getByRole("dialog", { name: "退室" }).getByRole("button", { name: "部屋を削除する" }).click()
  await expect(row(page, "sub_b")).toHaveCount(0)
  await expect(rows(page)).toHaveCount(0)
})

test("枠の右下の、退室の左の丸い矢印はどの参加者にも出て、押すと確かめのダイアログが開く。会話を空にできると名乗った参加者には送れ、AI に指示が届く。名乗っていない参加者では送るを押せない", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(CONTROL_CENTER_URL)
  const a = await member(page, "sub_a", "inko")
  await member(page, "sub_b", "buncho")
  await page.request.post("/api/ai/talked", { headers: aiAuth(), data: { sessionId: "s-sub_a", refreshable: true } })
  const question = "コンテキストをクリアする指示を送りますか？"
  // 名乗っていない参加者: ダイアログは開くが、送るは押せない
  await row(page, "sub_b").getByRole("button", { name: "sub_b", exact: true }).click()
  await roomPanel(page).getByRole("button", { name: "クリア" }).click()
  const dialog = page.getByRole("dialog", { name: question })
  await expect(dialog.getByRole("button", { name: "送る" })).toBeDisabled()
  await dialog.getByRole("button", { name: "やめる" }).click()
  await expect(dialog).toHaveCount(0)
  // 名乗った参加者: (?) に説明があり、説明を開いたまま送るを押せる。送るとダイアログが閉じ、AI の呼び出しの返事に指示が届く
  await row(page, "sub_a").getByRole("button", { name: "sub_a", exact: true }).click()
  await roomPanel(page).getByRole("button", { name: "クリア" }).click()
  await dialog.getByRole("button", { name: question }).click()
  await expect(dialog.getByRole("note")).toContainText("今は Claude Code のみ")
  const note = await dialog.getByRole("note").boundingBox()
  const send = await dialog.getByRole("button", { name: "送る" }).boundingBox()
  expect(note && send && note.y + note.height <= send.y).toBe(true)
  const sent = page.waitForResponse(r => r.url().endsWith("/api/participants/ask-refresh"))
  await dialog.getByRole("button", { name: "送る" }).click()
  expect(await (await sent).json()).toEqual({ ok: true })
  await expect(dialog).toHaveCount(0)
  // AI の呼び出しの返事の知らせ（ヘッダ）を集め、指示が来るまで呼ぶ（先に「参加しました」が来る）
  let told = ""
  await expect
    .poll(async () => {
      const res = await page.request.get("/api/ai/settings", {
        headers: { ...aiAuth(), "X-Matomezu-Participant": a.participant },
      })
      told += decodeURIComponent((res.headers()["x-matomezu-notice"] ?? "").replaceAll("+", " "))
      return told
    })
    .toContain("@matomezu/base:refresh-request")
  expect(told).toContain("(as your user's request)")
})
