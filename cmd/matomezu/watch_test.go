package main

import (
	"bytes"
	"os"
	"strconv"
	"strings"
	"testing"
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
