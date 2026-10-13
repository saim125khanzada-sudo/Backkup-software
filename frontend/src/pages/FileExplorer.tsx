import React, { useState, useEffect } from "react";
import apiClient from "../api/client";
import { User } from "../context/AuthContext";
import { FilePreviewModal } from "../components/FilePreviewModal";
import { VersionHistoryModal, VersionItem } from "../components/VersionHistoryModal";
import {
  FolderTree,
  Folder,
  FileText,
  Download,
  Eye,
  History,
  RotateCcw,
  Archive,
  ChevronRight,
  ShieldAlert,
  Search,
  Filter,
  RefreshCw,
  HardDrive,
  FileCheck
} from "lucide-react";

interface FileRecord {
  id: string;
  user_id: string;
  device_id?: string;
  relative_path: string;
  file_size: number;
  sha256_hash: string;
  mime_type?: string;
  current_version: number;
  is_deleted_locally: boolean;
  last_modified_client?: string;
  created_at: string;
  updated_at: string;
  versions?: VersionItem[];
}

interface FileExplorerProps {
  initialUser?: User | null;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({ initialUser }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(initialUser || null);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [includeDeleted, setIncludeDeleted] = useState(true);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  // Modals state
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null);
  const [historyFile, setHistoryFile] = useState<FileRecord | null>(null);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Fetch list of users for dropdown
  useEffect(() => {
    apiClient.get<User[]>("/admin/users").then((res) => {
      setUsers(res.data);
      if (!selectedUser && res.data.length > 0) {
        setSelectedUser(res.data[0]);
      }
    });
  }, []);

  // Update selectedUser if initialUser changes
  useEffect(() => {
    if (initialUser) {
      setSelectedUser(initialUser);
      setCurrentPath("");
    }
  }, [initialUser]);

  // Fetch files when selectedUser or includeDeleted changes
  const fetchFiles = async () => {
    if (!selectedUser) return;
    setLoading(true);
    try {
      const res = await apiClient.get<FileRecord[]>(`/admin/users/${selectedUser.id}/files`, {
        params: { include_deleted: includeDeleted },
      });
      setFiles(res.data);
    } catch (e) {
      console.error("Failed to fetch files", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [selectedUser, includeDeleted]);

  // Compute directory contents based on currentPath
  // relative_path e.g.: "Documents/Finance/2026/q1.xlsx"
  const getFolderContents = () => {
    const prefix = currentPath ? (currentPath.endsWith("/") ? currentPath : `${currentPath}/`) : "";

    const folderSet = new Set<string>();
    const directFiles: FileRecord[] = [];

    files.forEach((f) => {
      // Filter by search query if present
      if (search) {
        if (!f.relative_path.toLowerCase().includes(search.toLowerCase())) {
          return;
        }
      }

      if (search) {
        // Flat search mode: list all matching files directly
        directFiles.push(f);
        return;
      }

      if (f.relative_path.startsWith(prefix)) {
        const remaining = f.relative_path.slice(prefix.length);
        const slashIndex = remaining.indexOf("/");

        if (slashIndex !== -1) {
          // It's a subfolder
          const folderName = remaining.slice(0, slashIndex);
          folderSet.add(folderName);
        } else {
          // Direct file in this folder
          directFiles.push(f);
        }
      }
    });

    const folders = Array.from(folderSet).sort();
    return { folders, files: directFiles };
  };

  const { folders, files: folderFiles } = getFolderContents();

  // Export Zip Handler
  const handleExportZip = (folderPrefix?: string) => {
    if (!selectedUser) return;
    const token = localStorage.getItem("backup_auth_token");
    let url = `/api/v1/admin/users/${selectedUser.id}/export-zip?include_deleted=${includeDeleted}`;
    if (folderPrefix) {
      url += `&folder=${encodeURIComponent(folderPrefix)}`;
    }

    fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Export zip failed or empty folder");
        return res.blob();
      })
      .then((blob) => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        const zipName = folderPrefix
          ? `${folderPrefix.replace(/\//g, "_")}_backup.zip`
          : `all_files_${selectedUser.email.split("@")[0]}.zip`;
        link.download = zipName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      })
      .catch((err) => alert(err.message));
  };

  // Restore file
  const handleRestore = async (fileId: string) => {
    try {
      await apiClient.post(`/admin/files/${fileId}/restore`);
      fetchFiles();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to restore file");
    }
  };

  // Breadcrumbs navigation
  const breadcrumbParts = currentPath.split("/").filter(Boolean);

  return (
    <div className="space-y-6">
      {/* Header & User Switcher */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-800/90 border border-slate-700/80 p-5 rounded-2xl">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-sky-600 rounded-xl text-white shadow-md">
            <FolderTree className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Root Fleet File Explorer</h1>
            <p className="text-xs text-slate-400">
              Unrestricted IT superuser directory tree browsing, in-browser previews, and ZIP streaming.
            </p>
          </div>
        </div>

        {/* User Selector Dropdown */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-slate-400">Target Employee:</label>
          <select
            value={selectedUser?.id || ""}
            onChange={(e) => {
              const u = users.find((x) => x.id === e.target.value);
              setSelectedUser(u || null);
              setCurrentPath("");
            }}
            className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-sky-500 font-mono"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email} ({u.full_name || "Employee"})
              </option>
            ))}
          </select>
          <button
            onClick={fetchFiles}
            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 transition-colors"
            title="Refresh Files"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Control Bar: Breadcrumbs, Search, Deleted Toggle, ZIP Export */}
      <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Left: Breadcrumb Trail */}
        <div className="flex items-center space-x-1 text-sm overflow-x-auto py-1">
          <button
            onClick={() => {
              setCurrentPath("");
              setSearch("");
            }}
            className={`font-semibold hover:text-white transition-colors flex items-center space-x-1 ${
              currentPath === "" ? "text-sky-400" : "text-slate-400"
            }`}
          >
            <HardDrive className="h-4 w-4" />
            <span>Root</span>
          </button>

          {breadcrumbParts.map((part, index) => {
            const pathUpToHere = breadcrumbParts.slice(0, index + 1).join("/");
            const isLast = index === breadcrumbParts.length - 1;
            return (
              <React.Fragment key={index}>
                <ChevronRight className="h-4 w-4 text-slate-600 flex-shrink-0" />
                <button
                  onClick={() => {
                    setCurrentPath(pathUpToHere);
                    setSearch("");
                  }}
                  className={`hover:text-white transition-colors truncate max-w-xs ${
                    isLast ? "text-sky-400 font-semibold" : "text-slate-400"
                  }`}
                >
                  {part}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search box */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search file name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 w-44"
            />
          </div>

          {/* Toggle Deleted Retention */}
          <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-700">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-sky-600 h-3.5 w-3.5"
            />
            <span className="select-none flex items-center space-x-1">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
              <span>Show Locally Deleted Files</span>
            </span>
          </label>

          {/* Export ZIP Buttons */}
          <button
            onClick={() => handleExportZip(currentPath || undefined)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-semibold text-white transition-colors shadow-sm"
            title="Stream and zip all files on the fly"
          >
            <Archive className="h-3.5 w-3.5" />
            <span>{currentPath ? "Export Folder .ZIP" : "Export Fleet .ZIP"}</span>
          </button>
        </div>
      </div>

      {/* Directory Tree & File Table */}
      <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-700">
              <tr>
                <th className="px-6 py-3.5">Name / Relative Path</th>
                <th className="px-6 py-3.5">Size</th>
                <th className="px-6 py-3.5">Version</th>
                <th className="px-6 py-3.5">Retention Status</th>
                <th className="px-6 py-3.5">Last Sync Time</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {/* Back button if in subfolder */}
              {currentPath && !search && (
                <tr
                  onClick={() => {
                    const parts = currentPath.split("/").filter(Boolean);
                    parts.pop();
                    setCurrentPath(parts.join("/"));
                  }}
                  className="hover:bg-slate-750/60 cursor-pointer text-slate-400 transition-colors"
                >
                  <td colSpan={6} className="px-6 py-3 flex items-center space-x-2 font-mono text-xs text-sky-400">
                    <Folder className="h-4 w-4" />
                    <span>.. (Up one directory level)</span>
                  </td>
                </tr>
              )}

              {/* Subfolders */}
              {!search &&
                folders.map((folderName) => (
                  <tr
                    key={folderName}
                    onClick={() => {
                      const nextPath = currentPath ? `${currentPath}/${folderName}` : folderName;
                      setCurrentPath(nextPath);
                    }}
                    className="hover:bg-slate-750/60 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-3.5">
                      <div className="flex items-center space-x-3">
                        <Folder className="h-5 w-5 text-amber-400 fill-amber-400/20" />
                        <span className="font-medium text-white hover:text-sky-300">{folderName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-xs text-slate-500 font-mono">Directory</td>
                    <td className="px-6 py-3.5 text-xs text-slate-500">-</td>
                    <td className="px-6 py-3.5">
                      <span className="text-[11px] text-slate-400 font-mono">Folder Tree</span>
                    </td>
                    <td className="px-6 py-3.5 text-xs text-slate-500">-</td>
                    <td className="px-6 py-3.5 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const target = currentPath ? `${currentPath}/${folderName}` : folderName;
                          handleExportZip(target);
                        }}
                        className="px-2 py-1 bg-slate-750 hover:bg-slate-700 rounded text-xs text-slate-300 font-medium transition-colors"
                        title="Download Folder as .ZIP"
                      >
                        ZIP
                      </button>
                    </td>
                  </tr>
                ))}

              {/* Files */}
              {folderFiles.length === 0 && folders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-sm">
                    {search ? "No matching files found." : "This directory is empty."}
                  </td>
                </tr>
              ) : (
                folderFiles.map((f) => {
                  const filename = f.relative_path.split("/").pop() || f.relative_path;
                  return (
                    <tr
                      key={f.id}
                      className={`hover:bg-slate-750/50 transition-colors ${
                        f.is_deleted_locally ? "bg-red-950/20 text-slate-400" : ""
                      }`}
                    >
                      {/* Name / Relative path */}
                      <td className="px-6 py-3.5">
                        <div className="flex items-center space-x-3">
                          <FileText
                            className={`h-5 w-5 flex-shrink-0 ${
                              f.is_deleted_locally ? "text-amber-500/70" : "text-sky-400"
                            }`}
                          />
                          <div className="overflow-hidden">
                            <div
                              className={`font-medium truncate max-w-md ${
                                f.is_deleted_locally ? "line-through text-slate-400" : "text-white"
                              }`}
                              title={f.relative_path}
                            >
                              {filename}
                            </div>
                            {search && (
                              <div className="text-[11px] text-slate-500 font-mono truncate max-w-sm">
                                {f.relative_path}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* File Size */}
                      <td className="px-6 py-3.5 text-xs font-mono text-slate-300">{formatBytes(f.file_size)}</td>

                      {/* Version */}
                      <td className="px-6 py-3.5">
                        <button
                          onClick={() => setHistoryFile(f)}
                          className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-xs font-mono bg-slate-900 hover:bg-slate-700 border border-slate-700 text-sky-400 transition-colors"
                          title="View Version History"
                        >
                          <History className="h-3 w-3" />
                          <span>v{f.current_version}</span>
                        </button>
                      </td>

                      {/* Retention Status */}
                      <td className="px-6 py-3.5">
                        {f.is_deleted_locally ? (
                          <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-800">
                            <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0" />
                            <span>Deleted locally (Retained)</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
                            <FileCheck className="h-3.5 w-3.5 flex-shrink-0" />
                            <span>Active Sync</span>
                          </div>
                        )}
                      </td>

                      {/* Last Modified */}
                      <td className="px-6 py-3.5 text-xs text-slate-400 font-mono">
                        {f.last_modified_client
                          ? new Date(f.last_modified_client).toLocaleString()
                          : new Date(f.updated_at).toLocaleString()}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-3.5 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {/* Preview Button */}
                          <button
                            onClick={() => setPreviewFile(f)}
                            className="p-1.5 bg-slate-700/60 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg transition-colors"
                            title="Preview file in browser"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {/* Download Button */}
                          <button
                            onClick={() => {
                              const token = localStorage.getItem("backup_auth_token");
                              const downloadUrl = `/api/v1/admin/files/${f.id}/download`;
                              fetch(downloadUrl, {
                                headers: { Authorization: `Bearer ${token}` },
                              })
                                .then((res) => res.blob())
                                .then((blob) => {
                                  const link = document.createElement("a");
                                  link.href = URL.createObjectURL(blob);
                                  link.download = filename;
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                });
                            }}
                            className="p-1.5 bg-slate-700/60 hover:bg-sky-600 text-slate-200 hover:text-white rounded-lg transition-colors"
                            title="Download file"
                          >
                            <Download className="h-4 w-4" />
                          </button>

                          {/* Restore Button (if deleted locally) */}
                          {f.is_deleted_locally && (
                            <button
                              onClick={() => handleRestore(f.id)}
                              className="px-2 py-1 bg-amber-950/80 hover:bg-amber-900 border border-amber-800 text-amber-300 hover:text-white rounded-lg text-xs font-semibold flex items-center space-x-1 transition-colors"
                              title="Restore file retention status"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              <span>Restore</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* In-Browser File Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          fileName={previewFile.relative_path.split("/").pop() || previewFile.relative_path}
          fileId={previewFile.id}
          mimeType={previewFile.mime_type}
          fileSize={previewFile.file_size}
          isOpen={!!previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}

      {/* Version History Modal */}
      {historyFile && (
        <VersionHistoryModal
          fileName={historyFile.relative_path.split("/").pop() || historyFile.relative_path}
          fileId={historyFile.id}
          currentVersion={historyFile.current_version}
          versions={historyFile.versions || []}
          isOpen={!!historyFile}
          onClose={() => setHistoryFile(null)}
        />
      )}
    </div>
  );
};
