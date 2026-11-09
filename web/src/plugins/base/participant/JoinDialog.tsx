// 参加要求を受け入れるダイアログ: 新しく始める（ワークルームの名前・鳥・配色を 1 度に決める。アクション participant-accept）か、
// 生きていない受け入れ済みの参加者を引き継ぐ（一覧から選ぶ。アクション participant-take-over。名前・鳥・配色は前のまま）かを選ぶ（引き継げる参加者がいなければ、新しく始めるだけ）。
// 名前の初めは AI が頼んだ名前か元のセッション名。鳥は 5 羽から 1 つ（同じ鳥を何人に当ててもよい）、配色は 20 個から 1 つ（選ばなければ、鳥の元の配色）。配色を選ぶと、5 羽ともその配色に塗り替わる。
// 同じ名前の、生きている参加者がいる間は決められない。名前が生きていない参加者と同じなら、最後に引き継ぐか、前のを破棄して新しく始める（アクション participant-accept の replace）かを確かめる。
// キャンセルは閉じるだけで、参加要求は保留のまま
import { useId, useState } from "react"
import type { Participant } from "../../../core/participant"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useActions, useMatomezuState } from "../../../ui/store-context"
import { useAllowedOn, useCoreCatalog } from "../../../ui/view-hooks"
import { BIRD_IDS, type Bird } from "../birds"
import { BIRD_PALETTES } from "../birds/colors"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton, controlClass, Field, Form, Problem } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { refusalMessage } from "../utils/refusal"
import { PARTICIPANT_ACCEPT, PARTICIPANT_TAKE_OVER } from "."
import { BirdFaceView } from "./BirdFaceView"
import { asBird, originalPalette, PALETTE_TITLES } from "./birds"
import { useIsAlive, useNowMs, useParticipantCalls, useParticipants } from "./hooks"
import styles from "./Participant.module.css"
import { takeable, workroomInUse } from "./workroom"

const BIRD_TITLES = {
  inko: "Parakeet",
  buncho: "Java sparrow",
  suzume: "Sparrow",
  tsunagidori: "Tsunagidori",
  fukurou: "Barn owl",
} as const satisfies Record<Bird, string>

const NAME_MAX = 40

export function ParticipantJoinDialog({ args, onClose }: DialogProps<{ participant: string }>) {
  const t = useMessages(kit)
  const requested = useMatomezuState(s =>
    s.participants.some(p => p.id === args.participant && p.state === "requested"),
  )
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
  const calls = useParticipantCalls()
  const isAlive = useIsAlive()
  const nowMs = useNowMs()
  const first = participants.find(p => p.id === participant)
  const form = useId()
  const quiet = takeable(participants, calls, isAlive, nowMs)
  const asked = quiet.find(p => p.workroom === first?.workroom)
  const [mode, setMode] = useState<Mode>(asked ? "takeover" : "new")
  const [pick, setPick] = useState<string | undefined>(asked?.id)
  // 確かめている途中の、引き継ぐ相手（無ければ、まだ確かめていない）
  const [confirming, setConfirming] = useState<{ target: Participant; discardable: boolean } | undefined>(undefined)
  const [name, setName] = useState(first?.workroom ?? first?.sessionName ?? "")
  const [bird, setBird] = useState<Bird>(BIRD_IDS[0])
  const [palette, setPalette] = useState<string | undefined>(undefined)
  const shown = palette ?? originalPalette(bird)
  const trimmed = name.trim()
  const inUse = workroomInUse(participants, calls, name, isAlive, nowMs)
  const sameQuiet = quiet.find(p => p.workroom === trimmed)
  const shownTitle = PALETTE_TITLES[shown as keyof typeof PALETTE_TITLES]
  const paletteName = shownTitle ? t(shownTitle) : ""
  const chosen = quiet.find(p => p.id === pick)
  const accepting = {
    participant,
    workroom: trimmed || "-",
    bird,
    ...(palette ? { palette } : {}),
  }
  const allowedNew = useAllowedOn(PARTICIPANT_ACCEPT.id, accepting).ok
  const allowedTake = useAllowedOn(PARTICIPANT_TAKE_OVER.id, { participant, takeover: pick ?? "-" }).ok
  const refused = (done: Parameters<typeof refusalMessage>[1]) =>
    showToast({ kind: "warn", message: refusalMessage(catalog, done, kit.message("Could not answer the request")) })
  const finish = (done: ReturnType<typeof perform>) => {
    if (done.ok) onClose()
    else refused(done)
  }
  const takeOver = (target: Participant) =>
    finish(perform(PARTICIPANT_TAKE_OVER.id, { participant, takeover: target.id }))
  const discardAndStart = (target: Participant) =>
    finish(perform(PARTICIPANT_ACCEPT.id, { ...accepting, workroom: trimmed, replace: target.id }))
  // OK: 名前が生きていない参加者と同じ、または一覧から選んだなら、最後に確かめる
  const submit = () => {
    if (mode === "takeover") {
      if (chosen) setConfirming({ target: chosen, discardable: false })
    } else if (sameQuiet) setConfirming({ target: sameQuiet, discardable: true })
    else finish(perform(PARTICIPANT_ACCEPT.id, { ...accepting, workroom: trimmed }))
  }
  const ready = mode === "takeover" ? chosen !== undefined && allowedTake : trimmed !== "" && !inUse && allowedNew
  if (confirming) {
    const { target, discardable } = confirming
    const stillQuiet = quiet.some(p => p.id === target.id)
    return (
      <div className={styles.confirm}>
        <p>{t("Take over {name}?", { name: target.workroom ?? "" })}</p>
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
            <ActionButton danger disabled={!stillQuiet || !allowedNew} onClick={() => discardAndStart(target)}>
              {t("Discard and start new")}
            </ActionButton>
          )}
          <ActionButton primary disabled={!stillQuiet} onClick={() => takeOver(target)}>
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
              {quiet.map(p => (
                <label key={p.id} className={styles.takeRow} data-participant={p.id}>
                  <input type="radio" name="take-over" checked={p.id === pick} onChange={() => setPick(p.id)} />
                  {asBird(p.bird) && (
                    <BirdFaceView
                      bird={asBird(p.bird) as Bird}
                      {...(p.palette ? { palette: p.palette } : {})}
                      size={32}
                    />
                  )}
                  <span className={styles.name}>{p.workroom}</span>
                  <span className={styles.detail}>{[p.ai, p.model, p.env].join(" / ")}</span>
                  <span className={styles.detail}>
                    {t("Joined {time}", { time: p.joinedAt ? new Date(p.joinedAt).toLocaleString() : "" })}
                  </span>
                </label>
              ))}
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
                  maxLength={NAME_MAX}
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
