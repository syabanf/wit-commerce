package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/events"
	"github.com/syabanf/wit-commerce/apps/api/internal/httpapi"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

type mediaEnv struct {
	*env
	root string
	dir  string
}

func setupMedia(t *testing.T) *mediaEnv {
	t.Helper()
	db := testdb.Open(t)
	if err := seed.Load(context.Background(), db, testdb.SeedDir(t), password); err != nil {
		t.Fatal(err)
	}
	signer, err := auth.NewSigner(strings.Repeat("s", 32), time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	srv := httptest.NewServer(httpapi.New(httpapi.Options{
		DB: db, Clock: clock.New(time.Now()), Signer: signer, Hub: events.New(),
		Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Version: "test", MediaDir: dir,
	}))
	t.Cleanup(srv.Close)
	e := &env{t: t, url: srv.URL + "/api/v1", db: db}
	e.admin = e.login("andi@lari.co.id")
	return &mediaEnv{env: e, root: srv.URL, dir: dir}
}

type uploaded struct {
	ID     string `json:"id"`
	URL    string `json:"url"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
	Mime   string `json:"mime"`
	Size   int64  `json:"size"`
}

// upload posts data as the multipart field file and returns the status and the answer.
func (e *mediaEnv) upload(token, tenantID string, data []byte) (int, uploaded) {
	e.t.Helper()
	var buf bytes.Buffer
	form := multipart.NewWriter(&buf)
	part, err := form.CreateFormFile("file", "image")
	if err != nil {
		e.t.Fatal(err)
	}
	_, _ = part.Write(data)
	_ = form.Close()
	req, _ := http.NewRequest("POST", e.url+"/media?tenantId="+tenantID, &buf)
	req.Header.Set("Content-Type", form.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer res.Body.Close()
	var out uploaded
	if res.StatusCode == http.StatusCreated {
		if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
			e.t.Fatal(err)
		}
	}
	return res.StatusCode, out
}

func picture(t *testing.T, format string, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	img.Set(1, 1, color.RGBA{R: 200, A: 255})
	var buf bytes.Buffer
	var err error
	if format == "png" {
		err = png.Encode(&buf, img)
	} else {
		err = jpeg.Encode(&buf, img, nil)
	}
	if err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestUploadStoresAndServesImages(t *testing.T) {
	e := setupMedia(t)
	for _, c := range []struct {
		format, mime, ext string
		token             string
	}{
		{"png", "image/png", ".png", e.admin},
		// Operations staff hold product.manage, for product photos.
		{"jpeg", "image/jpeg", ".jpg", e.login("budi@lari.co.id")},
	} {
		data := picture(t, c.format, 12, 8)
		code, up := e.upload(c.token, "ten-lari", data)
		if code != http.StatusCreated {
			t.Fatalf("%s: got %d", c.format, code)
		}
		if up.Mime != c.mime || up.Width != 12 || up.Height != 8 || up.Size != int64(len(data)) {
			t.Errorf("%s: %+v", c.format, up)
		}
		if want := "/media/ten-lari/" + up.ID + c.ext; up.URL != want {
			t.Errorf("url %q, want %q", up.URL, want)
		}
		onDisk, err := os.ReadFile(filepath.Join(e.dir, "ten-lari", up.ID+c.ext))
		if err != nil || !bytes.Equal(onDisk, data) {
			t.Fatalf("%s on disk: %v", c.format, err)
		}
		res, err := http.Get(e.root + up.URL)
		if err != nil {
			t.Fatal(err)
		}
		served, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if res.StatusCode != 200 || !bytes.Equal(served, data) || res.Header.Get("Content-Type") != c.mime ||
			res.Header.Get("X-Content-Type-Options") != "nosniff" || !strings.Contains(res.Header.Get("Cache-Control"), "max-age") {
			t.Errorf("%s served: %d %v", c.format, res.StatusCode, res.Header)
		}
	}
	var rows int
	if err := e.db.Pool.QueryRow(context.Background(), `select count(*) from media where tenant_id = 'ten-lari'`).Scan(&rows); err != nil || rows != 2 {
		t.Errorf("media rows: %d %v", rows, err)
	}
}

func TestUploadRefusesOtherFiles(t *testing.T) {
	e := setupMedia(t)
	svg := []byte(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`)
	for name, data := range map[string][]byte{
		"svg":  svg,
		"text": []byte("just some words"),
		// A PNG signature followed by garbage passes the sniff but not the decoder.
		"broken png": append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{1}, 64)...),
	} {
		if code, _ := e.upload(e.admin, "ten-lari", data); code != http.StatusUnprocessableEntity {
			t.Errorf("%s: got %d, want 422", name, code)
		}
	}
	big := append(picture(t, "png", 4, 4), make([]byte, 5<<20)...)
	if code, _ := e.upload(e.admin, "ten-lari", big); code != http.StatusRequestEntityTooLarge {
		t.Errorf("over 5 MB: got %d, want 413", code)
	}
	small := picture(t, "png", 4, 4)
	// andi manages ten-lari and ten-aruna, not ten-teknika.
	if code, _ := e.upload(e.admin, "ten-teknika", small); code != http.StatusForbidden {
		t.Errorf("other tenant: got %d, want 403", code)
	}
	// Service staff can neither manage the store nor products.
	if code, _ := e.upload(e.login("sari@lari.co.id"), "ten-lari", small); code != http.StatusForbidden {
		t.Errorf("service role: got %d, want 403", code)
	}
	if code, _ := e.upload("", "ten-lari", small); code != http.StatusUnauthorized {
		t.Errorf("no token: got %d, want 401", code)
	}
	entries, _ := os.ReadDir(e.dir)
	if len(entries) != 0 {
		t.Errorf("refused uploads left %d entries on disk", len(entries))
	}
}

func TestServeMediaRefusesOtherPaths(t *testing.T) {
	e := setupMedia(t)
	if err := os.WriteFile(filepath.Join(filepath.Dir(e.dir), "secret.png"), []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{
		"/media/ten-lari/..%2Fsecret.png",
		"/media/..%2F..%2Fsecret.png/x.png",
		"/media/ten-lari/notes.txt",
		"/media/ten-lari/med-abc.svg",
		"/media/ten-lari/med-doesnotexist.png",
	} {
		res, err := http.Get(e.root + path)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != http.StatusNotFound {
			t.Errorf("%s: got %d, want 404", path, res.StatusCode)
		}
	}
}
