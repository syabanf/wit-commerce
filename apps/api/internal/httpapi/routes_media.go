package httpapi

import (
	"net/http"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
)

// uploadPermissions may upload images: store.manage for logos and section images, product.manage
// for product photos.
var uploadPermissions = []string{"store.manage", "product.manage"}

// mediaRoutes registers image upload and, for development, serving the stored files. Production
// nginx serves /media/ from the same directory and never reaches the API for it.
func (s *Server) mediaRoutes(rt *router) {
	rt.table = append(rt.table, Route{
		Method: "POST", Path: prefix + "/media", Permission: uploadPermissions[0], Scope: auth.ScopeFor(uploadPermissions[0]),
		Summary: "Upload a PNG, JPEG or WebP image of at most 5 MB (store.manage or product.manage)",
	})
	// A seller without those permissions uploads only their own photo; uploadMedia checks that.
	rt.mux.HandleFunc("POST "+prefix+"/media", s.guarded(func(p auth.Principal) (bool, string) {
		if p.Kind == auth.KindAPIKey {
			return keyMayUpload(p)
		}
		return true, ""
	}, s.uploadMedia))
	rt.table = append(rt.table,
		Route{
			Method: "GET", Path: prefix + "/media", Permission: uploadPermissions[0], Scope: auth.ScopeFor(uploadPermissions[0]),
			Summary: "A brand's images, newest first, with where each is used (store.manage or product.manage)",
		},
		Route{
			Method: "DELETE", Path: prefix + "/media/{id}", Permission: uploadPermissions[0], Scope: auth.ScopeFor(uploadPermissions[0]),
			Summary: "Delete an image and its file; refused with where it is used while it still shows somewhere",
		})
	rt.mux.HandleFunc("GET "+prefix+"/media", s.uploader(s.listMedia))
	rt.mux.HandleFunc("DELETE "+prefix+"/media/{id}", s.uploader(s.deleteMedia))
	rt.mux.HandleFunc("GET /media/{tenant}/{file}", s.serveMedia)
}

// uploader lets in a person with any upload permission, or an API key with store:write or
// catalog:write. The library's list and delete use it.
func (s *Server) uploader(h http.HandlerFunc) http.HandlerFunc {
	return s.guarded(func(p auth.Principal) (bool, string) {
		if p.Kind == auth.KindAPIKey {
			return keyMayUpload(p)
		}
		for _, permission := range uploadPermissions {
			if auth.Can(p.Role, permission) {
				return true, ""
			}
		}
		return false, "Your role cannot upload images."
	}, h)
}

func keyMayUpload(p auth.Principal) (bool, string) {
	for _, permission := range uploadPermissions {
		if p.HasScope(auth.ScopeFor(permission)) {
			return true, ""
		}
	}
	return false, "This API key needs the scope store:write or catalog:write."
}
