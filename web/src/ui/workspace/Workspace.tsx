// ステージを並べる領域。並べ方は workspace の arrangement に従い、ステージには枠だけを渡す
import { useShallow } from "zustand/react/shallow";
import { Stage } from "../stage/Stage";
import { useApp } from "../store-context";
import styles from "./Workspace.module.css";

export function Workspace() {
  const ids = useApp(useShallow(s => s.workspace.stages.map(st => st.id)));
  const direction = useApp(s => s.workspace.arrangement.direction);
  return (
    <main className={`${styles.workspace} ${styles[direction] ?? ""}`}>
      {ids.map(id => (
        <div key={id} className={styles.cell}>
          <Stage id={id} />
        </div>
      ))}
    </main>
  );
}
