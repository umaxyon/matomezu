// 一覧の行に出す時刻の形（送信トレイと郵便箱が共に使う）

// 時点 at（ISO の時刻）を、今 now から見た短い形にする: 同じ日なら「時:分」、ほかは「月/日 時:分」（その環境の時刻で）
export function shownTime(at: string, now: Date): string {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ""
  const hm = `${d.getHours().toString()}:${d.getMinutes().toString().padStart(2, "0")}`
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  return sameDay ? hm : `${(d.getMonth() + 1).toString()}/${d.getDate().toString()} ${hm}`
}
