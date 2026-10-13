import React from "react";
import { X, History, Download, Hash, Calendar, FileText } from "lucide-react";

export interface VersionItem {
  id: string;
  version_number: number;
  file_size: number;
  sha256_hash: string;
  created_at: string;
}

interface VersionHistoryModalProps {
  fileName: string;
  fileId: string;
  currentVersion: number;
  versions: VersionItem[];
  isOpen: boolean;
  onClose: () => void;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  fileName,
  fileId,
  currentVersion,
  versions,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const downloadVersion = (verNum?: number) => {
    const token = localStorage.getItem("backup_auth_token");
    const verParam = verNum ? `?version=${verNum}` : "";
    const url = `/api/v1/admin/files/${fileId}/download${verParam}`;
    // Fetch with authorization
    fetch(url, {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-slate-850">
          <div className="flex items-center space-x-2 text-white font-semibold">
            <History className="h-5 w-5 text-sky-400" />
            <span className="truncate">Version History: {fileName}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          <div className="p-4 bg-sky-950/40 border border-sky-800/80 rounded-xl flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 bg-sky-500 text-slate-900 font-bold text-xs rounded-full">
                  v{currentVersion} (Latest)
                </span>
                <span className="text-sm font-medium text-white">{fileName}</span>
              </div>
              <p className="text-xs text-sky-300 mt-1">Current live snapshot on client & server</p>
            </div>
            <button
              onClick={() => downloadVersion()}
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 rounded-lg text-xs font-semibold text-white flex items-center space-x-1.5 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download</span>
            </button>
          </div>

          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider pt-2">
            Historical Snapshots ({versions.length})
          </h4>

          {versions.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No older versions recorded yet. As the file changes on the client, immutable snapshots will be preserved here.
            </div>
          ) : (
            <div className="space-y-2">
              {versions.map((ver) => (
                <div
                  key={ver.id}
                  className="p-3 bg-slate-900/60 border border-slate-700/80 rounded-lg flex items-center justify-between hover:border-slate-600 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono font-semibold px-2 py-0.5 bg-slate-800 text-slate-300 rounded border border-slate-700">
                        Version {ver.version_number}
                      </span>
                      <span className="text-xs text-slate-400">{formatBytes(ver.file_size)}</span>
                    </div>
                    <div className="flex items-center space-x-4 text-xs text-slate-400 font-mono">
                      <span className="flex items-center space-x-1">
                        <Calendar className="h-3 w-3 text-slate-500" />
                        <span>{new Date(ver.created_at).toLocaleString()}</span>
                      </span>
                      <span className="flex items-center space-x-1 truncate max-w-xs" title={ver.sha256_hash}>
                        <Hash className="h-3 w-3 text-slate-500" />
                        <span>{ver.sha256_hash.slice(0, 16)}...</span>
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => downloadVersion(ver.version_number)}
                    className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-sky-500 text-slate-300 hover:text-white rounded-lg text-xs font-medium transition-colors flex items-center space-x-1"
                    title={`Download Version ${ver.version_number}`}
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
