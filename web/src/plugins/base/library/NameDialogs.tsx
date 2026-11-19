// 書庫の画面から、名前を決めるダイアログ: フォルダを作る（アクション folder-create）と、エントリの名前を変える（アクション entry-rename）
import { type ReactNode, useState } from "react"
import { placeOf, titleOf } from "../../../core/entries"
import { useMessages, useT } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useCatalog, useReadState } from "../../../ui/store-context"
import { useActions } from "../../../ui/view-hooks"
import { Dialog } from "../dialog-host/Dialog"
import { controlClass, Field, Form, Problem } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { refusalMessage } from "../utils"
import { titleTaken } from "../utils/refusal"
import { ENTRY_RENAME, FOLDER_CREATE } from "./entry-move"
import { useReadNaming } from "./hooks"

type Refused = { ok: false; reason: string; permission?: string; kind?: string }

// 名前の入力Form。submit が行い、断られたら断りを返す（行えたら null）。断りは、入力Formの下に出す
function NameForm({
  label,
  button,
  initial,
  refusedAs,
  submit,
  onDone,
}: {
  label: string
  button: string
  initial: string
  refusedAs: Parameters<typeof kit.message>[0] // 断りの理由が無いときの文言
  submit(title: string): Refused | null
  onDone(): void
}) {
  const t = useMessages(kit)
  const anyT = useT()
  const catalog = useCatalog().core
  const [title, setTitle] = useState(initial)
  const [problem, setProblem] = useState<ReactNode>(null)
  return (
    <Form
      submit={button}
      ready={title.trim() !== "" && title.trim() !== initial}
      onSubmit={() => {
        const refused = submit(title)
        if (!refused) return onDone()
        setProblem(
          titleTaken(refused) ? t("The name is taken") : anyT(refusalMessage(catalog, refused, kit.message(refusedAs))),
        )
      }}
    >
      <Field label={label}>
        {id => (
          <input
            id={id}
            className={controlClass}
            value={title}
            // biome-ignore lint/a11y/noAutofocus: 開いたダイアログの最初の入力Form
            autoFocus
            onFocus={e => e.target.select()}
            onChange={e => setTitle(e.target.value)}
          />
        )}
      </Field>
      {problem && <Problem>{problem}</Problem>}
    </Form>
  )
}

// フォルダ into（書庫ホームかフォルダ）に、フォルダを作る
export function LibraryNewFolderDialog({ args, onClose }: DialogProps<{ into: string }>) {
  const t = useMessages(kit)
  const { perform } = useActions()
  return (
    <Dialog title={t("New folder")} onClose={onClose}>
      <NameForm
        label={t("Folder name")}
        button={t("Create")}
        initial=""
        refusedAs="Could not create"
        onDone={onClose}
        submit={title => {
          const done = perform(FOLDER_CREATE.id, { title, into: args.into })
          return done.ok ? null : done
        }}
      />
    </Dialog>
  )
}

// エントリ entry の名前を変える
export function LibraryRenameDialog({ args, onClose }: DialogProps<{ entry: string }>) {
  const t = useMessages(kit)
  const { perform } = useActions()
  const read = useReadState()
  const naming = useReadNaming()
  // 開いたときの名前（無ければ空）
  const [was] = useState(() => {
    const s = read()
    const kind = placeOf(s.folders, args.entry)?.ref.kind
    return (kind && titleOf(s, kind, args.entry, naming())) ?? ""
  })
  return (
    <Dialog title={t("Rename")} onClose={onClose}>
      <NameForm
        label={t("Name")}
        button={t("Rename")}
        initial={was}
        refusedAs="Could not rename"
        onDone={onClose}
        submit={title => {
          const done = perform(ENTRY_RENAME.id, { entry: args.entry, title })
          return done.ok ? null : done
        }}
      />
    </Dialog>
  )
}
