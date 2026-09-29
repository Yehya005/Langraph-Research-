import { useState } from "react";
import { useSession } from "./session.jsx";

/** Upload a PDF with real states: uploading (bytes in flight) -> processing (extraction, metadata,
 *  Judge evaluation on the server) -> ready | failed. */
export function useUpload() {
  const { view, actions } = useSession();
  const [status, setStatus] = useState(null); // {name, phase, progress, paperId, error}

  const upload = (file) => new Promise((resolve) => {
    if (!file) return resolve(null);
    if (file.type && file.type !== "application/pdf") {
      setStatus({ name: file.name, phase: "failed", error: "Only PDF files can be uploaded." });
      return resolve(null);
    }
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    setStatus({ name: file.name, phase: "uploading", progress: 0 });
    xhr.upload.onprogress = (e) => e.lengthComputable && setStatus((s) => ({ ...s, progress: e.loaded / e.total }));
    xhr.upload.onload = () => setStatus((s) => ({ ...s, phase: "processing" }));
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* keep empty */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        setStatus({ name: file.name, phase: "ready", paperId: body.paper_id });
        actions.reload();
        resolve(body.paper_id);
      } else {
        console.error("[upload] failed", xhr.status, body);
        setStatus({ name: file.name, phase: "failed", error: body.detail || `Upload failed (${xhr.status})` });
        resolve(null);
      }
    };
    xhr.onerror = () => { setStatus({ name: file.name, phase: "failed", error: "The server could not be reached." }); resolve(null); };
    xhr.open("POST", `/api/sessions/${view.thread_id}/papers/upload`);
    xhr.send(form);
  });

  return { status, upload, clear: () => setStatus(null) };
}
