// 行の頭の絵: 種類の既定か、選んだアイコン（entry.ts の FOLDER_ICONS・FILE_ICONS）。フォルダとブックは、開いている（中身が見えている）ときに開いた絵にする
import type { ReactNode } from "react"
import type { Icon, Kind } from "./entry"
import {
  BookIcon,
  BookOpenIcon,
  ClassDiagramIcon,
  DirectoryIcon,
  DrawingIcon,
  FileIcon,
  FlowchartIcon,
  FolderIcon,
  FolderOpenIcon,
  HtmlIcon,
  MarkdownIcon,
  SlideIcon,
  TreeIcon,
} from "./node-icons"

const FILES: Readonly<Record<string, (size: number) => ReactNode>> = {
  file: size => <FileIcon size={size} />,
  drawing: size => <DrawingIcon size={size} />,
  flowchart: size => <FlowchartIcon size={size} />,
  tree: size => <TreeIcon size={size} />,
  directory: size => <DirectoryIcon size={size} />,
  markdown: size => <MarkdownIcon size={size} />,
  slide: size => <SlideIcon size={size} />,
  "class-diagram": size => <ClassDiagramIcon size={size} />,
  html: size => <HtmlIcon size={size} />,
}

export function NodeIcon({ kind, icon, open, size }: { kind: Kind; icon?: Icon; open: boolean; size: number }) {
  if (kind === "file") return FILES[icon ?? "file"]?.(size) ?? <FileIcon size={size} />
  if (icon === "book") return open ? <BookOpenIcon size={size} /> : <BookIcon size={size} />
  return open ? <FolderOpenIcon size={size} /> : <FolderIcon size={size} />
}
