// Package media owns the images staff upload: logos, product photos and section images. It keeps
// one row per file in the media table and the bytes behind the Storage interface, so the disk can
// later give way to an object store. It owns no collection.
package media

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"image"
	_ "image/jpeg" // Registers the JPEG decoder.
	_ "image/png"  // Registers the PNG decoder.
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"

	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
)

const (
	// MaxSize is the largest file an upload may carry.
	MaxSize = 5 << 20
	// maxPixels stops a small file that claims a huge canvas from exhausting memory on decode.
	maxPixels = 40_000_000
)

// extOf lists the accepted types by their sniffed MIME type. SVG is left out: it can carry script.
var extOf = map[string]string{"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}

var (
	tenantName = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)
	fileName   = regexp.MustCompile(`^med-[0-9a-z]+\.(png|jpg|webp)$`)
)

// Storage keeps the bytes of a file under a key such as "ten-lari/med-k3f9a1b2c3.png".
type Storage interface {
	Put(ctx context.Context, key string, r io.Reader, size int64, mime string) error
	// URL is where browsers load the file.
	URL(key string) string
}

// Disk stores files under Dir; PublicURL is where the web server serves Dir from.
type Disk struct {
	Dir       string
	PublicURL string
}

// Put writes the file to a temporary name first, so a reader never sees half of it.
func (d Disk) Put(_ context.Context, key string, r io.Reader, _ int64, _ string) error {
	path := filepath.Join(d.Dir, filepath.FromSlash(key))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".upload-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := io.Copy(tmp, r); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	// CreateTemp makes the file 0600; the web server serving /media/ runs as another user.
	if err := os.Chmod(tmp.Name(), 0o644); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}

// URL joins the public prefix and the key.
func (d Disk) URL(key string) string { return d.PublicURL + "/" + key }

// Open returns a stored file, or os.ErrNotExist for a name that is not one this package made.
func (d Disk) Open(tenantID, name string) (*os.File, error) {
	if !tenantName.MatchString(tenantID) || !fileName.MatchString(name) {
		return nil, os.ErrNotExist
	}
	return os.Open(filepath.Join(d.Dir, tenantID, name))
}

// Media records uploads and hands their bytes to Storage.
type Media struct {
	*kernel.Runtime
	Storage Storage
}

// MediaUpload is a stored image as the console sees it. The OpenAPI spec names its schema after
// this type, so it keeps the Media prefix.
type MediaUpload struct {
	ID     string `json:"id"`
	URL    string `json:"url"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
	Mime   string `json:"mime"`
	Size   int64  `json:"size"`
}

// Upload checks that data is a PNG, JPEG or WebP image and stores it for the tenant.
func (m *Media) Upload(ctx context.Context, meta kernel.Meta, tenantID string, data []byte) (MediaUpload, error) {
	if err := kernel.Access(meta, tenantID); err != nil {
		return MediaUpload{}, err
	}
	if !tenantName.MatchString(tenantID) {
		return MediaUpload{}, kernel.Invalid{Reason: "Choose a brand for the image."}
	}
	mime := http.DetectContentType(data)
	ext, ok := extOf[mime]
	if !ok {
		return MediaUpload{}, kernel.Invalid{Reason: "Upload a PNG, JPEG or WebP image. Other files, SVG included, are not accepted."}
	}
	width, height, err := dimensions(mime, data)
	if err != nil {
		return MediaUpload{}, kernel.Invalid{Reason: "The image could not be read. Save it again as PNG, JPEG or WebP and retry."}
	}
	up := MediaUpload{ID: ids.New("med"), Width: width, Height: height, Mime: mime, Size: int64(len(data))}
	key := tenantID + "/" + up.ID + "." + ext
	up.URL = m.Storage.URL(key)
	_, err = m.Run(ctx, func(t *kernel.Tx) error {
		if _, err := t.Exec(ctx, `insert into media (id, tenant_id, path, mime, size, width, height, created_by)
			values ($1, $2, $3, $4, $5, $6, $7, $8)`, up.ID, tenantID, key, mime, up.Size, width, height, meta.By()); err != nil {
			return err
		}
		return m.Storage.Put(ctx, key, bytes.NewReader(data), up.Size, mime)
	})
	return up, err
}

// dimensions reads the image size and, for PNG and JPEG, decodes the whole image to prove it is one.
// WebP is checked by its header only: the standard library has no WebP decoder.
func dimensions(mime string, data []byte) (int, int, error) {
	if mime == "image/webp" {
		return webpSize(data)
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return 0, 0, err
	}
	if cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width*cfg.Height > maxPixels {
		return 0, 0, errBadImage
	}
	if _, _, err := image.Decode(bytes.NewReader(data)); err != nil {
		return 0, 0, err
	}
	return cfg.Width, cfg.Height, nil
}

var errBadImage = errors.New("not a readable image")

// webpSize reads the canvas size from the first chunk of a WebP file: VP8X, VP8 or VP8L.
func webpSize(b []byte) (int, int, error) {
	if len(b) < 30 {
		return 0, 0, errBadImage
	}
	var w, h int
	switch string(b[12:16]) {
	case "VP8X":
		w = 1 + (int(b[24]) | int(b[25])<<8 | int(b[26])<<16)
		h = 1 + (int(b[27]) | int(b[28])<<8 | int(b[29])<<16)
	case "VP8 ":
		if b[23] != 0x9d || b[24] != 0x01 || b[25] != 0x2a {
			return 0, 0, errBadImage
		}
		w = int(binary.LittleEndian.Uint16(b[26:28]) & 0x3fff)
		h = int(binary.LittleEndian.Uint16(b[28:30]) & 0x3fff)
	case "VP8L":
		if b[20] != 0x2f {
			return 0, 0, errBadImage
		}
		bits := binary.LittleEndian.Uint32(b[21:25])
		w = 1 + int(bits&0x3fff)
		h = 1 + int(bits>>14&0x3fff)
	default:
		return 0, 0, errBadImage
	}
	if w <= 0 || h <= 0 || w*h > maxPixels {
		return 0, 0, errBadImage
	}
	return w, h, nil
}
