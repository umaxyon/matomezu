// ex15: 自分のスクリーンで書庫のフォルダの中身を並べる追加プラグインの見本（たな）。自分の書庫アピアランスを持ち、見せているフォルダを
// 自分のプラグイン状態から答える（AI とほかの窓の書庫の変更は、ここで見せているフォルダの物なら、見えたとして書庫の画面の履歴に入る）
import { definePlugin, HOME_ID, z } from "matomezu"
import { kit } from "./kit"

// たたんでいるか（スクリーン 1 枚ごと。読み直すと消える。値が無ければ、ひらいている）
export const SHELF_FOLDED = kit.definePluginStateOf<true>()({ id: "shelf-folded", scope: "screen" })
// 見せているフォルダの id（スクリーン 1 枚ごと。読み直すと消える。値が無ければ、書庫ホーム）
export const SHELF_FOLDER = kit.definePluginStateOf<string>()({ id: "shelf-folder", scope: "screen" })
export const shelfFolderOf = (folder: string | undefined): string => folder ?? HOME_ID

// たなの書庫アピアランス: フォルダ 1 つの中身を見せている。答えは、ビューが描く物と同じ所（shelfFolderOf）から出す
export const SHELF = kit.defineLibraryAppearance({
  id: "shelf",
  shownFolders: (_, read) => [shelfFolderOf(read(SHELF_FOLDER))],
})

// たなのスクリーン（渡す値は無い）。たたんでいる間は、描いたまま隠しているので、見せていると答えない
export const SHELF_SCREEN = kit.defineScreen({
  id: "shelf-screen",
  title: "shelf",
  aiDescription: "The entries right under one folder of the library.",
  props: z.strictObject({}),
  libraryAppearances: [SHELF.id],
  shownLibraryAppearances: read => (read(SHELF_FOLDED) ? [] : [SHELF.id]),
})

export const EX15 = definePlugin(
  kit.plugin({
    screens: [SHELF_SCREEN],
    libraryAppearances: [SHELF],
    pluginStates: [SHELF_FOLDED, SHELF_FOLDER],
  }),
)
export default EX15

declare module "matomezu/catalog" {
  interface MessageTable extends Readonly<typeof kit.messages> {}
  interface ScreenTable {
    "ex15:shelf-screen": typeof SHELF_SCREEN
  }
  interface LibraryAppearanceTable {
    "ex15:shelf": typeof SHELF
  }
  interface PluginStateTable {
    "ex15:shelf-folded": typeof SHELF_FOLDED
    "ex15:shelf-folder": typeof SHELF_FOLDER
  }
}
