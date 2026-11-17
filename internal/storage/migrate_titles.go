package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"maps"
	"os"
	"slices"
	"strconv"
)

// retitled は、名前を変えた行 1 つ: 表（"pages" か "folders"）・id・変える前の名前・変えた後の名前
type retitled struct {
	table, id, was, now string
}

// numberSameTitlesLogged は、numberSameTitles を行い、名前を変えた行を 1 行ずつ標準エラーに書く（goMigrations に結ぶ）
func numberSameTitlesLogged(tx *sql.Tx) error {
	changed, err := numberSameTitles(tx)
	if err != nil {
		return err
	}
	for _, c := range changed {
		fmt.Fprintf(os.Stderr, "storage: the title of %s (%s) was taken in its folder: %q is now %q\n", c.id, c.table, c.was, c.now)
	}
	return nil
}

// numberSameTitles は、書庫ホームとフォルダ（役 home・folder）の直下のエントリどうしで名前（title）が重ならないようにする:
//   - 同じ名前のエントリのうち、並びの後ろに在る方を「<名前> 2」にする（その名前も直下に在れば 3、4…）
//   - ゴミ箱（役 trash）の直下と、ブック・バインダの中は見ない。ゴミ箱の中に在っても、役 folder のフォルダの直下は見る
//   - 名前を読めないエントリ（行が無い・本文が読めない・title が空でない文字でない）は数えず、変えない
//   - 名前を変えた行は版を 1 上げる。書いた時刻と、ほかのキーの順と値は変えない
//
// 返すのは、名前を変えた行（フォルダの id の順、その中は並びの順）
func numberSameTitles(tx *sql.Tx) ([]retitled, error) {
	folders, err := folderBodies(tx)
	if err != nil {
		return nil, err
	}
	pages, err := pageBodies(tx)
	if err != nil {
		return nil, err
	}
	var changed []retitled
	for _, id := range slices.Sorted(maps.Keys(folders)) {
		if role := RoleOf(folders[id]); role != "home" && role != "folder" {
			continue
		}
		type named struct {
			table, id, title string
		}
		var direct []named
		taken := map[string]bool{}
		for _, e := range lineupIn(folders[id]) {
			var ref struct {
				Kind string `json:"kind"`
				ID   string `json:"id"`
			}
			if json.Unmarshal(e, &ref) != nil || ref.ID == "" {
				continue
			}
			table, body := "folders", folders[ref.ID]
			if ref.Kind == "page" {
				table, body = "pages", pages[ref.ID]
			}
			if title, ok := titleIn(body); ok {
				direct = append(direct, named{table, ref.ID, title})
				taken[title] = true
			}
		}
		seen := map[string]bool{}
		for _, d := range direct {
			if !seen[d.title] {
				seen[d.title] = true
				continue
			}
			made := d.title
			for n := 2; taken[made]; n++ {
				made = d.title + " " + strconv.Itoa(n)
			}
			taken[made], seen[made] = true, true
			rows := folders
			if d.table == "pages" {
				rows = pages
			}
			body, ok := withField(rows[d.id], "title", jsonString(made))
			if !ok {
				return nil, fmt.Errorf("the row %s could not be rewritten", d.id)
			}
			rows[d.id] = body
			if _, err := tx.Exec(`UPDATE `+d.table+` SET body = ?, version = version + 1 WHERE id = ?`, string(body), d.id); err != nil {
				return nil, err
			}
			changed = append(changed, retitled{d.table, d.id, d.title, made})
		}
	}
	return changed, nil
}

// pageBodies は、表 pages の全部の行の本文（id → 本文）
func pageBodies(tx *sql.Tx) (map[string]json.RawMessage, error) {
	rows, err := tx.Query(`SELECT id, body FROM pages`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]json.RawMessage{}
	for rows.Next() {
		var id string
		var body []byte
		if err := rows.Scan(&id, &body); err != nil {
			return nil, err
		}
		out[id] = body
	}
	return out, rows.Err()
}

// titleIn は、行の本文 body の名前（title が空でない文字でなければ ok が false）
func titleIn(body json.RawMessage) (string, bool) {
	var head struct {
		Title *string `json:"title"`
	}
	if body == nil || json.Unmarshal(body, &head) != nil || head.Title == nil || *head.Title == "" {
		return "", false
	}
	return *head.Title, true
}
