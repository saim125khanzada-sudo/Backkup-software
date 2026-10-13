import React, { useState } from "react";
import apiClient from "../api/client";
import { User } from "../context/AuthContext";
import { X, Settings2, KeyRound, HardDrive, AlertCircle, Check } from "lucide-react";

interface EditUserModalProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
  onUserUpdated: () => void;
}

export const EditUserModal: React.FC<EditUserModalProps> = ({ user, isOpen, onClose, onUserUpdated }) => {
  if (!isOpen || !user) return null;

  const currentQuotaGb = (user.quota_bytes / (1024 * 1024 * 1024)).toFixed(1);
  const [quotaGb, setQuotaGb] = useState(currentQuotaGb);
  const [newPassword, setNewPassword] = useState("");
  const [fullName, setFullName] = useState(user.full_name || "");
  const [isActive, setIsActive] = useState(user.is_active);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload: any = {
      full_name: fullName,
      quota_gb: parseFloat(quotaGb) || 50,
      is_active: isActive,
    };
    if (newPassword.trim()) {
      payload.password = newPassword.trim();
    }

    try {
      await apiClient.patch(`/admin/users/${user.id}`, payload);
      onUserUpdated();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to update user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-slate-850">
          <div className="flex items-center space-x-2 text-white font-semibold">
            <Settings2 className="h-5 w-5 text-sky-400" />
            <span>Manage User: {user.email}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg flex items-center space-x-2 text-red-300 text-sm">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-sky-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center space-x-1">
              <HardDrive className="h-3.5 w-3.5 text-sky-400" />
              <span>Storage Quota (GB)</span>
            </label>
            <input
              type="number"
              step="0.5"
              min="1"
              value={quotaGb}
              onChange={(e) => setQuotaGb(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-sky-500 text-sm"
            />
            <span className="text-xs text-slate-400 mt-1 block">
              Currently using: {(user.used_bytes / (1024 * 1024 * 1024)).toFixed(2)} GB
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center space-x-1">
              <KeyRound className="h-3.5 w-3.5 text-amber-400" />
              <span>Reset Password (leave blank to keep unchanged)</span>
            </label>
            <input
              type="password"
              placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-sky-500 text-sm"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-900/60 border border-slate-700 rounded-lg">
            <div>
              <div className="text-sm font-medium text-slate-200">Account Status</div>
              <div className="text-xs text-slate-400">
                {isActive ? "Active (Client sync allowed)" : "Suspended (Sync paused, files retained)"}
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium text-slate-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg text-sm font-medium text-white transition-colors flex items-center space-x-2 disabled:opacity-50"
            >
              {loading ? <span>Saving...</span> : <><Check className="h-4 w-4" /><span>Save Changes</span></>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
