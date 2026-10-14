package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

// 画面から新しいブック（図のファイル）を作る（残課題 D20）。
//
//	POST /api/new  {"near", "title", "world"} → {"id", "path"}
//
// 置き場所は、near のブック（画面で今見ているもの）と同じフォルダ。near が無ければ、最後に登録した図のフォルダ。
// 置き場所と LLM の許可の決まりは、残課題 D22 で詰める（それまでは、ほかの図と同じ所に作る）。
//
// /api/open と違い鍵を求めない入口なので、できることを狭くしてある:
//   - 作れるのは、登録済みの図があるフォルダの、まだ無いファイルだけ（今あるファイルは上書きしない）
//   - 名前は題名から作り、フォルダの区切りやファイル名に使えない文字は除く（ほかのフォルダへ出られない）
//   - JSON の本文だけを受け付け、Origin があれば localhost のものに限る（ほかのサイトのページからの送信を断る）

// 題名が空のときのファイル名
const untitled = "無題"

// ファイル名にする題名の長さの上限（文字数）
const maxNameRunes = 60

// 新しいブックの中身。world はダイアログで選んだワールドの設定
type newBook struct {
	Near  string          `json:"near"`
	Title string          `json:"title"`
	World json.RawMessage `json:"world"`
}

func (h *Hub) newBook(w http.ResponseWriter, r *http.Request) {
	var req newBook
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	world := map[string]any{}
	if len(req.World) > 0 && json.Unmarshal(req.World, &world) != nil {
		http.Error(w, "world must be an object", http.StatusBadRequest)
		return
	}
	// 画面で作ったブックには作った人の印を付ける（マスターでユーザーのブックと LLM のブックを分ける。D26 の段階 2）
	world["madeBy"] = "user"
	dir := h.folderNear(req.Near)
	if dir == "" {
		http.Error(w, "no folder to create the diagram in", http.StatusBadRequest)
		return
	}
	body, _ := json.MarshalIndent(map[string]any{"world": world, "nodes": []any{}, "edges": []any{}}, "", "  ")
	path, err := createUnique(dir, fileBase(req.Title), append(body, '\n'))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	res, err := h.Open(path, false, "")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]string{"id": res.ID, "path": res.Path})
}

// folderNear は新しいブックを置くフォルダ。near の図のフォルダ、無ければ最後に登録した図のフォルダ（どちらも今あるもの）
func (h *Hub) folderNear(near string) string {
	h.mu.Lock()
	defer h.mu.Unlock()
	cands := []string{}
	if d := h.docs[near]; d != nil {
		cands = append(cands, d.path)
	}
	for i := len(h.recent) - 1; i >= 0; i-- {
		cands = append(cands, h.recent[i])
	}
	for _, p := range cands {
		dir := filepath.Dir(p)
		if st, err := os.Stat(dir); err == nil && st.IsDir() {
			return dir
		}
	}
	return ""
}

// fileBase は題名から作るファイル名（拡張子なし）。区切りや使えない文字は _ にし、長すぎれば切る
func fileBase(title string) string {
	name := strings.Map(func(r rune) rune {
		if r < 0x20 || strings.ContainsRune(`\/:*?"<>|`, r) {
			return '_'
		}
		return r
	}, strings.TrimSpace(title))
	if utf8.RuneCountInString(name) > maxNameRunes {
		name = string([]rune(name)[:maxNameRunes])
	}
	// 先頭の . は隠しファイルになり、. や .. はフォルダを指すので使わない
	name = strings.Trim(strings.TrimLeft(name, "."), " ")
	if name == "" {
		return untitled
	}
	return name
}

// createUnique は dir に base.json を作る。あれば base-2.json、base-3.json … と、まだ無い名前にする（上書きしない）
func createUnique(dir, base string, body []byte) (string, error) {
	for i := 1; i < 1000; i++ {
		name := base + ".json"
		if i > 1 {
			name = fmt.Sprintf("%s-%d.json", base, i)
		}
		path := filepath.Join(dir, name)
		f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
		if errors.Is(err, fs.ErrExist) {
			continue
		}
		if err != nil {
			return "", err
		}
		_, err = f.Write(body)
		if cerr := f.Close(); err == nil {
			err = cerr
		}
		if err != nil {
			os.Remove(path)
			return "", err
		}
		return path, nil
	}
	return "", errors.New("too many diagrams with the same name")
}

// fromPage は、画面からの書き込みだけを通す: JSON の本文で、Origin が無いか localhost のもの。
// ほかのサイトのページは、確認無しで送れる形（text/plain の本文など）でしか送れないので、それを断る
func fromPage(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") || !localOrigin(r.Header.Get("Origin")) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next(w, r)
	}
}

// localOrigin は Origin が無いか、localhost のものか（ほかのサイトのページから送られたものを断る）
func localOrigin(origin string) bool {
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	host := u.Hostname()
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}
