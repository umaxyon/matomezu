// 設定画面のキーバインドの欄（画面ではショートカットキー）: 上にインクリメンタルサーチ、その下のスクロールする枠に、範囲の題名の見出しごとに行を並べる。
// 行は範囲・コマンド・args ごと（store/keys.ts の keyRows）で、キーを札で出し、× で外し、+ で押したキーを覚えて足す。
// 足すキーを同じ範囲のほかの行が使っていれば、付ける前に確かめる（利用者の行が先になり、向こうは効かなくなる）。
// ほかの行が先に使っていて効いていないキーは、行の下に添える。変えた行は既定に戻せ、探す入力Form の横のボタンで全部を既定に戻せる（確かめてから）。
// 変えるとコマンド settings-set でキーバインドの項目を書く（コマンドが押せないか、ホームのタイプがこの項目を変えさせなければ、どれも押せない）
import { type KeyboardEvent, useState } from "react"
import type { BaseKeyScope } from "../../../core/catalog"
import type { MessageKey } from "../../../core/i18n/i18n"
import { type KeyBinding, type KeyChanges, keyLabel, NO_KEY_CHANGES, pressedKey } from "../../../core/keys"
import {
  BASE_KEY_SCOPE_TITLES,
  type KeyRow,
  keyRows,
  withKeyAdded,
  withKeyRemoved,
  withRowReset,
} from "../../../store/keys"
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { isMac } from "../../../ui/keys"
import { useCatalog } from "../../../ui/store-context"
import { useAllowed, useUserSetting } from "../../../ui/view-hooks"
import { Confirm } from "../dialog-host/Confirm"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { SETTINGS_SET } from "./actions"
import { SETTINGS_SET_COMMAND } from "./commands"
import styles from "./KeysPane.module.css"
import { KEYS } from "./user-settings"

// 覚えている行（rowId）と、付ける前に確かめているキーバインド（ほかの行 other が使っている）
type Capture = { row: string; pending?: { binding: KeyBinding; other: string } }

// 行の見分け（範囲・コマンド・args。行は描くたびに作り直すので、これで比べる）
const rowId = (r: KeyRow) => JSON.stringify([r.scope, r.command, r.args ?? null])

export function KeysPane({ stage }: { stage: string }) {
  const t = useMessages(kit)
  const catalog = useCatalog()
  const mac = isMac()
  const set = useCommand(stage, SETTINGS_SET_COMMAND.id)
  // 書けるか: コマンドが押せ、ホームのタイプがキーバインドの項目を変えさせないのでもない
  const writable = useAllowed(stage, SETTINGS_SET.id, { settings: [KEYS.id] }).ok && set.enabled
  const changes = (useUserSetting(KEYS.id) as KeyChanges | undefined) ?? NO_KEY_CHANGES
  const [query, setQuery] = useState("")
  const [capture, setCapture] = useState<Capture | null>(null)
  const [resetting, setResetting] = useState(false)
  const rows = keyRows([...catalog.store.keys.values()], changes)
  const write = (next: KeyChanges) => set.run({ [KEYS.id]: next })
  const scopeTitle = (scope: string) =>
    t(
      (BASE_KEY_SCOPE_TITLES[scope as BaseKeyScope] ??
        catalog.store.keyScopes.get(scope)?.title ??
        scope) as MessageKey,
    )
  const rowTitle = (row: KeyRow) =>
    t((row.title ?? catalog.store.commands.get(row.command)?.title ?? row.command) as MessageKey)
  const label = (key: string) => keyLabel(key, mac)
  // 探す文字が、行の題名・範囲の題名・キーの名前のどれかに含まれる行だけ（大文字と小文字は区別しない）
  const q = query.trim().toLowerCase()
  const shown = rows.filter(
    r =>
      q === "" ||
      [rowTitle(r), scopeTitle(r.scope), ...r.keys.map(k => label(k.entry.binding.key))].some(s =>
        s.toLowerCase().includes(q),
      ),
  )
  const scopes = [...new Set(shown.map(r => r.scope))]

  // 覚えている間に押したキー: 足すキーバインドにする（同じ範囲のほかの行が使っていれば、付ける前に確かめる）
  const onCaptureKey = (e: KeyboardEvent, row: KeyRow) => {
    e.preventDefault()
    e.stopPropagation() // 覚えている間は、ほかのキーバインドに渡さない（Esc でダイアログを閉じないなど）
    const key = pressedKey(e.nativeEvent, mac)
    if (!key) return
    const binding: KeyBinding = {
      key,
      command: row.command,
      scope: row.scope,
      ...(row.args === undefined ? {} : { args: row.args }),
    }
    const user = rows.find(
      r => r !== row && r.scope === row.scope && r.keys.some(k => k.entry.binding.key === key && k.first === k.entry),
    )
    if (user) setCapture({ row: rowId(row), pending: { binding, other: rowTitle(user) } })
    else {
      write(withKeyAdded(changes, binding))
      setCapture(null)
    }
  }

  return (
    <div className={styles.pane}>
      <div className={styles.head}>
        <input
          className={styles.search}
          type="search"
          aria-label={t("Search shortcut keys")}
          placeholder={t("Search shortcut keys")}
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <ActionButton disabled={!writable} onClick={() => setResetting(true)}>
          {t("Reset all")}
        </ActionButton>
      </div>
      <div className={styles.list}>
        {scopes.map(scope => (
          <section key={scope} aria-label={scopeTitle(scope)}>
            <h4 className={styles.scope}>{scopeTitle(scope)}</h4>
            {shown
              .filter(r => r.scope === scope)
              .map(row => {
                const capturing = capture?.row === rowId(row)
                const title = rowTitle(row)
                return (
                  <div key={rowId(row)} className={styles.row}>
                    <div className={styles.line}>
                      <span className={styles.title}>{title}</span>
                      <span className={styles.keys}>
                        {row.keys.map(({ entry }) => (
                          <span key={entry.binding.key} className={styles.chip}>
                            {label(entry.binding.key)}
                            <button
                              type="button"
                              className={styles.remove}
                              aria-label={t("Remove {key} from {command}", {
                                key: label(entry.binding.key),
                                command: title,
                              })}
                              disabled={!writable}
                              onClick={() => write(withKeyRemoved(changes, entry.binding))}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        {capturing && !capture.pending ? (
                          <>
                            <button
                              type="button"
                              className={styles.capture}
                              // biome-ignore lint/a11y/noAutofocus: 押したキーを受けるため、覚え始めたら焦点を置く
                              autoFocus
                              aria-label={t("Press a key for {command}", { command: title })}
                              onKeyDown={e => onCaptureKey(e, row)}
                            >
                              {t("Press a key")}
                            </button>
                            <ActionButton onClick={() => setCapture(null)}>{t("Cancel")}</ActionButton>
                          </>
                        ) : (
                          <button
                            type="button"
                            className={styles.add}
                            aria-label={t("Add a key to {command}", { command: title })}
                            disabled={!writable || capture !== null}
                            onClick={() => setCapture({ row: rowId(row) })}
                          >
                            +
                          </button>
                        )}
                      </span>
                      {row.changed && (
                        <ActionButton disabled={!writable} onClick={() => write(withRowReset(changes, row))}>
                          {t("Reset")}
                        </ActionButton>
                      )}
                    </div>
                    {capturing && capture.pending && (
                      <div className={styles.note}>
                        <span>
                          {t("{key} is used by {other}. It will stop working there", {
                            key: label(capture.pending.binding.key),
                            other: capture.pending.other,
                          })}
                        </span>
                        <ActionButton
                          primary
                          onClick={() => {
                            if (capture.pending) write(withKeyAdded(changes, capture.pending.binding))
                            setCapture(null)
                          }}
                        >
                          {t("Assign")}
                        </ActionButton>
                        <ActionButton onClick={() => setCapture(null)}>{t("Cancel")}</ActionButton>
                      </div>
                    )}
                    {row.keys
                      .filter(k => k.first !== k.entry)
                      .map(({ entry, first }) => (
                        <p key={entry.binding.key} className={styles.lost}>
                          {t("{key} is not working: {other} uses it first", {
                            key: label(entry.binding.key),
                            other: rowTitle(rows.find(r => r.keys.some(k => k.entry === first)) ?? row),
                          })}
                        </p>
                      ))}
                  </div>
                )
              })}
          </section>
        ))}
        {scopes.length === 0 && <p className={styles.empty}>{t("No shortcut keys match")}</p>}
      </div>
      {resetting && (
        <Confirm
          message={t("Reset all shortcut keys to the defaults?")}
          ok={t("Reset all")}
          cancel={t("Cancel")}
          onOk={() => {
            write(NO_KEY_CHANGES)
            setResetting(false)
          }}
          onCancel={() => setResetting(false)}
        />
      )}
    </div>
  )
}
