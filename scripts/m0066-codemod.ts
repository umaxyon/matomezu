// 橋渡しの間だけ（M-0066。最後に消す）: プラグインのコードの、古い形（フックの第 1 引数にステージの id）を、新しい形に機械的に書き換える。
// 何度流しても同じ結果になる（新しい形はそのまま）。main を取り込んだあとに流し直せる。
//   bun scripts/m0066-codemod.ts web/src/plugins test/added-plugins
// 書き換えるのは、第 1 引数が「自分のステージ」と分かる書き方（stage・stage.id・props.stage・here・useScreenId()・ctx.stage.id）だけ。
// ほかの書き方と、useActions・セッターの呼び出し・props の stage は、scripts/m0066-left.sh が出す型の誤りを見て手で直す（docs/m0066-guide.md）
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const STAGE = String.raw`(?:stage|stage\.id|props\.stage|here|useScreenId\(\))`
const PLACE_OPS = [
  "command",
  "openDialog",
  "openContextMenu",
  "split",
  "unsplit",
  "closeStage",
  "focusStage",
  "openBook",
  "openPage",
  "openPageById",
  "resizeStage",
  "setStageArea",
  "setStageStart",
  "panStageBy",
  "zoomStage",
  "resetStageView",
  "openPrintPreview",
  "closePrintPreview",
  "startBackground",
  "endBackground",
  "setPreviewArea",
  "setTool",
  "togglePlacing",
  "stopPlacing",
  "select",
  "setEditing",
  "openPicker",
].join("|")

const RULES: readonly (readonly [RegExp, string])[] = [
  // 引数がステージだけのフック: useBook(stage) → useBook()
  [
    new RegExp(
      String.raw`\b(useBook|usePage|useShownBook|useShownPage|useStage|usePerform|useToPaper|useLatestPan|useBookOf)\(\s*${STAGE}\s*\)`,
      "g",
    ),
    "$1()",
  ],
  // 第 1 引数がステージのフック: useCommand(stage, id) → useCommand(id)
  [
    new RegExp(
      String.raw`\b(useCommand|useAllowed|useContextMenu|useMenuCommand|useStageArea|useStagePan|useThemeVars|useDrawnMinimap)\(\s*${STAGE}\s*,\s*`,
      "g",
    ),
    "$1(",
  ],
  // useItem(stage, page, item) → useItemAt(page, item)（最後に useItem に戻す）
  [new RegExp(String.raw`\buseItem\(\s*${STAGE}\s*,\s*`, "g"), "useItemAt("],
  // ステージごとのプラグイン状態: usePluginState(kit, DEF, stage) → usePluginState(kit, DEF)
  [new RegExp(String.raw`\busePluginState\(([^(),]+),\s*([^(),]+),\s*${STAGE}\s*\)`, "g"), "usePluginState($1, $2)"],
  // コマンドの run が受ける操作: a.select(ctx.stage.id, ids) → a.here.select(ids)（最後に a.select(ids) にする）
  [
    new RegExp(String.raw`\b(a|actions)\.(${PLACE_OPS})\(\s*ctx\.(?:stage|screen)\.id\s*,\s*`, "g"),
    "$1.here.$2(",
  ],
  [new RegExp(String.raw`\b(a|actions)\.(${PLACE_OPS})\(\s*ctx\.(?:stage|screen)\.id\s*\)`, "g"), "$1.here.$2()"],
]

function files(path: string): string[] {
  if (statSync(path).isFile()) return /\.tsx?$/.test(path) ? [path] : []
  return readdirSync(path).flatMap(name => (name === "node_modules" ? [] : files(join(path, name))))
}

let changed = 0
for (const file of process.argv.slice(2).flatMap(files)) {
  const before = readFileSync(file, "utf8")
  let after = RULES.reduce((text, [from, to]) => text.replace(from, to), before)
  // useItem を useItemAt にした所で、もう useItem を呼んでいなければ、読み込む名前も替える
  if (after.includes("useItemAt(") && !/\buseItem\(/.test(after) && !/\buseItemAt\b[,\s}]/.test(after))
    after = after.replace(/\buseItem\b(?=[,\s}])/g, "useItemAt")
  if (after === before) continue
  writeFileSync(file, after)
  changed++
  console.log(file)
}
console.log(`changed: ${changed}`)
