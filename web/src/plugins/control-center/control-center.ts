// コントロールセンター: ブックの一覧・利用者の設定・対象の定義の種類（郵便・参加者リストなどのレコード）を変えるアクションを許す。
// 組織ごとのコントロールセンターは、このプラグインの代わりに自分のものを渡す
import { z } from "zod"
import { kit } from "./kit"

export const CONTROL_CENTER = kit.defineControlCenter({
  id: "control-center",
  actions: [
    "@matomezu/base:book-create",
    "@matomezu/base:book-trash",
    "@matomezu/base:book-restore",
    "@matomezu/base:book-purge",
    "@matomezu/base:trash-empty",
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
})

// コントロールセンターの中で前に出す画面（画面の場所に入れるプラグイン状態。ステージに結ばない値で、変えるたびにブラウザの履歴に積む）。
// 値は、プロジェクトの画面（projects）か書庫の画面（library）。値が無ければ、プロジェクトの画面を出す（frontScreenOf）
export const FRONT_SCREEN = kit.definePluginState({
  id: "front-screen",
  scope: "window",
  schema: z.enum(["projects", "library"]),
  address: "push",
})

export type FrontScreen = "projects" | "library"
export const frontScreenOf = (value: FrontScreen | undefined): FrontScreen => value ?? "projects"

// 選んでいるワークルームの id（窓の中だけの状態。読み直すと消える。ワークルームが無くなれば、選んでいないのと同じ）
export const PICKED_ROOM = kit.definePluginStateOf<string>()({ id: "picked-room", scope: "window" })

// 書庫の画面を最大化しているか（窓の中だけの状態。読み直すと消える）
export const LIBRARY_MAXIMIZED = kit.definePluginStateOf<boolean>()({ id: "library-maximized", scope: "window" })

// 退室の確認のダイアログ（部屋を出る・部屋を削除する）。退室するワークルームの id を受け取る
export const WORKROOM_LEAVE_DIALOG = kit.defineDialogWith<{ workroom: string }>()({ id: "workroom-leave" })
