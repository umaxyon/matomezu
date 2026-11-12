// 参加要求を受け入れるダイアログ: 新しく始める（ワークルームの名前・鳥・配色を 1 度に決める。部屋を作って入れる）か、
// 引き継げる部屋（空室か、いる参加者が生きていない部屋）に入る（一覧から選ぶ。名前・鳥・配色は部屋のまま）かを選ぶ（引き継げる部屋がなければ、新しく始めるだけ）。
// 名前の初めは AI が頼んだ名前か元のセッション名。鳥は 5 羽から 1 つ（同じ鳥を何人に当ててもよい）、配色は 20 個から 1 つ（選ばなければ、鳥の元の配色）。配色を選ぶと、5 羽ともその配色に塗り替わる。
// 同じ名前の部屋に、生きている参加者がいる間は決められない。名前が引き継げる部屋と同じなら、最後に引き継ぐか、前の部屋を消して新しく始めるかを確かめる。
// 部屋を作る・いる参加者を外す・入れるは、アクション 1 件ずつ続けて行う（join-flow.ts）。キャンセルは閉じるだけで、参加要求は保留のまま
import { useId, useState } from "react"
import type { z } from "zod"
import { WORKROOM_NAME_MAX } from "../../../core/participant"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useActions } from "../../../ui/store-context"
import { useAllowedOn, useCoreCatalog } from "../../../ui/view-hooks"
import { BIRD_IDS, type Bird } from "../birds"
import { BIRD_PALETTES } from "../birds/colors"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton, controlClass, Field, Form, Problem } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { refusalMessage } from "../utils/refusal"
import { PARTICIPANT_ACCEPT, type WORKROOM, WORKROOM_ADD } from "."
import { BirdFaceView } from "./BirdFaceView"
import { asBird, originalPalette, PALETTE_TITLES } from "./birds"
import { useIsAlive, useNowMs, useParticipantCalls, useParticipants, useWorkrooms } from "./hooks"
import { acceptInNewRoom, acceptInRoom, discardAndStart } from "./join-flow"
import styles from "./Participant.module.css"
import { nameInUse, occupantOf, takeable } from "./workroom"

type Workroom = z.output<typeof WORKROOM.record>

const BIRD_TITLES = {
  inko: "Parakeet",
  buncho: "Java sparrow",
  suzume: "Sparrow",
  tsunagidori: "Tsunagidori",
  fukurou: "Barn owl",
} as const satisfies Record<Bird, string>

export function ParticipantJoinDialog({ args, onClose }: DialogProps<{ participant: string }>) {
  const t = useMessages(kit)
  const requested = useParticipants().some(p => p.id === args.participant && p.state === "requested")
  return (
    <Dialog title={t("Join the workroom")} width={460} onClose={onClose}>
      {requested ? <JoinForm participant={args.participant} onClose={onClose} /> : <p>{t("Already answered")}</p>}
    </Dialog>
  )
}

type Mode = "new" | "takeover"

function JoinForm({ participant, onClose }: { participant: string; onClose: () => void }) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const { perform, showToast } = useActions()
  const participants = useParticipants()
  const rooms = useWorkrooms()
  const calls = useParticipantCalls()
  const isAlive = useIsAlive()
  const nowMs = useNowMs()
  const first = participants.find(p => p.id === participant)
  const form = useId()
  const quiet = takeable(rooms, participants, calls, isAlive, nowMs)
  const asked = quiet.find(r => r.name === first?.wantedName)
  const [mode, setMode] = useState<Mode>(asked ? "takeover" : "new")
  const [pick, setPick] = useState<string | undefined>(asked?.id)
  // 確かめている途中の、引き継ぐ部屋（無ければ、まだ確かめていない）
  const [confirming, setConfirming] = useState<{ target: Workroom; discardable: boolean } | undefined>(undefined)
  const [name, setName] = useState(first?.wantedName ?? first?.sessionName ?? "")
  const [bird, setBird] = useState<Bird>(BIRD_IDS[0])
  const [palette, setPalette] = useState<string | undefined>(undefined)
  const shown = palette ?? originalPalette(bird)
  const trimmed = name.trim()
  const sameName = nameInUse(rooms, name)
  const inUse = sameName !== undefined && !quiet.some(r => r.id === sameName.id)
  const sameQuiet = sameName !== undefined && quiet.some(r => r.id === sameName.id) ? sameName : undefined
  const shownTitle = PALETTE_TITLES[shown as keyof typeof PALETTE_TITLES]
  const paletteName = shownTitle ? t(shownTitle) : ""
  const chosen = quiet.find(r => r.id === pick)
  const room = { name: trimmed, bird, ...(palette ? { palette } : {}) }
  const allowedNew = useAllowedOn(WORKROOM_ADD.id, { name: trimmed || "-", bird }).ok
  const allowedAccept = useAllowedOn(PARTICIPANT_ACCEPT.id, { workroom: "-" }, { record: participant }).ok
  const refused = (done: Parameters<typeof refusalMessage>[1]) =>
    showToast({ kind: "warn", message: refusalMessage(catalog, done, kit.message("Could not answer the request")) })
  const finish = (done: ReturnType<typeof perform>) => {
    if (done.ok) onClose()
    else refused(done)
  }
  const doing = perform as unknown as Parameters<typeof acceptInNewRoom>[0]
  const takeOver = (target: Workroom) =>
    finish(
      acceptInRoom(doing, participant, target.id, occupantOf(participants, target)?.id) as ReturnType<typeof perform>,
    )
  const discardAndStartNew = (target: Workroom) =>
    finish(
      discardAndStart(doing, participant, target.id, room, occupantOf(participants, target)?.id) as ReturnType<
        typeof perform
      >,
    )
  // OK: 名前が引き継げる部屋と同じ、または一覧から選んだなら、最後に確かめる
  const submit = () => {
    if (mode === "takeover") {
      if (chosen) setConfirming({ target: chosen, discardable: false })
    } else if (sameQuiet) setConfirming({ target: sameQuiet, discardable: true })
    else finish(acceptInNewRoom(doing, participant, room) as ReturnType<typeof perform>)
  }
  const ready = mode === "takeover" ? chosen !== undefined && allowedAccept : trimmed !== "" && !inUse && allowedNew
  if (confirming) {
    const { target, discardable } = confirming
    const stillQuiet = quiet.some(r => r.id === target.id)
    return (
      <div className={styles.confirm}>
        <p>
          {t(discardable ? "Take over {name}, or discard it and start new?" : "Take over {name}?", {
            name: target.name,
          })}
        </p>
        <p className={styles.paletteName}>
          {t(
            discardable
              ? "Taking over keeps its name, bird and palette. Discarding removes it and starts a new one."
              : "Taking over keeps its name, bird and palette.",
          )}
        </p>
        <div className={styles.buttons}>
          <ActionButton onClick={() => setConfirming(undefined)}>{t("Back")}</ActionButton>
          {discardable && (
            <ActionButton danger disabled={!stillQuiet || !allowedNew} onClick={() => discardAndStartNew(target)}>
              {t("Discard and start new")}
            </ActionButton>
          )}
          <ActionButton primary disabled={!stillQuiet || !allowedAccept} onClick={() => takeOver(target)}>
            {t("Take over")}
          </ActionButton>
        </div>
      </div>
    )
  }
  return (
    <Form id={form} ready={ready} onSubmit={submit}>
      {quiet.length > 0 && (
        <fieldset className={styles.modes} aria-label={t("Join the workroom")}>
          {(["new", "takeover"] as const).map(m => (
            <label key={m} className={styles.mode}>
              <input type="radio" name="join-mode" checked={mode === m} onChange={() => setMode(m)} />
              {t(m === "new" ? "Start new" : "Take over")}
            </label>
          ))}
        </fieldset>
      )}
      {mode === "takeover" ? (
        <Field label={t("Choose who to take over")}>
          {() => (
            <fieldset className={styles.takeable} aria-label={t("Choose who to take over")}>
              {quiet.map(r => {
                const who = occupantOf(participants, r)
                return (
                  <label key={r.id} className={styles.takeRow} data-workroom={r.id}>
                    <input type="radio" name="take-over" checked={r.id === pick} onChange={() => setPick(r.id)} />
                    {asBird(r.bird) && (
                      <BirdFaceView
                        bird={asBird(r.bird) as Bird}
                        {...(r.palette ? { palette: r.palette } : {})}
                        size={32}
                      />
                    )}
                    <span className={styles.name}>{r.name}</span>
                    <span className={styles.detail}>
                      {who ? [who.ai, who.model, who.env].join(" / ") : t("Empty room")}
                    </span>
                    <span className={styles.detail}>
                      {who?.joinedAt ? t("Joined {time}", { time: new Date(who.joinedAt).toLocaleString() }) : ""}
                    </span>
                  </label>
                )
              })}
            </fieldset>
          )}
        </Field>
      ) : (
        <>
          <Field label={t("Workroom name")}>
            {id => (
              <>
                <input
                  id={id}
                  className={controlClass}
                  value={name}
                  maxLength={WORKROOM_NAME_MAX}
                  // biome-ignore lint/a11y/noAutofocus: 開いたダイアログの最初の入力Form
                  autoFocus
                  onChange={e => setName(e.target.value)}
                />
                {inUse && <Problem>{t("This name is in use")}</Problem>}
                {!inUse && sameQuiet && <Problem>{t("A quiet participant has this name")}</Problem>}
              </>
            )}
          </Field>
          <Field label={t("Bird")}>
            {() => (
              <fieldset className={styles.picks} aria-label={t("Bird")}>
                {BIRD_IDS.map(b => (
                  <Pick key={b} title={t(BIRD_TITLES[b])} checked={b === bird} onPick={() => setBird(b)} group="bird">
                    <BirdFaceView bird={b} {...(palette ? { palette } : {})} size={48} />
                  </Pick>
                ))}
              </fieldset>
            )}
          </Field>
          <Field label={t("Palette")}>
            {() => (
              <>
                <fieldset className={styles.picks} aria-label={t("Palette")}>
                  {BIRD_PALETTES.map(p => (
                    <Pick
                      key={p.id}
                      title={t(PALETTE_TITLES[p.id as keyof typeof PALETTE_TITLES])}
                      checked={p.id === shown}
                      onPick={() => setPalette(p.id)}
                      group="palette"
                    >
                      <span
                        className={styles.swatch}
                        style={{
                          background: `linear-gradient(135deg, ${p.colors.flag} 0 34%, ${p.colors.feather} 34% 67%, ${p.colors.inner} 67%)`,
                        }}
                      />
                    </Pick>
                  ))}
                </fieldset>
                <p className={styles.paletteName}>{paletteName}</p>
              </>
            )}
          </Field>
        </>
      )}
      <div className={styles.buttons}>
        <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
        <ActionButton form={form} primary disabled={!ready}>
          {t("Accept")}
        </ActionButton>
      </div>
    </Form>
  )
}

// 選択肢 1 つ（中は見えないラジオボタン）
function Pick({
  title,
  checked,
  onPick,
  group,
  children,
}: {
  title: string
  checked: boolean
  onPick: () => void
  group: string
  children: React.ReactNode
}) {
  return (
    <label className={styles.pick} title={title}>
      <input
        type="radio"
        className={styles.radio}
        name={group}
        aria-label={title}
        checked={checked}
        onChange={onPick}
      />
      {children}
    </label>
  )
}
