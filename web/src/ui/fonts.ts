// 箱の文字のフォント（Noto Sans JP）を読む。フォントのファイルと @font-face は、ビルドで画面の隣の fonts/ に置く（scripts/fonts.ts copy）。
// 字の範囲ごとに分けたファイルなので、ブラウザは使う字の分だけを取りに行く。読み終わるまでは代わりのフォントで描く（大きさと行は core/text が決めるので変わらない）
export function loadFonts() {
  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = "fonts/noto-sans-jp.css"
  document.head.append(link)
}
