// 追加プラグインの有効・無効（利用者の設定の項目 enabled-plugins）のビュー: 入れた追加プラグインごとの行に、有効のスイッチと、プラグインが名乗った名前（無ければ id）・id・概要。
// 無効にするとき、そのプラグインが無いと読めなくなる物が在れば、件数と在る所（ブック・フォルダごと。多ければ先頭の 5 か所と、ほかの数）を出して確かめる

import { useState } from "react"
import { settingOr } from "../../../core/def/setting"
import { BROKEN } from "../../../core/folders"
import { useMessages } from "../../../ui/i18n"
import type { UserSettingControlProps } from "../../../ui/plugin"
import { useInstance, useReadState } from "../../../ui/store-context"
import { useActions } from "../../../ui/view-hooks"
import { Confirm, shownPlaces } from "../dialog-host/Confirm"
import { rowClass, Section } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { useMovedIfOff, useNameOf, useReadNaming } from "../library/hooks"
import { type MovedPlace, movedPlacesOf } from "../library/outline"
import { addedPluginsOf, pluginLabel, withPluginEnabled } from "./enabled-plugins"

// 値が無いときの有効なプラグイン（無し）
const NO_PLUGINS: readonly string[] = []

// 確かめている事: 設定を next に変えると、在る所 places の物（合わせて count 件）が読めない物のフォルダへ移る
interface Asking {
  plugin: string
  next: readonly string[]
  places: readonly MovedPlace[]
  count: number
  pages: boolean // 移る物がどれもページか
}

export function EnabledPluginsSetting({ label, value, onChange }: UserSettingControlProps<readonly string[]>) {
  const t = useMessages(kit)
  const added = addedPluginsOf(useInstance().plugins)
  const enabled = settingOr(value, NO_PLUGINS)
  const movedIfOff = useMovedIfOff()
  const read = useReadState()
  const naming = useReadNaming()
  const nameOf = useNameOf()
  const { showToast } = useActions()
  const [asking, setAsking] = useState<Asking | null>(null)
  // プラグイン id の有効を on にする。無効にするときは、移る物を数えてもらい、在れば確かめる（形に合わない読めない物のフォルダなら何も移らないので、0 件と同じ）
  const change = async (id: string, on: boolean) => {
    const next = withPluginEnabled(enabled, id, on)
    if (on) return onChange(next)
    let moved: Awaited<ReturnType<typeof movedIfOff>>
    try {
      moved = await movedIfOff([id])
    } catch {
      showToast({ kind: "warn", message: kit.message("Could not check what will move") })
      return
    }
    if (moved === BROKEN || moved.length === 0) return onChange(next)
    const plugin = added.find(p => p.id === id)
    setAsking({
      plugin: plugin ? pluginLabel(plugin, t) : id,
      next,
      places: movedPlacesOf(moved, read(), naming()),
      count: moved.length,
      pages: moved.every(m => m.kind === "page"),
    })
  }
  return (
    <Section title={label}>
      {added.length === 0 ? <p>{t("No added plugins")}</p> : null}
      {added.map(p => (
        <label key={p.id} className={rowClass}>
          <input type="checkbox" checked={enabled.includes(p.id)} onChange={e => void change(p.id, e.target.checked)} />
          <span>
            {p.title ? <strong>{t(p.title)} </strong> : null}
            <small>{p.id}</small>
            {p.description ? (
              <>
                <br />
                <small>{t(p.description)}</small>
              </>
            ) : null}
          </span>
        </label>
      ))}
      {asking && (
        <Confirm
          message={t("Disable the plugin?")}
          detail={[
            t("Disabling {plugin} makes these unreadable. They move to the unreadable folder", {
              plugin: asking.plugin,
            }),
            t(asking.pages ? "{count} pages" : "{count} items", { count: asking.count }),
            ...shownPlaces(
              asking.places.map(place =>
                t(
                  place.book
                    ? place.pages
                      ? 'Book "{place}": {count} pages'
                      : 'Book "{place}": {count} items'
                    : place.pages
                      ? 'Folder "{place}": {count} pages'
                      : 'Folder "{place}": {count} items',
                  { place: nameOf(place), count: place.count },
                ),
              ),
              count => t("{count} more places", { count }),
            ),
            t("Enable it again and they go back where they were"),
          ]}
          ok={t("Disable")}
          cancel={t("Cancel")}
          onOk={() => {
            const { next } = asking
            setAsking(null)
            onChange(next)
          }}
          onCancel={() => setAsking(null)}
        />
      )}
    </Section>
  )
}
