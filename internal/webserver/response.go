package webserver

import (
	"encoding/json"
	"log"
	"net/http"
)

// jsonResponse writes JSON data with the given status code.
func jsonResponse(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

// jsonError writes a standardized JSON error message.
func jsonError(w http.ResponseWriter, status int, msg string) {
	if status >= 500 {
		log.Printf("[SERVER ERROR %d] %s", status, msg)
	}
	jsonResponse(w, status, map[string]string{"error": msg})
}
