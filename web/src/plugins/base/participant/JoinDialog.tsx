// 参加要求を受け入れるダイアログ: ワークルームの名前・鳥・配色を 1 度に決めて、受け入れる（アクション participant-accept）。
// 名前の初めは元のセッション名。鳥は 5 羽から 1 つ（同じ鳥を何人に当ててもよい）、配色は 20 個から 1 つ（選ばなければ、鳥の元の配色）。配色を選ぶと、5 羽ともその配色に塗り替わる。
// 同じ名前の、生きている参加者がいる間は決められない。キャンセルは閉じるだけで、参加要求は保留のまま
import { useId, useState } from "react"
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
import { PARTICIPANT_ACCEPT } from "."
import { BirdFaceView } from "./BirdFaceView"
import { originalPalette, PALETTE_TITLES } from "./birds"
import { useIsAlive, useNowMs, useParticipantCalls, useParticipants } from "./hooks"
import styles from "./Participant.module.css"

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
  const [name, setName] = useState(first?.workroom ?? first?.sessionName ?? "")
  const [bird, setBird] = useState<Bird>(BIRD_IDS[0])
  const [palette, setPalette] = useState<string | undefined>(undefined)
  const shown = palette ?? originalPalette(bird)
  const trimmed = name.trim()
  const inUse =
    trimmed !== "" &&
    participants.some(p => p.state === "joined" && p.workroom === trimmed && isAlive(calls[p.id], nowMs))
  const shownTitle = PALETTE_TITLES[shown as keyof typeof PALETTE_TITLES]
  const paletteName = shownTitle ? t(shownTitle) : ""
  const allowed = useAllowedOn(PARTICIPANT_ACCEPT.id, {
    participant,
    workroom: trimmed || "-",
    bird,
    ...(palette ? { palette } : {}),
  }).ok
  const accept = () => {
    const done = perform(PARTICIPANT_ACCEPT.id, {
      participant,
      workroom: trimmed,
      bird,
      ...(palette ? { palette } : {}),
    })
    if (done.ok) onClose()
    else
      showToast({ kind: "warn", message: refusalMessage(catalog, done, kit.message("Could not answer the request")) })
  }
  return (
    <Form id={form} ready={trimmed !== "" && !inUse && allowed} onSubmit={accept}>
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
      <div className={styles.buttons}>
        <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
        <ActionButton form={form} primary disabled={trimmed === "" || inUse || !allowed}>
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
