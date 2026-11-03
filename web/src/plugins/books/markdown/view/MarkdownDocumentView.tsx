// 描いた文書: ページの原文を読んだ形（MarkdownDocument）を、ブロックの順に描き、脚注を最後にまとめる。ステージもストアも読まない。
// リンクと画像は link-target.ts が選んだ物だけを開き・描く。# のリンクは、location を変えずに、この文書の中の飛ぶ先へスクロールする。
// いちばん外のブロックには data-markdown-block を付ける（ソースのペインのスクロールに付いて行くときの目印。何番目のブロックかは並びで決まる）。
// いちばん外のブロックは、中身が変わったものだけを描き直す（block-keys.ts）
import { type MouseEvent, memo, type ReactNode } from "react"
import type { MarkdownBlock, MarkdownDocument, MarkdownInline, MarkdownTableCell } from "../../../base"
import { blockKeys } from "../block-keys"
import { drawsImage, footnoteFragment, footnoteRefFragment, linkTarget } from "../link-target"
import styles from "./MarkdownDocumentView.module.css"

// 同じ文書なら描き直さない
export const MarkdownDocumentView = memo(function MarkdownDocumentView({ document }: { document: MarkdownDocument }) {
  const keys = blockKeys(document.blocks)
  return (
    <div className={styles.body} data-markdown-document>
      {document.blocks.map((b, i) => (
        <TopBlock key={keys[i]} name={keys[i] ?? ""} block={b} />
      ))}
      {document.footnotes.length > 0 && (
        <section className={styles.footnotes}>
          <ol>
            {document.footnotes.map(f => (
              <li key={f.number} value={f.number} data-markdown-fragment={footnoteFragment(f.number)}>
                <Blocks blocks={f.children} />
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
const TopBlock = memo(
  function TopBlock({ block }: { name: string; block: MarkdownBlock }) {
    return <Block block={block} place="top" />
  },
  (a, b) => a.name === b.name,
)

// place は、いちばん外のブロックか、ほかのブロックの中か
function Block({ block, place = "inside" }: { block: MarkdownBlock; place?: "top" | "inside" }): ReactNode {
  const at = place === "top" ? { "data-markdown-block": "" } : {}
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
          <code>{block.value}</code>
        </pre>
      )
    case "thematicBreak":
      return <hr {...at} />
    // 生の HTML は、改行を保った文字で見せる
    case "html":
      return (
        <pre {...at} className={styles.html}>
          {block.value}
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
  switch (inline.kind) {
    case "text":
      return inline.value
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
      return drawsImage(inline.url) ? (
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
