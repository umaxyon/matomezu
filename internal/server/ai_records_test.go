package server

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

// AI は、見せる種類（aiBrief のある対象）のレコードを、一覧（where で絞る）か 1 件で読める。見せない種類・無いレコードは 404
func TestAIReadsRecords(t *testing.T) {
	s := newServer(t, nil)
	ai := map[string]string{"Authorization": "Bearer secret"}
	const project, ticket = "@matomezu/taskboard:project", "@matomezu/taskboard:ticket"
	_, got := send(t, "GET", s.URL+"/api/ai/records?kind="+project, "", ai)
	var list struct {
		Records []struct{ ID, Brief string }
		Total   int
	}
	if err := json.Unmarshal([]byte(got), &list); err != nil || list.Total != 1 {
		t.Fatalf("projects = %s", got)
	}
	p := list.Records[0].ID
	for i, name := range []string{"first", "second"} {
		body := fmt.Sprintf(`{"action":"@matomezu/taskboard:ticket-add","args":{"project":%q,"name":%q},"lang":"ja","ids":["t%d"],"now":"2026-11-12T00:00:00.000Z"}`, p, name, i+1)
		if _, got := send(t, "POST", s.URL+"/api/perform", body, nil); !strings.Contains(got, `"ok":true`) {
			t.Fatalf("ticket-add = %s", got)
		}
	}
	// 並びは種類が決める（チケットは番号の順）
	_, got = send(t, "GET", s.URL+"/api/ai/records?kind="+ticket+"&where.project="+p, "", ai)
	if !strings.HasPrefix(got, `{"kind":"`+ticket+`","records":[{"brief":"1 first`) || !strings.Contains(got, `"total":2`) {
		t.Fatalf("tickets = %s", got)
	}
	if _, got = send(t, "GET", s.URL+"/api/ai/records?kind="+ticket+"&where.number=2", "", ai); !strings.Contains(got, `"total":1`) {
		t.Fatalf("where number = %s", got)
	}
	if _, got = send(t, "GET", s.URL+"/api/ai/records?kind="+ticket+"&where.project=nothing", "", ai); !strings.Contains(got, `"total":0`) {
		t.Fatalf("where nothing = %s", got)
	}
	if _, got = send(t, "GET", s.URL+"/api/ai/records?kind="+ticket+"&id=t1", "", ai); !strings.Contains(got, `"record":{`) || !strings.Contains(got, `"name":"first"`) {
		t.Fatalf("one ticket = %s", got)
	}
	for _, q := range []string{"kind=@matomezu/base:participant", "kind=nothing", "kind=" + ticket + "&id=nothing"} {
		if code, _ := send(t, "GET", s.URL+"/api/ai/records?"+q, "", ai); code != 404 {
			t.Fatalf("%s = %d", q, code)
		}
	}
	if code, _ := send(t, "GET", s.URL+"/api/ai/records", "", ai); code != 400 {
		t.Fatalf("no kind = %d", code)
	}
}

// 完了のチケット（プロジェクトの完了のレーンにあるチケット）は、既定の一覧に載せず、載せなかった数を添える。unlisted の include は全部、only は載せない物だけ。
// 載せない物の仕組みを持たない種類には include・only を渡せない。指す先のプロジェクトは置き場所から引く（1 回の一覧で、ホストのエンジンが）
func TestAIListLeavesOutCompletedTickets(t *testing.T) {
	s := newServer(t, nil)
	ai := map[string]string{"Authorization": "Bearer secret"}
	const project, ticket = "@matomezu/taskboard:project", "@matomezu/taskboard:ticket"
	_, got := send(t, "GET", s.URL+"/api/ai/records?kind="+project, "", ai)
	var list struct{ Records []struct{ ID string } }
	if err := json.Unmarshal([]byte(got), &list); err != nil || len(list.Records) != 1 {
		t.Fatalf("projects = %s", got)
	}
	p := list.Records[0].ID
	for i, name := range []string{"first", "second"} {
		body := fmt.Sprintf(`{"action":"@matomezu/taskboard:ticket-add","args":{"project":%q,"name":%q},"lang":"ja","ids":["t%d"],"now":"2026-11-12T00:00:00.000Z"}`, p, name, i+1)
		if _, got := send(t, "POST", s.URL+"/api/perform", body, nil); !strings.Contains(got, `"ok":true`) {
			t.Fatalf("ticket-add = %s", got)
		}
	}
	done := `{"action":"@matomezu/taskboard:ticket-complete","args":{},"on":{"record":"t1"},"lang":"ja","ids":["h1"],"now":"2026-11-12T00:00:00.000Z"}`
	if _, got := send(t, "POST", s.URL+"/api/perform", done, nil); !strings.Contains(got, `"ok":true`) {
		t.Fatalf("ticket-complete = %s", got)
	}
	query := "/api/ai/records?kind=" + ticket + "&where.project=" + p
	_, got = send(t, "GET", s.URL+query, "", ai)
	if !strings.Contains(got, `"total":1`) || !strings.Contains(got, `"unlisted":1`) || strings.Contains(got, "first") {
		t.Fatalf("default = %s", got)
	}
	_, got = send(t, "GET", s.URL+query+"&unlisted=include", "", ai)
	if !strings.Contains(got, `"total":2`) || strings.Contains(got, `"unlisted"`) {
		t.Fatalf("include = %s", got)
	}
	_, got = send(t, "GET", s.URL+query+"&unlisted=only", "", ai)
	if !strings.Contains(got, `"total":1`) || !strings.Contains(got, "first") || strings.Contains(got, "second") {
		t.Fatalf("only = %s", got)
	}
	for _, q := range []string{
		"kind=@matomezu/taskboard:current-ticket&unlisted=only", // 載せない物の無い種類
		"kind=" + ticket + "&id=t1&unlisted=include",            // id と一緒には渡せない
		"kind=" + ticket + "&unlisted=nothing",
	} {
		if code, _ := send(t, "GET", s.URL+"/api/ai/records?"+q, "", ai); code != 400 {
			t.Fatalf("%s = %d", q, code)
		}
	}
}
