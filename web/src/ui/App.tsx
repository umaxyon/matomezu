// 画面の根: 上にヘッダー、その下にステージを並べた領域
import styles from "./App.module.css";
import { Header } from "./header/Header";
import { Workspace } from "./workspace/Workspace";

export function App() {
  return (
    <div className={styles.app}>
      <Header />
      <Workspace />
    </div>
  );
}
