// プロジェクト設定: 左のタブで、画面の見出し「全般」（プロジェクト名・チケットプレフィクス）・「チケットタグ」・「レーン」を切り替える（切り替えても入れた値は残る）。
// プロジェクト名とチケットプレフィクスは必須。チケットプレフィクスは英字 1〜3 字と、最後にハイフン 1 つまでしか打てず、ほかのプロジェクトと重なれば知らせる。
// 名前が空か、どれかが重なっている間は保存できない。保存はプロジェクトを直すアクション 1 回で、常駐の答えを待ってから閉じる（断られたらダイアログの中に出す）。
// プロジェクトが無いか、直せなければ（閉じたプロジェクトなど。認可ステップに聞く）、すぐ閉じる
import { useEffect, useId, useState } from "react"
import {
  type DialogProps,
  useActions,
  useAllowedOn,
  useCoreCatalog,
  useMessages,
  useRecord,
  useRecords,
} from "../../../plugin-api/ui"
import { refusalMessage } from "../../base"
import { ActionButton, controlClass, Dialog, Field, Form, Problem, SideTabs } from "../../base/ui"
import { kit } from "../kit"
import { NO_DONE_LANE, PREFIX_PATTERN, PROJECT, PROJECT_NAME_MAX, sameName } from "../project"
import { PROJECT_UPDATE } from "../project/actions"
import { TICKET } from "../ticket"
import { ProjectCardSizeChoices } from "./CardSizeChoices"
import { LaneSettings } from "./LaneSettings"
import styles from "./ProjectSettingsDialog.module.css"
import {
  doneLaneBlocked,
  hidesTickets,
  type LaneRow,
  laneRowsOf,
  repeatedKeys,
  type TagRow,
  tagRowsOf,
  updateArgsOf,
} from "./rows"
import { TagSettings } from "./TagSettings"
import { useEditableRows } from "./useEditableRows"

const TABS = ["general", "tags", "lanes"] as const
type Tab = (typeof TABS)[number]
const TAB_TITLES = { general: "General", tags: "Ticket tags", lanes: "Lanes" } as const

// 打っている途中のプレフィクス（空も許す。決めるときは空を断る）
const PREFIX_TYPING = /^([A-Za-z]{1,3}-?)?$/

export function ProjectSettingsDialog({ args, onClose }: DialogProps<{ project: string }>) {
  const project = useRecord(PROJECT.id, args.project)
  const allowed = useAllowedOn(PROJECT_UPDATE.id, {}, { record: args.project }).ok
  const gone = !project || !allowed
  useEffect(() => {
    if (gone) onClose()
  }, [gone, onClose])
  return gone ? null : <Settings project={project} onClose={onClose} />
}

function Settings({
  project,
  onClose,
}: {
  project: NonNullable<ReturnType<typeof useRecord<typeof PROJECT.id>>>
  onClose: () => void
}) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const actions = useActions()
  const form = useId()
  const [tab, setTab] = useState<Tab>("general")
  const [name, setName] = useState(project.name)
  const [prefix, setPrefix] = useState(project.prefix)
  const lanes = useEditableRows<LaneRow>(() => laneRowsOf(project))
  const tags = useEditableRows<TagRow>(() => tagRowsOf(project))
  const [cardSize, setCardSize] = useState(project.cardSize)
  const [doneKey, setDoneKey] = useState(project.doneLane ?? NO_DONE_LANE) // 完了のレーンに選んだ行の鍵（もうあるレーンは id。無ければ none）
  const [refused, setRefused] = useState<string | null>(null)
  const others = useRecords(PROJECT.id, { where: [] }).filter(p => p.id !== project.id)
  const tickets = useRecords(TICKET.id, { where: [] })

  const nameMissing = name.trim() === ""
  const prefixMissing = prefix.trim() === ""
  const prefixTaken = !prefixMissing && others.some(p => sameName(p.prefix, prefix, true))
  const repeatedLanes = repeatedKeys(lanes.rows)
  const doneBlocked = doneLaneBlocked(project, lanes.rows, doneKey, tickets)
  const repeatedTags = repeatedKeys(tags.rows)
  const ready =
    !nameMissing &&
    !prefixMissing &&
    PREFIX_PATTERN.test(prefix) &&
    !prefixTaken &&
    repeatedLanes.size === 0 &&
    repeatedTags.size === 0 &&
    !doneBlocked

  const save = async () => {
    const done = await actions.performConfirmed(
      PROJECT_UPDATE.id,
      updateArgsOf(name, prefix, lanes.rows, tags.rows, doneKey, cardSize),
      {
        record: project.id,
      },
    )
    if (done.ok) onClose()
    else setRefused(t(refusalMessage(catalog, done, kit.message("Changed elsewhere: open the settings again"))))
  }

  return (
    <Dialog
      title={t("Project settings")}
      width={720}
      height={520}
      onClose={onClose}
      actions={
        <>
          <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
          <ActionButton form={form} primary disabled={!ready}>
            {t("Save")}
          </ActionButton>
        </>
      }
    >
      <Form id={form} ready={ready} onSubmit={() => void save()}>
        <div className={styles.body}>
          <SideTabs
            tabs={TABS.map(id => ({ id, title: t(TAB_TITLES[id]) }))}
            selected={tab}
            onSelect={id => setTab(id as Tab)}
          >
            <div className={styles.section} hidden={tab !== "general"}>
              <Field label={t("Project name")} aside={nameMissing && <Required text={t("Required")} />}>
                {id => (
                  <input
                    id={id}
                    type="text"
                    className={controlClass}
                    aria-invalid={nameMissing}
                    maxLength={PROJECT_NAME_MAX}
                    value={name}
                    onChange={e => setName(e.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t("Ticket prefix")}
                aside={
                  prefixMissing ? (
                    <Required text={t("Required")} />
                  ) : prefixTaken ? (
                    <Required text={t("Used by another project")} />
                  ) : null
                }
              >
                {id => (
                  <input
                    id={id}
                    type="text"
                    className={controlClass}
                    aria-invalid={prefixMissing || prefixTaken}
                    placeholder={t("Up to 3 letters and a hyphen")}
                    value={prefix}
                    onChange={e => PREFIX_TYPING.test(e.target.value) && setPrefix(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t("Ticket size")}>
                {() => <ProjectCardSizeChoices value={cardSize} onChange={setCardSize} />}
              </Field>
            </div>
            <div className={styles.fill} hidden={tab !== "tags"}>
              <TagSettings tags={tags} repeated={repeatedTags} />
            </div>
            <div className={styles.fill} hidden={tab !== "lanes"}>
              <LaneSettings
                lanes={lanes}
                repeated={repeatedLanes}
                hides={hidesTickets(project, lanes.rows, tickets)}
                done={doneKey}
                onDone={setDoneKey}
                doneBlocked={doneBlocked}
              />
            </div>
          </SideTabs>
        </div>
        {refused && <Problem>{refused}</Problem>}
      </Form>
    </Dialog>
  )
}

function Required({ text }: { text: string }) {
  return <span className={styles.required}>{text}</span>
}
