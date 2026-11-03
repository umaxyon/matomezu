// 描いた文書: ページの原文を読んだ形（MarkdownDocument）を、ブロックの順に描き、脚注を最後にまとめる。ステージもストアも読まない。
// リンクと画像は link-target.ts が選んだ物だけを開き・描く。# のリンクは、location を変えずに、この文書の中の飛ぶ先へスクロールする
import type { MouseEvent, ReactNode } from "react"
import type { MarkdownBlock, MarkdownDocument, MarkdownInline, MarkdownTableCell } from "../../../base"
import { drawsImage, footnoteAnchor, footnoteRefAnchor, linkTarget } from "../link-target"
import styles from "./MarkdownDocumentView.module.css"

export function MarkdownDocumentView({ document }: { document: MarkdownDocument }) {
  return (
    <div className={styles.body} data-markdown-document>
      <Blocks blocks={document.blocks} />
      {document.footnotes.length > 0 && (
        <section className={styles.footnotes}>
          <ol>
            {document.footnotes.map(f => (
              <li key={f.number} value={f.number} data-markdown-target={footnoteAnchor(f.number)}>
                <Blocks blocks={f.children} />
                <a
                  href={`#${footnoteRefAnchor(f.number)}`}
                  className={styles.backref}
                  onClick={e => jumpTo(e, footnoteRefAnchor(f.number))}
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
}

// 飛ぶ先 name（data-markdown-target）を、押したリンクのある文書の中から探してスクロールする（同じページを 2 つのペインに出すことがあるので、文書の根で絞る）
function jumpTo(e: MouseEvent<HTMLAnchorElement>, name: string) {
  e.preventDefault()
  const root = e.currentTarget.closest("[data-markdown-document]")
  const found = [...(root?.querySelectorAll("[data-markdown-target]") ?? [])].find(
    el => el.getAttribute("data-markdown-target") === name,
  )
  found?.scrollIntoView({ block: "start" })
}

function Blocks({ blocks }: { blocks: readonly MarkdownBlock[] }) {
  return blocks.map(b => <Block key={b.range.start} block={b} />)
}

function Block({ block }: { block: MarkdownBlock }): ReactNode {
  switch (block.kind) {
    case "paragraph":
      return (
        <p>
          <Inlines inlines={block.children} />
        </p>
      )
    case "heading": {
      const H = `h${block.depth}` as const
      return (
        <H data-markdown-target={block.anchor}>
          <Inlines inlines={block.children} />
        </H>
      )
    }
    case "blockquote":
      return (
        <blockquote>
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
      const spread = block.spread ? styles.spread : styles.tight
      return block.start === undefined ? (
        <ul className={spread}>{items}</ul>
      ) : (
        <ol className={spread} start={block.start}>
          {items}
        </ol>
      )
    }
    case "code":
      return (
        <pre className={styles.code}>
          <code>{block.value}</code>
        </pre>
      )
    case "thematicBreak":
      return <hr />
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
        <div className={styles.table}>
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
      if (target.kind === "anchor")
        return (
          <a href={inline.url} title={inline.title} onClick={e => jumpTo(e, target.anchor)}>
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
        <sup data-markdown-target={footnoteRefAnchor(inline.number)}>
          <a href={`#${footnoteAnchor(inline.number)}`} onClick={e => jumpTo(e, footnoteAnchor(inline.number))}>
            {inline.number}
          </a>
        </sup>
      )
  }
}
