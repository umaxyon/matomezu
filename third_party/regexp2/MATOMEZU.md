# regexp2 の写し

github.com/dlclark/regexp2/v2 v2.13.3（goja が使う正規表現のライブラリ）の写し。go.mod の replace で、取り寄せた物の代わりに使う。テストと fuzz の種は外した。

## 直した所

`syntax/charclass.go` の `getCharSetFromCategoryString` と `getCharSetFromOldString` が返す文字クラス（`\d`・`\s`・`\w` など）を、`c.Copy()` で深く写して返す（元は `local := c` の浅い写しで、ranges の配列をプロセスの中で共有していた）。

元のままだと、正規表現を組むとき（`syntax/tree.go` の `reduceSingleLetterAndNestedAlternations` → `addSet` → `canonicalize`）に、共有の配列をその場で並べ替え・書き換える。goja の VM を同時にいくつも動かすと（並べた Go のテストがエンジンをいくつも組む）、`go test -race` が競合を見つける。

## 版を上げるとき

上流の版に同じ直しが入っていれば、写しと replace を消す。入っていなければ、新しい版を写し直し、上の 2 か所を同じく直す。
