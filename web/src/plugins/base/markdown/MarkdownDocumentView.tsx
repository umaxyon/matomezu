// 描いた文書: ページの原文を読んだ形（MarkdownDocument）を、ブロックの順に描き、脚注を最後にまとめる。ステージもストアも読まない。
// リンクと画像は link-target.ts が選んだ物だけを開き・描く。# のリンクは、location を変えずに、この文書の中の飛ぶ先へスクロールする。
// 付ける目印（base の外の、マークダウンのブックの検索・ソースのペインへのスクロールの追従・印刷の測りが読む。属性の名前は約束）:
//   data-markdown-document: 文書の根。data-soft-break に、段落の中の改行 1 つの見せ方（SoftBreak）を持つ
//   data-markdown-block: いちばん外のブロック。値は描いたときの原文の頭の位置で、中身が同じなら描き直さないので、上に書くとずれる（読む側が今の位置との差で直す）。何番目のブロックかは並びで決まる
//   data-markdown-fragment: 飛ぶ先（見出し・脚注）の名前
//   data-markdown-at: 原文と同じ字の並びの文中の字。値は原文の中の頭の位置で、block と同じく中身が同じなら描き直さないのでずれる（検索の当たりを光らせる側が今の位置との差で直す）
//   文書の根の直下の section: 脚注の節（印刷の測りが、本文のブロックと分けて測る）
// 文中の言葉のリンク（wordLinks。原文の位置の一覧と、押したときに行き先と押したリンクの要素を受ける onWordLink。word-links.ts）は、一覧の中の、そのブロックに収まる物の位置が変わったブロックだけを描き直す（data-markdown-word-link: 値は行き先）。
// いちばん外のブロックは、中身が変わったものだけを描き直す（block-keys.ts）。段落の中の改行 1 つを改行にするか空白にするか（softBreak）は、描き直さずに見た目（CSS）で変える。
// コードの塊は言語名のとおりに、生の HTML は html として色付けする（highlightCode。色はテーマキー markdown-code-color-<色の種類>。色だけを変え、太字や斜体は付けない。字の幅が変わると印刷で測る位置がずれるため）
// 色・字の大きさ・字体・余白は、テーマキー（tokens.ts の MARKDOWN_DOCUMENT_TOKENS）の CSS 変数で受ける。ブックの外で描く所は、その CSS 変数を自分で置く
import {
  createContext,
  type MouseEvent,
  memo,
  type ReactNode,
  type RefObject,
  useContext,
  useMemo,
  useRef,
} from "react"
import { highlightCode } from "../code-highlight/highlight"
import { blockKeys } from "./block-keys"
import { drawsMarkdownImage, footnoteFragment, footnoteRefFragment, linkTarget } from "./link-target"
import styles from "./MarkdownDocumentView.module.css"
import type { MarkdownBlock, MarkdownDocument, MarkdownInline, MarkdownTableCell } from "./parse"
import type { SoftBreak } from "./soft-break"
import { splitWords, type WordLink } from "./word-links"

// 同じ文書なら描き直さない
export const MarkdownDocumentView = memo(function MarkdownDocumentView({
  document,
  softBreak,
  wordLinks = NO_LINKS,
  onWordLink,
}: {
  document: MarkdownDocument
  softBreak: SoftBreak
  wordLinks?: readonly WordLink[]
  onWordLink?: (target: string, from: Element) => void
}) {
  const keys = blockKeys(document.blocks)
  // 押したときの関数は、描き直さずに最後の物を呼ぶ（ブロックの描き直しの比べに入れない）
  const sink = useRef(onWordLink)
  sink.current = onWordLink
  return (
    <div className={styles.body} data-markdown-document data-soft-break={softBreak}>
      {document.blocks.map((b, i) => {
        const inside = linksWithin(wordLinks, b.range)
        return <TopBlock key={keys[i]} name={keys[i] ?? ""} block={b} links={inside} sink={sink} />
      })}
      {document.footnotes.length > 0 && (
        <section className={styles.footnotes}>
          <ol>
            {document.footnotes.map(f => (
              <li key={f.number} value={f.number} data-markdown-fragment={footnoteFragment(f.number)}>
                <WordLinkScope range={f.range} links={linksWithin(wordLinks, f.range)} sink={sink}>
                  <Blocks blocks={f.children} />
                </WordLinkScope>
                <a
                  href={`#${footnoteRefFragment(f.number)}`}
                  className={styles.backref}
                  onClick={e => jumpTo(e, footnoteRefFragment(f.number))}
                >
                  ↩
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
})

const NO_LINKS: readonly WordLink[] = []

// 範囲 range に収まるリンクの、範囲の頭を 0 とした位置（範囲の外の物と、範囲をまたぐ物は除く）
function linksWithin(links: readonly WordLink[], range: { start: number; end: number }): readonly WordLink[] {
  const inside = links.filter(l => l.at >= range.start && l.at + l.length <= range.end)
  return inside.length === 0 ? NO_LINKS : inside.map(l => ({ ...l, at: l.at - range.start }))
}

// 押したときの関数（描き直さずに最後の物を呼ぶ）
type Sink = RefObject<((target: string, from: Element) => void) | undefined>

// ブロックの中で使う、リンクにする所（範囲の頭を 0 とした位置）と、範囲の頭（原文の位置）、押したときの関数
const WordLinkContext = createContext<{ links: readonly WordLink[]; start: number; sink: Sink } | null>(null)

function WordLinkScope({
  range,
  links,
  sink,
  children,
}: {
  range: { start: number }
  links: readonly WordLink[]
  sink: Sink
  children: ReactNode
}) {
  const value = useMemo(
    () => (links.length === 0 ? null : { links, start: range.start, sink }),
    [links, range.start, sink],
  )
  return <WordLinkContext.Provider value={value}>{children}</WordLinkContext.Provider>
}

// フラグメント name の飛ぶ先（data-markdown-fragment）を、押したリンクのある文書の中から探してスクロールする（同じページを 2 つのペインに出すことがあるので、文書の根で絞る）
function jumpTo(e: MouseEvent<HTMLAnchorElement>, name: string) {
  e.preventDefault()
  const root = e.currentTarget.closest("[data-markdown-document]")
  const found = [...(root?.querySelectorAll("[data-markdown-fragment]") ?? [])].find(
    el => el.getAttribute("data-markdown-fragment") === name,
  )
  found?.scrollIntoView({ block: "start" })
}

function Blocks({ blocks }: { blocks: readonly MarkdownBlock[] }) {
  return blocks.map(b => <Block key={b.range.start} block={b} />)
}

// いちばん外のブロック: 名前（中身）が同じなら描き直さない
// （リンクにする所も、範囲の頭からの位置が同じなら描き直さない）
const TopBlock = memo(
  function TopBlock({
    block,
    links,
    sink,
  }: {
    name: string
    block: MarkdownBlock
    links: readonly WordLink[]
    sink: Sink
  }) {
    return (
      <WordLinkScope range={block.range} links={links} sink={sink}>
        <Block block={block} place="top" />
      </WordLinkScope>
    )
  },
  (a, b) => a.name === b.name && sameLinks(a.links, b.links),
)

const sameLinks = (a: readonly WordLink[], b: readonly WordLink[]): boolean =>
  a === b ||
  (a.length === b.length &&
    a.every((l, i) => l.at === b[i]?.at && l.length === b[i]?.length && l.target === b[i]?.target))

// place は、いちばん外のブロックか、ほかのブロックの中か
function Block({ block, place = "inside" }: { block: MarkdownBlock; place?: "top" | "inside" }): ReactNode {
  const at = place === "top" ? { "data-markdown-block": block.range.start } : {}
  switch (block.kind) {
    case "paragraph":
      return (
        <p {...at}>
          <Inlines inlines={block.children} />
        </p>
      )
    case "heading": {
      const H = `h${block.depth}` as const
      return (
        <H {...at} data-markdown-fragment={block.fragment}>
          <Inlines inlines={block.children} />
        </H>
      )
    }
    case "blockquote":
      return (
        <blockquote {...at}>
          <Blocks blocks={block.children} />
        </blockquote>
      )
    case "list": {
      const items = block.items.map(item => (
        <li key={item.range.start} className={item.check === "none" ? undefined : styles.task}>
          {item.check !== "none" && (
            <input type="checkbox" checked={item.check === "checked"} disabled className={styles.check} />
          )}
          <Blocks blocks={item.children} />
        </li>
      ))
      const spread = block.spread ? undefined : styles.tight
      return block.ordered ? (
        <ol {...at} className={spread} start={block.start}>
          {items}
        </ol>
      ) : (
        <ul {...at} className={spread}>
          {items}
        </ul>
      )
    }
    case "code":
      return (
        <pre {...at} className={styles.code}>
          <code>
            <Highlighted code={block.value} language={block.lang} />
          </code>
        </pre>
      )
    case "thematicBreak":
      return <hr {...at} />
    // 生の HTML は、改行を保った文字で、html として色付けして見せる
    case "html":
      return (
        <pre {...at} className={styles.html}>
          <Highlighted code={block.value} language="html" />
        </pre>
      )
    case "table": {
      const cell = (c: MarkdownTableCell, i: number, Tag: "th" | "td") => {
        const align = block.align[i] ?? "none"
        return (
          <Tag key={c.range.start} style={align === "none" ? undefined : { textAlign: align }}>
            <Inlines inlines={c.children} />
          </Tag>
        )
      }
      return (
        <div {...at} className={styles.table}>
          <table>
            <thead>
              <tr>{block.head.map((c, i) => cell(c, i, "th"))}</tr>
            </thead>
            <tbody>
              {block.body.map(row => (
                <tr key={row[0]?.range.start}>{row.map((c, i) => cell(c, i, "td"))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
  }
}

function Inlines({ inlines }: { inlines: readonly MarkdownInline[] }) {
  return inlines.map(i => <Inline key={i.range.start} inline={i} />)
}

function Inline({ inline }: { inline: MarkdownInline }): ReactNode {
  const words = useContext(WordLinkContext)
  switch (inline.kind) {
    // 原文と同じ字の並びの字は、原文の中の頭の位置を data-markdown-at に付ける（検索の当たりを光らせる側が引く）。リンクにする所があれば、その所で割る
    case "text": {
      if (inline.range.end - inline.range.start !== inline.value.length) return inline.value
      const head = inline.range.start - (words?.start ?? 0)
      const own = words?.links.filter(l => l.at >= head && l.at + l.length <= head + inline.value.length) ?? []
      if (!words || own.length === 0) return <span data-markdown-at={inline.range.start}>{inline.value}</span>
      return splitWords(
        inline.value,
        own.map(l => ({ ...l, at: l.at - head })),
      ).map(piece =>
        piece.kind === "text" ? (
          <span key={piece.at} data-markdown-at={inline.range.start + piece.at}>
            {piece.text}
          </span>
        ) : (
          <a
            key={piece.at}
            href={`#${piece.target}`}
            className={styles.wordLink}
            data-markdown-at={inline.range.start + piece.at}
            data-markdown-word-link={piece.target}
            onClick={e => {
              e.preventDefault()
              words.sink.current?.(piece.target, e.currentTarget)
            }}
          >
            {piece.text}
          </a>
        ),
      )
    }
    case "strong":
      return (
        <strong>
          <Inlines inlines={inline.children} />
        </strong>
      )
    case "emphasis":
      return (
        <em>
          <Inlines inlines={inline.children} />
        </em>
      )
    case "delete":
      return (
        <del>
          <Inlines inlines={inline.children} />
        </del>
      )
    case "inlineCode":
      return <code className={styles.inlineCode}>{inline.value}</code>
    case "break":
      return <br />
    case "link": {
      const target = linkTarget(inline.url)
      const children = <Inlines inlines={inline.children} />
      if (target.kind === "open")
        return (
          <a href={target.url} title={inline.title} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        )
      if (target.kind === "fragment")
        return (
          <a href={inline.url} title={inline.title} onClick={e => jumpTo(e, target.fragment)}>
            {children}
          </a>
        )
      return <span className={styles.deadLink}>{children}</span>
    }
    case "image":
      return drawsMarkdownImage(inline.url) ? (
        <img src={inline.url} alt={inline.alt} title={inline.title} className={styles.image} />
      ) : (
        <span className={styles.imageAlt} title={inline.url}>
          {inline.alt}
        </span>
      )
    case "footnoteReference":
      return (
        <sup data-markdown-fragment={footnoteRefFragment(inline.number)}>
          <a href={`#${footnoteFragment(inline.number)}`} onClick={e => jumpTo(e, footnoteFragment(inline.number))}>
            {inline.number}
          </a>
        </sup>
      )
  }
}

// コードを色付けした字の並び（色の無い字はそのまま、色のある字は色の種類のテーマキー markdown-code-color-<種類> の色の span。色の種類は data-code-color にも付ける）
function Highlighted({ code, language }: { code: string; language: string | undefined }) {
  const spans = useMemo(() => highlightCode(code, language), [code, language])
  return spans.map((s, i) =>
    s.color === "plain" ? (
      s.text
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: 並びはコードの中身だけで決まり、並べ替えない
      <span key={i} data-code-color={s.color} style={{ color: `var(--markdown-code-color-${s.color})` }}>
        {s.text}
      </span>
    ),
  )
}
