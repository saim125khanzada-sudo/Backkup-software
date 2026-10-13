import React, { useState, useEffect } from "react";
import apiClient from "../api/client";
import { User } from "../context/AuthContext";
import {
  Users,
  Search,
  UserPlus,
  FileUp,
  FolderTree,
  MoreVertical,
  Shield,
  Laptop,
  HardDrive,
  RefreshCw,
  Edit2,
  UserX,
  CheckCircle2,
  XCircle
} from "lucide-react";

interface UsersManagerProps {
  onInspectFiles: (user: User) => void;
  onOpenCreateUser: () => void;
  onOpenBatchCsv: () => void;
  onOpenEditUser: (user: User) => void;
}

export const UsersManager: React.FC<UsersManagerProps> = ({
  onInspectFiles,
  onOpenCreateUser,
  onOpenBatchCsv,
  onOpenEditUser,
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<User[]>("/admin/users", {
        params: { search: search.trim() || undefined },
      });
      setUsers(res.data);
    } catch (e) {
      console.error("Failed to load users", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [search]);

  const handleDeactivate = async (u: User) => {
    if (!window.confirm(`Are you sure you want to suspend sync for ${u.email}? All existing backup files will remain permanently safe on the server.`)) {
      return;
    }
    try {
      await apiClient.delete(`/admin/users/${u.id}`);
      fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to deactivate user");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
            <Users className="h-6 w-6 text-sky-400" />
            <span>Fleet User Directory</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage provisioned endpoint user accounts, disk quotas, connected laptops, and master storage.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchUsers}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 hover:text-white border border-slate-700 transition-colors"
            title="Refresh Users"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={onOpenBatchCsv}
            className="flex items-center space-x-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm font-semibold text-slate-200 transition-all"
          >
            <FileUp className="h-4 w-4 text-sky-400" />
            <span>Bulk CSV Import</span>
          </button>
          <button
            onClick={onOpenCreateUser}
            className="flex items-center space-x-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 rounded-xl text-sm font-semibold text-white shadow-lg shadow-sky-600/20 transition-all"
          >
            <UserPlus className="h-4 w-4" />
            <span>Provision User</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl p-4 flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search users by email or full name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>
        <div className="text-xs text-slate-400 font-medium">
          Showing <span className="text-white font-semibold">{users.length}</span> provisioned accounts
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-700">
              <tr>
                <th className="px-6 py-3.5">User / Email</th>
                <th className="px-6 py-3.5">Storage Quota & Utilization</th>
                <th className="px-6 py-3.5">Devices</th>
                <th className="px-6 py-3.5">Catalog Files</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    Loading users...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    No users found matching search criteria.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const usedPct = Math.min(100, Math.round((u.used_bytes / (u.quota_bytes || 1)) * 100));
                  return (
                    <tr key={u.id} className="hover:bg-slate-750/50 transition-colors">
                      {/* User Info */}
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <div className="h-9 w-9 rounded-lg bg-slate-700 flex items-center justify-center font-bold text-sky-400 text-sm">
                            {u.full_name ? u.full_name[0].toUpperCase() : u.email[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-white flex items-center gap-1.5">
                              <span>{u.full_name || u.email}</span>
                              {u.is_admin && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-950 text-sky-400 border border-sky-800">
                                  Admin
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 font-mono">{u.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Quota Progress */}
                      <td className="px-6 py-4">
                        <div className="w-48 space-y-1.5">
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-slate-300">{formatBytes(u.used_bytes)}</span>
                            <span className="text-slate-500">{formatBytes(u.quota_bytes)}</span>
                          </div>
                          <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                usedPct > 90 ? "bg-red-500" : usedPct > 70 ? "bg-amber-500" : "bg-sky-500"
                              }`}
                              style={{ width: `${usedPct}%` }}
                            />
                          </div>
                          <div className="text-[10px] text-right text-slate-400 font-mono">{usedPct}% used</div>
                        </div>
                      </td>

                      {/* Devices */}
                      <td className="px-6 py-4 text-slate-300">
                        <div className="flex items-center space-x-1.5">
                          <Laptop className="h-4 w-4 text-slate-400" />
                          <span className="font-semibold">{u.device_count || 0}</span>
                          <span className="text-xs text-slate-500">laptops</span>
                        </div>
                      </td>

                      {/* Files */}
                      <td className="px-6 py-4 text-slate-300">
                        <div className="flex items-center space-x-1.5">
                          <HardDrive className="h-4 w-4 text-slate-400" />
                          <span className="font-semibold">{u.file_count || 0}</span>
                          <span className="text-xs text-slate-500">files</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        {u.is_active ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950 text-emerald-400 border border-emerald-800/80">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Active</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-950 text-red-400 border border-red-800/80">
                            <XCircle className="h-3.5 w-3.5" />
                            <span>Suspended</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => onInspectFiles(u)}
                            className="px-3 py-1.5 bg-sky-950 hover:bg-sky-900 border border-sky-800 text-sky-300 hover:text-white rounded-lg text-xs font-semibold flex items-center space-x-1 transition-colors"
                            title="Inspect complete file tree"
                          >
                            <FolderTree className="h-3.5 w-3.5" />
                            <span>Inspect Files</span>
                          </button>

                          <button
                            onClick={() => onOpenEditUser(u)}
                            className="p-1.5 bg-slate-700/60 hover:bg-slate-700 border border-slate-600 text-slate-300 hover:text-white rounded-lg text-xs transition-colors"
                            title="Edit Quota & Password"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>

                          {u.is_active && (
                            <button
                              onClick={() => handleDeactivate(u)}
                              className="p-1.5 bg-slate-700/60 hover:bg-red-950/60 border border-slate-600 hover:border-red-800 text-slate-300 hover:text-red-400 rounded-lg text-xs transition-colors"
                              title="Suspend User Sync"
                            >
                              <UserX className="h-3.5 w-3.5" />
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
    </div>
  );
};
