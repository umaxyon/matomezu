// コントロールセンターの画面: 左の列（利用者パネル・ワークルーム/参加者の一覧）と右の領域（プロジェクト・書庫）。
// 前に出す画面を替えると履歴に積まれ、戻れる。郵便は左サイドパネルを開閉し、歯車は設定画面を開く。ワークルームは選ぶと枠に出て、王冠で管理者にし、退室で空室にするか消す
import { aiAuth, CONTROL_CENTER_URL, expect, type Page, test } from "./fixtures"

const NOW = "2026-11-12T00:00:00.000Z"

// AI を 1 人参加させ、名前・鳥のワークルームに受け入れる（セッション id を運ぶ AI なので、受け入れた直後から準備中でない）
async function member(page: Page, name: string, bird: string) {
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

test("前に出す画面は、書庫とプロジェクトを替えるたびに履歴に積まれ、戻ると前の画面が前に出る", async ({ page }) => {
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
  await page.getByRole("button", { name: "元に戻す" }).click()
  await expect(page.getByRole("heading", { name: "ワークルーム/参加者" })).toBeVisible()
})

test("郵便のボタンは本物の左サイドパネルを開閉し、歯車は設定画面を開く", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(CONTROL_CENTER_URL)
  const panel = page.getByRole("complementary", { name: "左サイドパネル" })
  const mail = page.getByRole("button", { name: "郵便", exact: true })
  await mail.click()
  await expect(panel).toBeVisible()
  await expect(mail).toHaveAttribute("aria-pressed", "true")
  await mail.click()
  await expect(panel).toBeHidden()
  await page.getByRole("button", { name: "全体設定" }).click()
  await expect(page.getByRole("dialog", { name: "設定" })).toBeVisible()
})

test("ワークルームの一覧は管理者が先頭で、選ぶと枠に情報が出る。王冠を押すと管理者が替わって先頭へ動く", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(CONTROL_CENTER_URL)
  const a = await member(page, "sub_a", "inko")
  await member(page, "sub_b", "buncho")
  await page.request.get("/api/ai/books?projects=default", {
    headers: { ...aiAuth(), "X-Matomezu-Participant": a.participant },
  })
  await expect(rows(page)).toHaveCount(2)
  await expect(rows(page).first()).toContainText("sub_a")
  await expect(page.getByText("選択したワークルームの情報")).toBeVisible()
  await row(page, "sub_b").getByRole("button").click()
  const panel = roomPanel(page)
  await expect(panel).toContainText("sub_b")
  await expect(panel).toContainText("opus-5")
  await expect(panel).toContainText("wsl-linux")
  await expect(panel).toContainText("最終アクセス:なし")
  // 管理者の印はまだ無い。sub_b の王冠を押すと管理者になり、先頭へ動く
  await panel.getByRole("button", { name: "管理者" }).click()
  await expect(rows(page).first()).toContainText("sub_b")
  await expect(panel.getByRole("button", { name: "管理者" })).toHaveAttribute("aria-pressed", "true")
})

test("退室は、部屋を出ると空室が一覧に残り、部屋を削除すると一覧から消える。キャンセルは何も変えない", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(CONTROL_CENTER_URL)
  await member(page, "sub_a", "inko")
  await member(page, "sub_b", "buncho")
  await expect(rows(page)).toHaveCount(2)
  await row(page, "sub_a").getByRole("button").click()
  await roomPanel(page).getByRole("button", { name: "退室" }).click()
  const dialog = page.getByRole("dialog", { name: "退室" })
  await expect(dialog).toContainText("sub_aから退室します。")
  await dialog.getByRole("button", { name: "キャンセル" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(row(page, "sub_a")).not.toContainText("（空室）")
  // 部屋を出る: 空室になって一覧に残り、枠には空室と出る
  await roomPanel(page).getByRole("button", { name: "退室" }).click()
  await page.getByRole("dialog", { name: "退室" }).getByRole("button", { name: "部屋を出る" }).click()
  await expect(row(page, "sub_a")).toContainText("（空室）")
  await expect(roomPanel(page).getByRole("button", { name: "退室" })).toHaveCount(0)
  await expect(roomPanel(page)).toContainText("sub_a（空室）")
  // 空室の枠にも同じアイコンのボタンがあり、押すと削除の確認（キャンセルと部屋を削除するだけ）が出る。キャンセルは何も変えず、削除すると一覧から消える
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
  // 部屋を削除する: 一覧から消える
  await row(page, "sub_b").getByRole("button").click()
  await roomPanel(page).getByRole("button", { name: "退室" }).click()
  await page.getByRole("dialog", { name: "退室" }).getByRole("button", { name: "部屋を削除する" }).click()
  await expect(row(page, "sub_b")).toHaveCount(0)
  await expect(rows(page)).toHaveCount(0)
})
