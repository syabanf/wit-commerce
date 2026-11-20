package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"slices"
	"strconv"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/media"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
)

// uploadMedia stores the multipart field "file" for ?tenantId= and answers with its URL.
func (s *Server) uploadMedia(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenantId")
	s.storeUpload(w, r, tenantID, s.meta(r), func() (bool, error) { return s.mayUpload(r, tenantID) })
}

// storeUpload reads the multipart field "file", checks the caller may upload with allowed, and stores
// the image for tenantID within the brand's media room.
func (s *Server) storeUpload(w http.ResponseWriter, r *http.Request, tenantID string, m service.Meta, allowed func() (bool, error)) {
	// The form's boundaries and headers need a little room beyond the file itself.
	r.Body = http.MaxBytesReader(w, r.Body, media.MaxSize+64<<10)
	file, header, err := r.FormFile("file")
	var tooLarge *http.MaxBytesError
	switch {
	case errors.As(err, &tooLarge):
		writeProblem(w, http.StatusRequestEntityTooLarge, "TOO_LARGE", "The image is larger than 5 MB.")
		return
	case err != nil:
		writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "Send the image as multipart/form-data in the field file.")
		return
	}
	defer file.Close()
	if ok, err := allowed(); err != nil {
		s.writeError(w, r, err)
		return
	} else if !ok {
		writeProblem(w, http.StatusForbidden, "FORBIDDEN", "Your role cannot upload images.")
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, media.MaxSize+1))
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if len(data) > media.MaxSize {
		writeProblem(w, http.StatusRequestEntityTooLarge, "TOO_LARGE", "The image is larger than 5 MB.")
		return
	}
	// Only a brand the person may upload for is measured; Upload refuses the rest itself.
	if m.P.CanAccess(tenantID) {
		used, err := s.media.Used(r.Context(), tenantID)
		if err == nil {
			err = s.svc.MediaRoom(r.Context(), tenantID, used, int64(len(data)))
		}
		if err != nil {
			s.writeError(w, r, err)
			return
		}
	}
	up, err := s.media.Upload(r.Context(), m, tenantID, header.Filename, data)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, up)
}

// mayUpload lets in a person with an upload permission, or an API key, which the route has already
// checked. Anyone else uploads only the photo of their own seller profile in the brand
// (?purpose=seller-photo).
func (s *Server) mayUpload(r *http.Request, tenantID string) (bool, error) {
	p, _ := auth.From(r.Context())
	if p.Kind == auth.KindAPIKey || slices.ContainsFunc(uploadPermissions, func(permission string) bool { return auth.Can(p.Role, permission) }) {
		return true, nil
	}
	if r.URL.Query().Get("purpose") != "seller-photo" {
		return false, nil
	}
	var own bool
	err := s.DB.Pool.QueryRow(r.Context(), `select exists (select 1 from sellers where user_id = $1 and tenant_id = $2)`, p.ID, tenantID).Scan(&own)
	return own, err
}

// listMedia answers with a page of ?tenantId='s images, newest first, and where each is used.
func (s *Server) listMedia(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))
	list, err := s.media.List(r.Context(), s.meta(r), q.Get("tenantId"), q.Get("q"), limit, offset)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// mediaInUse is the 409 a delete gets while the image still shows somewhere.
type mediaInUse struct {
	Problem
	Uses []media.Use `json:"uses"`
}

// deleteMedia removes an image of ?tenantId= and its file, or says where it is still used.
func (s *Server) deleteMedia(w http.ResponseWriter, r *http.Request) {
	err := s.media.Delete(r.Context(), s.meta(r), r.URL.Query().Get("tenantId"), r.PathValue("id"))
	var inUse media.InUse
	switch {
	case errors.As(err, &inUse):
		w.Header().Set("Content-Type", "application/problem+json; charset=utf-8")
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(mediaInUse{
			Problem: Problem{Type: "about:blank", Title: http.StatusText(http.StatusConflict), Status: http.StatusConflict, Detail: inUse.Error(), Code: "IN_USE"},
			Uses:    inUse.Uses,
		})
	case err != nil:
		s.writeError(w, r, err)
	default:
		writeJSON(w, http.StatusOK, okResponse{Ok: true})
	}
}

// serveMedia serves an uploaded file in development. Names this API did not make are not found,
// which also keeps a path from leaving the media directory.
func (s *Server) serveMedia(w http.ResponseWriter, r *http.Request) {
	f, err := s.mediaDisk.Open(r.PathValue("tenant"), r.PathValue("file"))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	http.ServeContent(w, r, info.Name(), info.ModTime(), f)
}
