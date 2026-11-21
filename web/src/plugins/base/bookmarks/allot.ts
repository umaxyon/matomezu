// しおりの割り振り: スロット bookmarks の並びと、置いたウィジェットごとのしおりから、画面に並べる物と、並べきれない数を決める

// 同時に並べるしおりの数（画面の上をしおりが埋め尽くさないように。片づくと次が出る）
export const MAX_BOOKMARKS = 5

// しおり 1 つ（at は ISO 8601 の時点。同じウィジェットの中で古い物を先に並べる）
export interface BookmarkLike {
  key: string
  at: string
}

// order はスロットの並び（ウィジェットの id）、byWidget はウィジェットごとのしおり。ウィジェットの並びで先の物を先に、同じウィジェットの中は at の古い物を先に（同じなら渡した順）、
// MAX_BOOKMARKS まで並べる。hidden は、並べきれなかった物を持つウィジェットの id（スロットの並び）
export function allotBookmarks<B extends BookmarkLike>(
  order: readonly string[],
  byWidget: ReadonlyMap<string, readonly B[]>,
): { shown: { widget: string; bookmark: B }[]; rest: number; hidden: string[] } {
  const shown: { widget: string; bookmark: B }[] = []
  const hidden: string[] = []
  let rest = 0
  for (const widget of order) {
    const sorted = [...(byWidget.get(widget) ?? [])].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
    const room = Math.max(0, MAX_BOOKMARKS - shown.length)
    for (const bookmark of sorted.slice(0, room)) shown.push({ widget, bookmark })
    const over = sorted.length - room
    if (over > 0) {
      rest += over
      hidden.push(widget)
    }
  }
  return { shown, rest, hidden }
}
