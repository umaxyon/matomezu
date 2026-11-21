package storage

import (
	"database/sql"
	"regexp"
	"strings"
)

// renamedIDTables は、名前を変えた id が値として入る表（本文 body の JSON）と、版の列を持つか。
// レコード（records・rec_<n>）は見ない: 索引キーの列が本文から作られていて、本文だけ変えると食い違う。
// そのため、古い id のアクション（引数の名前も entry から node に変わった）を乗せた変更提案郵便は、反映すると失敗する
var renamedIDTables = []struct {
	table   string
	version bool
}{
	{"pages", true},
	{"folders", true},
	{"settings", false},
	{"page_annotations", false},
	{"ai_edit_tickets", false},
}

// renamedID は、名前を変えた id の、変えた後（変えていなければ false）:
//   - プラグイン @matomezu/slide-book は @matomezu/slide-page に（ページのタイプ・列挙の値など、その頭の id 全部）
//   - ディレクトリ構成図の中身 entry は node に（@matomezu/dir:entry-… のアクション・コマンド・列挙 entry-icon とその値）
//   - ページのタイプが足す、ディレクトリ構成図のアイコンの値 <プラグイン>:entry-icon は <プラグイン>:node-icon に
func renamedID(s string) (string, bool) {
	const plugin = "@matomezu/"
	if !strings.HasPrefix(s, plugin) {
		return "", false
	}
	owner, name, ok := strings.Cut(s[len(plugin):], ":")
	if !ok {
		return "", false
	}
	changed := false
	if owner == "slide-book" {
		owner, changed = "slide-page", true
	}
	if owner == "dir" && strings.HasPrefix(name, "entry-") {
		name, changed = "node-"+strings.TrimPrefix(name, "entry-"), true
	} else if name == "entry-icon" {
		name, changed = "node-icon", true
	}
	return plugin + owner + ":" + name, changed
}

// idToken は、本文の JSON の中の、id の形の文字 1 つ（キーか値。前に区切りか頭があり、文の中の \" で囲んだ物は当たらない）
var idToken = regexp.MustCompile(`(^|[{\[,:\s])"(@matomezu/[a-z0-9-]+:[a-z0-9-]+)"`)

// renameIDs は、renamedIDTables の本文の JSON の中で、キーか値が名前を変えた id（renamedID）と丸ごと同じ文字を、変えた後の id にする。
// 文の中に混ざった id（説明の文など）は変えない。ほかのキーの順と値、書いた時刻は変えず、版の列があれば変えた行の版を 1 上げる
func renameIDs(tx *sql.Tx) error {
	for _, t := range renamedIDTables {
		type row struct {
			id   int64
			body string
		}
		rows, err := tx.Query(`SELECT rowid, body FROM ` + t.table + ` WHERE body LIKE '%"@matomezu/%'`)
		if err != nil {
			return err
		}
		var changed []row
		for rows.Next() {
			var r row
			if err := rows.Scan(&r.id, &r.body); err != nil {
				rows.Close()
				return err
			}
			body := idToken.ReplaceAllStringFunc(r.body, func(m string) string {
				sub := idToken.FindStringSubmatch(m)
				if now, ok := renamedID(sub[2]); ok {
					return sub[1] + `"` + now + `"`
				}
				return m
			})
			if body != r.body {
				changed = append(changed, row{r.id, body})
			}
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
		set := `UPDATE ` + t.table + ` SET body = ? WHERE rowid = ?`
		if t.version {
			set = `UPDATE ` + t.table + ` SET body = ?, version = version + 1 WHERE rowid = ?`
		}
		for _, r := range changed {
			if _, err := tx.Exec(set, r.body, r.id); err != nil {
				return err
			}
		}
	}
	return nil
}
