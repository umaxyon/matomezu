package main

import (
	"bytes"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

// watch は SSE の wake の知らせの文だけを 1 行ずつ書き、ほかの知らせ（keep）は書かない
func TestReadWakesPrintsOnlyWakeLines(t *testing.T) {
	in := "event: keep\ndata: {}\n\nevent: wake\ndata: {\"text\":\"matomezu: the user accepted\"}\n\nevent: wake\ndata: {\"text\":\"\"}\n\n"
	var out bytes.Buffer
	if err := readWakes(strings.NewReader(in), &out, func() bool { return true }); err != nil {
		t.Fatal(err)
	}
	if out.String() != "matomezu: the user accepted\n" {
		t.Fatalf("out = %q", out.String())
	}
}

// プロセス id のプロセスが居なければ、読むのをやめる。居るプロセス（自分）と、数でない id は居るとみなす
func TestProcessAliveAndReadWakesStops(t *testing.T) {
	if !processAlive(strconv.Itoa(os.Getpid())) || !processAlive("x") || processAlive("999999999") {
		t.Fatal("processAlive")
	}
	var out bytes.Buffer
	if err := readWakes(strings.NewReader("event: wake\ndata: {\"text\":\"a\"}\n\n"), &out, func() bool { return false }); err != nil || out.Len() != 0 {
		t.Fatalf("out = %q", out.String())
	}
}

// 受け取る側の流し方は、名乗った物だけを常駐の口に渡す
func TestWatchQueryCarriesTheLimits(t *testing.T) {
	c := watchCmd{Host: "42", Session: "S", MaxLine: 480, MaxNotice: 2800, Gap: time.Second}
	if got := c.query(); got != "gap=1000&host=42&maxLine=480&maxNotice=2800&session=S" {
		t.Fatalf("query = %s", got)
	}
	if got := (&watchCmd{Host: "42"}).query(); got != "host=42&session=" {
		t.Fatalf("query = %s", got)
	}
}
