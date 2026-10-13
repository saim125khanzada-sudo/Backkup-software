import React, { useState, useEffect } from "react";
import { X, Download, Eye, FileText, Image as ImageIcon, FileCode, AlertCircle, Table } from "lucide-react";

interface FilePreviewModalProps {
  fileName: string;
  fileId: string;
  mimeType?: string;
  fileSize: number;
  isOpen: boolean;
  onClose: () => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  fileName,
  fileId,
  mimeType = "",
  fileSize,
  isOpen,
  onClose,
}) => {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [csvRows, setCsvRows] = useState<string[][] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const isImage = ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext) || mimeType.startsWith("image/");
  const isPdf = ext === "pdf" || mimeType === "application/pdf";
  const isVideo = ["mp4", "webm", "ogg"].includes(ext) || mimeType.startsWith("video/");
  const isAudio = ["mp3", "wav", "m4a", "aac"].includes(ext) || mimeType.startsWith("audio/");
  const isCsv = ["csv", "tsv"].includes(ext) || mimeType.includes("csv");
  const isText =
    isCsv ||
    ["txt", "log", "json", "yaml", "yml", "md", "py", "js", "ts", "tsx", "jsx", "html", "css", "sh", "bat", "sql", "xml", "conf", "env"].includes(ext) ||
    mimeType.startsWith("text/") ||
    mimeType.includes("json");

  const previewUrl = `/api/v1/admin/files/${fileId}/preview`;
  const token = localStorage.getItem("backup_auth_token");

  useEffect(() => {
    if (isText && !isPdf && !isImage && !isVideo && !isAudio) {
      setLoading(true);
      setError(null);
      fetch(previewUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (!res.ok) throw new Error("Could not load preview stream");
          return res.text();
        })
        .then((data) => {
          setTextContent(data);
          if (isCsv) {
            const lines = data.split("\n").filter((l) => l.trim().length > 0);
            const parsed = lines.slice(0, 200).map((line) => {
              // Basic CSV line split
              return line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
            });
            setCsvRows(parsed);
          }
        })
        .catch((err) => {
          setError(err.message || "Failed to load text preview");
        })
        .finally(() => setLoading(false));
    }
  }, [fileId, isText, isCsv]);

  const handleDownload = () => {
    const downloadUrl = `/api/v1/admin/files/${fileId}/download`;
    fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-850 border border-slate-700 rounded-xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col h-[88vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-slate-800">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="p-2 bg-slate-700 rounded-lg text-sky-400">
              {isImage ? <ImageIcon className="h-5 w-5" /> : isText ? <FileCode className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
            </div>
            <div className="overflow-hidden">
              <h3 className="text-white font-semibold truncate text-sm sm:text-base">{fileName}</h3>
              <p className="text-xs text-slate-400 flex items-center space-x-2">
                <span>{formatBytes(fileSize)}</span>
                <span>•</span>
                <span className="font-mono">{mimeType || ext.toUpperCase()}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 rounded-lg text-xs font-semibold text-white flex items-center space-x-1.5 transition-colors"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Download</span>
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Content Body */}
        <div className="flex-1 overflow-auto p-4 bg-slate-900/90 flex items-center justify-center">
          {isImage ? (
            <div className="max-h-full max-w-full flex items-center justify-center p-4">
              <img
                src={previewUrl}
                alt={fileName}
                className="max-h-[70vh] max-w-full object-contain rounded-lg border border-slate-700 shadow-lg"
              />
            </div>
          ) : isPdf ? (
            <iframe
              src={previewUrl}
              title={fileName}
              className="w-full h-full rounded-lg border border-slate-700 bg-white"
            />
          ) : isVideo ? (
            <div className="max-h-full max-w-full flex items-center justify-center p-4">
              <video controls className="max-h-[70vh] max-w-full rounded-lg border border-slate-700">
                <source src={previewUrl} type={mimeType || "video/mp4"} />
                Your browser does not support the video tag.
              </video>
            </div>
          ) : isAudio ? (
            <div className="p-8 text-center bg-slate-800 rounded-xl border border-slate-700">
              <audio controls className="w-full min-w-[320px]">
                <source src={previewUrl} type={mimeType || "audio/mpeg"} />
                Your browser does not support audio element.
              </audio>
            </div>
          ) : isCsv && csvRows ? (
            <div className="w-full h-full overflow-auto rounded-lg border border-slate-700 bg-slate-950">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-slate-200 border-b border-slate-700 sticky top-0">
                    {csvRows[0]?.map((col, idx) => (
                      <th key={idx} className="p-2 border-r border-slate-700 font-semibold truncate">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvRows.slice(1).map((row, rIdx) => (
                    <tr key={rIdx} className="border-b border-slate-800/80 hover:bg-slate-900/60 font-mono text-slate-300">
                      {row.map((val, cIdx) => (
                        <td key={cIdx} className="p-2 border-r border-slate-800/80 truncate max-w-xs">
                          {val}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : isText ? (
            loading ? (
              <div className="text-slate-400 text-sm animate-pulse">Loading file stream...</div>
            ) : error ? (
              <div className="text-red-400 text-sm flex items-center space-x-2">
                <AlertCircle className="h-5 w-5" />
                <span>{error}</span>
              </div>
            ) : (
              <pre className="w-full h-full p-4 bg-slate-950 text-slate-200 font-mono text-xs overflow-auto rounded-lg border border-slate-800 whitespace-pre-wrap select-text">
                {textContent}
              </pre>
            )
          ) : (
            <div className="text-center p-8 space-y-4 max-w-md">
              <div className="h-16 w-16 mx-auto bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-700">
                <FileText className="h-8 w-8" />
              </div>
              <h4 className="text-base font-medium text-white">Direct in-browser preview unavailable</h4>
              <p className="text-xs text-slate-400">
                This binary file type cannot be rendered inline in the web browser. You can securely download and inspect it locally.
              </p>
              <button
                onClick={handleDownload}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg text-sm font-semibold text-white inline-flex items-center space-x-2 transition-colors"
              >
                <Download className="h-4 w-4" />
                <span>Download File</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
