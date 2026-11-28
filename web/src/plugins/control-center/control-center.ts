// コントロールセンター: ブックの一覧・利用者の設定・対象の定義の種類（郵便・参加者リストなどのレコード）を変えるアクションを許す。
// 組織ごとのコントロールセンターは、このプラグインの代わりに自分のものを渡す
import { z } from "zod"
import { kit } from "./kit"

export const CONTROL_CENTER = kit.defineControlCenter({
  id: "control-center",
  actions: [
    "@matomezu/base:book-create",
    "@matomezu/base:folder-create",
    "@matomezu/base:entry-move",
    "@matomezu/base:entry-move-over",
    "@matomezu/base:entry-rename",
    "@matomezu/base:entry-duplicate",
    "@matomezu/base:entry-remove",
    "@matomezu/base:library-reference-add",
    "@matomezu/base:library-reference-remove",
    "@matomezu/base:print-preview-update",
    "@matomezu/base:page-create",
    "@matomezu/base:page-create-over",
    "@matomezu/base:worker-page-add",
    "@matomezu/base:refresh-request",
    "@matomezu/base:entry-trash",
    "@matomezu/base:entry-restore",
    "@matomezu/base:entry-purge",
    "@matomezu/base:trash-empty",
    "@matomezu/base:history-revert",
    "@matomezu/base:library-revert",
    "@matomezu/base:settings-set",
  ],
  subjects: "all",
})

// コントロールセンターのコンテンツエリアに出す画面（画面の場所に入れるプラグイン状態。コントロールセンターのスクリーン 1 枚ごとの値で、変えるたびにブラウザの履歴に積む）。
// 値は、プロジェクトの画面（projects）・書庫の画面（library）・郵便箱の画面（mailbox）。値が無ければ、プロジェクトの画面を出す
export const CONTENT_AREA = kit.definePluginState({
  id: "content-area",
  scope: "screen",
  schema: z.enum(["projects", "library", "mailbox"]),
  address: "push",
  default: "projects",
})

export type ContentArea = "projects" | "library" | "mailbox"

// コントロールセンターのスクリーン: 窓を開いたときから開いている、利用者に 1 つの入口。渡す値は無い
export const CONTROL_CENTER_SCREEN = kit.defineScreen({
  id: "screen",
  title: "Control center",
  aiDescription:
    "The control center: the user's one entry that is not a book (the user panel, the workrooms and participants, and a content area that shows the projects, the library or the mailbox).",
  props: z.strictObject({}),
  atStart: true,
  wideSearchToggle: true,
  // 書庫の画面を出している間だけ、base の書庫（LibraryView）を見せている（プロジェクトの画面の間は、描いたまま隠している）
  libraryAppearances: ["@matomezu/base:library"],
  shownLibraryAppearances: read => (read(CONTENT_AREA) === "library" ? ["@matomezu/base:library"] : []),
  // 郵便箱と書庫は、コンテンツエリアの画面に出す（しおりや読めない物の知らせの［見る］を押せば、郵便箱・書庫のスクリーンを開かずに、ここに替える）
  viewsInside: {
    "@matomezu/base:mailbox-screen": { state: CONTENT_AREA.id, value: "mailbox", away: "projects" },
    "@matomezu/base:library-screen": { state: CONTENT_AREA.id, value: "library" },
  },
})

// 選んでいる物（画面の場所に入れるプラグイン状態。スクリーン 1 枚ごとの値で、履歴には積まない）: 種類の id（kind）とレコードの id。どれか 1 つだけを選ぶ。
// ワークルーム（base の workroom）とビジター（base の participant）は右の下の枠にコントロールセンターが描き、ほかの種類はスロット picked-detail のその種類の物が描く。
// ほかのプラグインは、宣言の id で書く（ほかのホストの行など）。選んだ物が無くなれば、選んでいないのと同じ
// 右の下の枠にコントロールセンターが描く種類（base の物。別のプラグインの定義は id で選ぶ）
export const WORKROOM_KIND = "@matomezu/base:workroom"
export const PARTICIPANT_KIND = "@matomezu/base:participant"
const PICKED_SCHEMA = z.object({ kind: z.string().min(1), id: z.string().min(1) })
export type Picked = z.infer<typeof PICKED_SCHEMA>
export const PICKED = kit.definePluginState({
  id: "picked",
  scope: "screen",
  schema: PICKED_SCHEMA,
  address: "replace",
})

// 書庫の画面を最大化しているか（スクリーン 1 枚ごとの状態。読み直すと消える）
export const LIBRARY_MAXIMIZED = kit.definePluginStateOf<boolean>()({
  id: "library-maximized",
  scope: "screen",
  default: false,
})

// 郵便箱の画面を最大化しているか（スクリーン 1 枚ごとの状態。読み直すと消える）
export const MAILBOX_MAXIMIZED = kit.definePluginStateOf<boolean>()({
  id: "mailbox-maximized",
  scope: "screen",
  default: false,
})

// 退室の確認のダイアログ（「部屋を出る」・「部屋を削除する」）。退室するワークルームの id を受け取る
export const WORKROOM_LEAVE_DIALOG = kit.defineDialogWith<{ workroom: string }>()({ id: "workroom-leave" })

// 引継ぎページを書いて会話を空にするよう AI に頼む確認のダイアログ。送る先のワークルームの id と、そこに入っている参加者の id を受け取る
export const ASK_REFRESH_DIALOG = kit.defineDialogWith<{ workroom: string; participant: string }>()({
  id: "ask-refresh",
})

// ビジターを外す確認のダイアログ。外すビジターの参加者の id を受け取る
export const VISITOR_LEAVE_DIALOG = kit.defineDialogWith<{ participant: string }>()({ id: "visitor-leave" })
