package main

import (
	"strconv"
	"strings"
)

// versionLess は、版 a が b より古いか（semver の順: 数の 3 つ、同じなら - の後ろ（プレリリース）が無い方が新しく、ある物どうしは . で区切った並びを数は数として比べる）。形の崩れた物は文字列で比べる
func versionLess(a, b string) bool {
	ac, ap, aok := splitVersion(a)
	bc, bp, bok := splitVersion(b)
	if !aok || !bok {
		return a < b
	}
	for i := range 3 {
		if ac[i] != bc[i] {
			return ac[i] < bc[i]
		}
	}
	switch {
	case ap == bp:
		return false
	case ap == "":
		return false
	case bp == "":
		return true
	}
	as, bs := strings.Split(ap, "."), strings.Split(bp, ".")
	for i := 0; i < len(as) && i < len(bs); i++ {
		if as[i] == bs[i] {
			continue
		}
		an, aerr := strconv.Atoi(as[i])
		bn, berr := strconv.Atoi(bs[i])
		switch {
		case aerr == nil && berr == nil:
			return an < bn
		case aerr == nil:
			return true
		case berr == nil:
			return false
		}
		return as[i] < bs[i]
	}
	return len(as) < len(bs)
}

// splitVersion は、版を数の 3 つとプレリリースに分ける（+ の後ろのビルドの印は捨てる）
func splitVersion(v string) ([3]int, string, bool) {
	var core [3]int
	v, _, _ = strings.Cut(v, "+")
	main, pre, _ := strings.Cut(v, "-")
	parts := strings.Split(main, ".")
	if len(parts) != 3 {
		return core, "", false
	}
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil {
			return core, "", false
		}
		core[i] = n
	}
	return core, pre, true
}
