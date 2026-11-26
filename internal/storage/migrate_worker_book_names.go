package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"
)

const (
	ticketsHistory = "@matomezu/base:tickets-history"
	workroomKind   = "@matomezu/base:workroom"
)

// fixWorkerBookNames は、ワーカーブック（バックヤード tickets-history の中のブック）の名前と、その中のページの名前を、写し元の今の名前に合わせる:
//   - workKey がチケットのブックの名前を、そのチケットの番号（プロジェクトのチケットプレフィクスと 4 桁の番号）にし、ワークルームのブックはワークルームの名前にする
//   - チケットのブックの中のページ（バインダの中も）で、名前がその番号で始まる物（すぐ後ろが数字の物を除く）は、頭の番号と、それに続く空白・区切りの記号・「の」を外す。
//     外すと空になる物は変えない
//   - 写し元のレコードが無い・読めない物は変えない。名前を変えた行は版を 1 上げる
func fixWorkerBookNames(tx *sql.Tx) error {
	folders, err := folderBodies(tx)
	if err != nil {
		return err
	}
	pages, err := pageBodies(tx)
	if err != nil {
		return err
	}
	prefixes := map[string]string{}
	if err := readBodies(tx, projectKind, func(id string, body []byte) {
		var p struct {
			Prefix string `json:"prefix"`
		}
		if json.Unmarshal(body, &p) == nil {
			prefixes[id] = p.Prefix
		}
	}); err != nil {
		return err
	}
	labels := map[string]string{}
	if err := readBodies(tx, ticketKind, func(id string, body []byte) {
		var t struct {
			Project string `json:"project"`
			Number  *int   `json:"number"`
		}
		if json.Unmarshal(body, &t) != nil || t.Number == nil {
			return
		}
		if prefix, ok := prefixes[t.Project]; ok {
			labels[id] = fmt.Sprintf("%s%04d", prefix, *t.Number)
		}
	}); err != nil {
		return err
	}
	rooms := map[string]string{}
	if err := readBodies(tx, workroomKind, func(id string, body []byte) {
		var w struct {
			Name string `json:"name"`
		}
		if json.Unmarshal(body, &w) == nil && w.Name != "" {
			rooms[id] = w.Name
		}
	}); err != nil {
		return err
	}
	retitle := func(table string, rows map[string]json.RawMessage, id, title string) error {
		body, ok := withField(rows[id], "title", jsonString(title))
		if !ok {
			return fmt.Errorf("the row %s could not be rewritten", id)
		}
		rows[id] = body
		_, err := tx.Exec(`UPDATE `+table+` SET body = ?, version = version + 1 WHERE id = ?`, string(body), id)
		return err
	}
	for _, yard := range folders {
		var y struct {
			FolderRole string `json:"folderRole"`
			Backyard   string `json:"backyard"`
		}
		if json.Unmarshal(yard, &y) != nil || y.FolderRole != "backyard" || y.Backyard != ticketsHistory {
			continue
		}
		for _, e := range lineupIn(yard) {
			var ref struct {
				ID      string `json:"id"`
				WorkKey struct {
					Subject string `json:"subject"`
					ID      string `json:"id"`
				} `json:"workKey"`
			}
			if json.Unmarshal(e, &ref) != nil || folders[ref.ID] == nil {
				continue
			}
			name, ok := "", false
			switch ref.WorkKey.Subject {
			case ticketKind:
				name, ok = labels[ref.WorkKey.ID]
			case workroomKind:
				name, ok = rooms[ref.WorkKey.ID]
			}
			if !ok {
				continue
			}
			if title, _ := titleIn(folders[ref.ID]); title != name {
				if err := retitle("folders", folders, ref.ID, name); err != nil {
					return err
				}
			}
			if ref.WorkKey.Subject != ticketKind {
				continue
			}
			for _, page := range pagesWithin(folders, ref.ID) {
				title, ok := titleIn(pages[page])
				if !ok {
					continue
				}
				if rest, cut := withoutLabel(title, name); cut {
					if err := retitle("pages", pages, page, rest); err != nil {
						return err
					}
				}
			}
		}
	}
	return nil
}

// pagesWithin は、ブック book の中のページの id（並びの順。バインダの中も）
func pagesWithin(folders map[string]json.RawMessage, book string) []string {
	var out []string
	for _, e := range lineupIn(folders[book]) {
		var ref struct {
			Kind string `json:"kind"`
			ID   string `json:"id"`
		}
		if json.Unmarshal(e, &ref) != nil {
			continue
		}
		if ref.Kind == "page" {
			out = append(out, ref.ID)
			continue
		}
		for _, b := range lineupIn(folders[ref.ID]) {
			if json.Unmarshal(b, &ref) == nil && ref.Kind == "page" {
				out = append(out, ref.ID)
			}
		}
	}
	return out
}

// withoutLabel は、名前 title が番号 label で始まる（すぐ後ろが数字でない）とき、頭の番号と、続く空白・区切りの記号・「の」を外した名前（空になるなら cut が false）
func withoutLabel(title, label string) (rest string, cut bool) {
	if label == "" || !strings.HasPrefix(title, label) {
		return "", false
	}
	rest = title[len(label):]
	if r, _ := utf8.DecodeRuneInString(rest); r >= '0' && r <= '9' {
		return "", false
	}
	const seps = " 　:：-–—"
	rest = strings.TrimLeft(rest, seps)
	rest = strings.TrimLeft(strings.TrimPrefix(rest, "の"), seps)
	return rest, rest != ""
}
