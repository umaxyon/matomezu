// しおりのスロットの名前と、渡す物（base の ui.tsx で、core/catalog.ts の表に書き足す）

import { kit } from "../kit"

// スロット bookmarks: 置いたウィジェットは自分では描かず、useShowBookmarks で出すしおりを渡す。殻・並べ方・まとめ方は、根に置く bookmark-host が描く
export const BOOKMARKS = kit.name("bookmarks")
export type BookmarksProps = Record<string, never>
