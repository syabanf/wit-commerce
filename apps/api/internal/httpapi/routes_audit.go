package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/service"
)

// auditRoutes registers the audit log and the product CSV import and export. The audit log has no
// write route: rows come only from the actions themselves.
func (s *Server) auditRoutes(rt *router) {
	rt.add("GET", "/audit-log", "", "user.manage", "Page through a brand's audit log, newest first", s.auditLog)
	rt.add("GET", "/audit-log/export.csv", "", "user.manage", "The filtered audit log as CSV", s.auditExport)
	rt.add("GET", "/products/export.csv", "", "product.manage", "A brand's products as CSV, one row per variant", s.exportProducts)
	rt.add("GET", "/products/import-template.csv", "", "product.manage", "The product CSV template", s.productTemplate)
	rt.add("POST", "/product-imports", "", "product.manage", "Check a product CSV row by row and store it for apply; nothing changes yet", s.planProductImport)
	rt.add("GET", "/product-imports/{id}", "", "product.manage", "Read a product import's plan and progress", s.productImport)
	rt.add("POST", "/product-imports/{id}/apply", "", "product.manage", "Apply the next batch of a product import in one transaction", s.applyProductImport)
}

func (s *Server) exportProducts(w http.ResponseWriter, r *http.Request) {
	tenantID, err := readTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	f := service.ProductExportFilter{Status: trimmed(r, "status"), CategoryID: trimmed(r, "categoryId"), Query: trimmed(r, "q")}
	if v := trimmed(r, "ids"); v != "" {
		f.IDs = strings.Split(v, ",")
	}
	var b bytes.Buffer
	if err := s.svc.ExportProducts(r.Context(), s.meta(r), tenantID, f, service.CSVDelimiter(trimmed(r, "delimiter")), &b); err != nil {
		s.writeError(w, r, err)
		return
	}
	writeCSV(w, "products-"+tenantID+".csv", b.Bytes())
}

func (s *Server) productTemplate(w http.ResponseWriter, r *http.Request) {
	writeCSV(w, "product-import-template.csv", service.ProductCSVTemplate(service.CSVDelimiter(trimmed(r, "delimiter"))))
}

func writeCSV(w http.ResponseWriter, name string, body []byte) {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	_, _ = w.Write(body)
}

// productImportBody bounds the dry run's JSON body: the 5 MB file plus room for its escaping.
const productImportBody = 2*service.ImportMaxBytes + 64<<10

func (s *Server) planProductImport(w http.ResponseWriter, r *http.Request) {
	var in service.ProductImportInput
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, productImportBody)).Decode(&in); err != nil {
		s.writeError(w, r, service.Invalid{Reason: "Send the file as JSON, at most 5 MB of CSV: " + err.Error()})
		return
	}
	out, err := s.svc.PlanProductImport(r.Context(), s.meta(r), in)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) productImport(w http.ResponseWriter, r *http.Request) {
	out, err := s.svc.ProductImportStatus(r.Context(), s.meta(r), r.PathValue("id"))
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// productImportApply is the apply body: batch is how many products this call takes, 100 at most.
type productImportApply struct {
	Batch int `json:"batch"`
}

func (s *Server) applyProductImport(w http.ResponseWriter, r *http.Request) {
	var in productImportApply
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	out, d, err := s.svc.ApplyProductImport(r.Context(), s.meta(r), r.PathValue("id"), in.Batch)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if d != nil && !d.Empty() {
		s.publish(d)
	}
	writeJSON(w, http.StatusOK, out)
}
