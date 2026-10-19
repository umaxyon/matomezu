// ヘッダー: 画面を分ける道具と、カレントのステージのページのタブ
import { useActions, useApp } from "../store-context";
import styles from "./Header.module.css";
import { Tabs } from "./Tabs";

export function Header() {
  const isSplit = useApp(s => s.workspace.stages.length > 1);
  const { split, unsplit } = useActions();
  return (
    <header className={styles.header}>
      <div className={styles.tools}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="画面を分割"
          aria-pressed={isSplit}
          onClick={isSplit ? unsplit : split}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M12 5v14" />
          </svg>
        </button>
      </div>
      <Tabs />
    </header>
  );
}
