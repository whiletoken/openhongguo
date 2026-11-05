package webserver

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
)

// handleStream serves the video stream file with byte-range support.
func (s *Server) handleStream(w http.ResponseWriter, r *http.Request) {
	episodeID := strings.TrimSpace(r.URL.Query().Get("episode_id"))
	quality := strings.TrimSpace(r.URL.Query().Get("quality"))
	seriesID := strings.TrimSpace(r.URL.Query().Get("series_id"))
	if episodeID == "" {
		http.Error(w, "missing episode_id", http.StatusBadRequest)
		return
	}

	if seriesID != "" {
		s.streamMgr.ActivateWindow(r.Context(), WindowPlayRequest{
			SeriesID:  seriesID,
			EpisodeID: episodeID,
			Quality:   quality,
		})
	}

	s.streamMgr.ServeStream(w, r, episodeID, quality)
}

// handleActiveCache notifies the active episode playback and updates the sliding cache window.
func (s *Server) handleActiveCache(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "POST required")
		return
	}
	var req WindowPlayRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.EpisodeID == "" {
		jsonError(w, http.StatusBadRequest, "episode_id is required")
		return
	}
	status := s.streamMgr.ActivateWindow(r.Context(), req)
	jsonResponse(w, http.StatusOK, status)
}

// handleCacheWindow returns the status of the sliding window cache.
func (s *Server) handleCacheWindow(w http.ResponseWriter, r *http.Request) {
	seriesID := strings.TrimSpace(r.URL.Query().Get("series_id"))
	quality := strings.TrimSpace(r.URL.Query().Get("quality"))
	status := s.streamMgr.GetWindowStatus(seriesID, quality)
	jsonResponse(w, http.StatusOK, status)
}

// handleDownload streams the decrypted mp4 as a file attachment download.
func (s *Server) handleDownload(w http.ResponseWriter, r *http.Request) {
	episodeID := strings.TrimSpace(r.URL.Query().Get("episode_id"))
	quality := strings.TrimSpace(r.URL.Query().Get("quality"))
	filename := strings.TrimSpace(r.URL.Query().Get("filename"))
	if episodeID == "" {
		http.Error(w, "missing episode_id", http.StatusBadRequest)
		return
	}
	if filename == "" {
		filename = fmt.Sprintf("episode_%s.mp4", episodeID)
	}
	if !strings.HasSuffix(filename, ".mp4") {
		filename += ".mp4"
	}

	target, err := s.streamMgr.EnsureCached(r.Context(), episodeID, quality)
	if err != nil {
		http.Error(w, fmt.Sprintf("Download prepare error: %v", err), http.StatusInternalServerError)
		return
	}

	file, err := os.Open(target)
	if err != nil {
		http.Error(w, "Cannot open cached file", http.StatusInternalServerError)
		return
	}
	defer file.Close()

	fi, _ := file.Stat()
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	if fi != nil {
		w.Header().Set("Content-Length", strconv.FormatInt(fi.Size(), 10))
	}
	_, _ = io.Copy(w, file)
}

// handleClearCache deletes all cached video streams from the cache directory.
func (s *Server) handleClearCache(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "POST required")
		return
	}
	if err := s.streamMgr.ClearCache(); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, map[string]bool{"cleared": true})
}
