package server

// プロジェクト: 名前を持つ論理的なフィルターの層（プロジェクトの表は core/project.ts にあり、エンジンから読む）。
// ブックの土台のフィールド project と、郵便の project を、AI が読む口（list_books・read_mail）で絞るのに使う。
// 絞る口は、読むプロジェクトの id の並びを ?projects=a&projects=b で必ず受ける（空や表に無い id は 400 で断る）。全部を表す特別な値は無い

import (
	"encoding/json"
	"net/http"
	"slices"
	"strings"
)

// checkProjects は、AI が指したプロジェクトの id の並び ids が、1 つ以上で、全部表にあるかを確かめる。断る理由の文（AI に返す）は、あれば返す
func (h *Hub) checkProjects(ids []string) (string, error) {
	if len(ids) == 0 {
		return "projects is required (the ids of the projects, one or more)", nil
	}
	table, err := h.engine.Projects()
	if err != nil {
		return "", err
	}
	known := make([]string, len(table))
	for i, p := range table {
		known[i] = p.ID
	}
	var unknown []string
	for _, id := range ids {
		if !slices.Contains(known, id) {
			unknown = append(unknown, id)
		}
	}
	if len(unknown) > 0 {
		return "no such project: " + strings.Join(unknown, ", ") + " (known: " + strings.Join(known, ", ") + ")", nil
	}
	return "", nil
}

// aiProjects は、頼みの projects を確かめて返す。断るときは 400 を返して false
func (o Options) aiProjects(w http.ResponseWriter, r *http.Request) ([]string, bool) {
	ids := r.URL.Query()["projects"]
	reason, err := o.Hub.checkProjects(ids)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return nil, false
	}
	if reason != "" {
		http.Error(w, reason, http.StatusBadRequest)
		return nil, false
	}
	return ids, true
}

// projectOf は、ブックか郵便のデータ body の project（無ければ空）
func projectOf(body json.RawMessage) string {
	var head struct {
		Project string `json:"project"`
	}
	_ = json.Unmarshal(body, &head)
	return head.Project
}

// AIMailbox は、利用者の郵便箱のうち、プロジェクトが projects のどれかである郵便を、届いた順に返す
func (h *Hub) AIMailbox(projects []string) (json.RawMessage, error) {
	var all []json.RawMessage
	if err := json.Unmarshal(h.Mailbox(), &all); err != nil {
		return nil, err
	}
	kept := []json.RawMessage{}
	for _, m := range all {
		if slices.Contains(projects, projectOf(m)) {
			kept = append(kept, m)
		}
	}
	return json.Marshal(kept)
}
