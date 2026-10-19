// ブックを開くダイアログ: 探して選んだブックを、そのステージで開く
import { Dialog } from "../dialog/Dialog"
import { useActions } from "../store-context"
import { BookSearch } from "./BookSearch"

export function OpenBookDialog({ stage, open, onClose }: { stage: string; open: boolean; onClose: () => void }) {
  const { openBook } = useActions()
  return (
    <Dialog open={open} title="ブックを開く" onClose={onClose}>
      <BookSearch
        autoFocus
        onSelect={book => {
          openBook(stage, book)
          onClose()
        }}
      />
    </Dialog>
  )
}
