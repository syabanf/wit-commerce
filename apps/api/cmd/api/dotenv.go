package main

import (
	"bufio"
	"os"
	"strings"
)

// loadDotEnv fills unset variables from a local file, so development keys stay out of launch configs.
// A real environment always wins, and a missing file is fine.
func loadDotEnv(path string) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()
	lines := bufio.NewScanner(file)
	for lines.Scan() {
		line := strings.TrimSpace(lines.Text())
		key, value, ok := strings.Cut(line, "=")
		if !ok || strings.HasPrefix(line, "#") {
			continue
		}
		if _, set := os.LookupEnv(key); !set {
			_ = os.Setenv(key, value)
		}
	}
}
