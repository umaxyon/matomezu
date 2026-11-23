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
    "@matomezu/base:print-preview-update",
    "@matomezu/base:page-create",
    "@matomezu/base:worker-page-add",
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

// コントロールセンターのスクリーン: 窓を開いたときから開いている、利用者に 1 つの入口。渡す値は無い
export const CONTROL_CENTER_SCREEN = kit.defineScreen({
  id: "screen",
  title: "Control center",
  aiDescription:
    "The control center: the user's one entry that is not a book (the user panel, the workrooms and participants, the projects and the library).",
  props: z.strictObject({}),
  atStart: true,
  wideSearchToggle: true,
  // 書庫の画面を出している間だけ、base の書庫（LibraryView）を見せている（プロジェクトの画面の間は、描いたまま隠している）
  libraryAppearances: ["@matomezu/base:library"],
  shownLibraryAppearances: read => (contentAreaOf(read(CONTENT_AREA)) === "library" ? ["@matomezu/base:library"] : []),
})

// コントロールセンターのコンテンツエリアに出す画面（画面の場所に入れるプラグイン状態。コントロールセンターのスクリーン 1 枚ごとの値で、変えるたびにブラウザの履歴に積む）。
// 値は、プロジェクトの画面（projects）か書庫の画面（library）。値が無ければ、プロジェクトの画面を出す（contentAreaOf）
export const CONTENT_AREA = kit.definePluginState({
  id: "content-area",
  scope: "screen",
  schema: z.enum(["projects", "library"]),
  address: "push",
})

export type ContentArea = "projects" | "library"
export const contentAreaOf = (value: ContentArea | undefined): ContentArea => value ?? "projects"

// 選んでいるワークルームの id（スクリーン 1 枚ごとの状態。読み直すと消える。ワークルームが無くなれば、選んでいないのと同じ）
export const PICKED_ROOM = kit.definePluginStateOf<string>()({ id: "picked-room", scope: "screen" })

// 選んでいるビジターの参加者の id（スクリーン 1 枚ごと。ワークルームとビジターは、どちらか一方だけを選ぶ。参加者が居なくなれば、選んでいないのと同じ）
export const PICKED_VISITOR = kit.definePluginStateOf<string>()({ id: "picked-visitor", scope: "screen" })

// 書庫の画面を最大化しているか（スクリーン 1 枚ごとの状態。読み直すと消える）
export const LIBRARY_MAXIMIZED = kit.definePluginStateOf<boolean>()({ id: "library-maximized", scope: "screen" })

// 退室の確認のダイアログ（「部屋を出る」・「部屋を削除する」）。退室するワークルームの id を受け取る
export const WORKROOM_LEAVE_DIALOG = kit.defineDialogWith<{ workroom: string }>()({ id: "workroom-leave" })

// ビジターを外す確認のダイアログ。外すビジターの参加者の id を受け取る
export const VISITOR_LEAVE_DIALOG = kit.defineDialogWith<{ participant: string }>()({ id: "visitor-leave" })
