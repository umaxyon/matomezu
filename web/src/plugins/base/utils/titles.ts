// 名前の番号の振り方: ページ・バインダの追加と複製、書庫の新しいフォルダが、重ならない名前を作る

// 名前 title を、同じ所の名前 taken と重ならない名前にする（重ならなければそのまま。重なれば「名前 2」から番号を付ける）
export function freeTitle(title: string, taken: readonly string[]): string {
  if (!taken.includes(title)) return title
  for (let n = 2; ; n++) {
    const made = `${title} ${n}`
    if (!taken.includes(made)) return made
  }
}
