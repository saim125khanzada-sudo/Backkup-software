import React, { createContext, useContext, useState, useEffect } from "react";
import apiClient from "../api/client";

export interface User {
  id: string;
  email: string;
  full_name?: string;
  quota_bytes: number;
  used_bytes: number;
  is_admin: boolean;
  is_active: boolean;
  device_count?: number;
  file_count?: number;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem("backup_auth_token");
    const savedUser = localStorage.getItem("backup_auth_user");
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error("Failed to parse saved user", e);
      }
    }
    setLoading(false);
  }, []);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem("backup_auth_token", newToken);
    localStorage.setItem("backup_auth_user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem("backup_auth_token");
    localStorage.removeItem("backup_auth_user");
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const res = await apiClient.get<User>("/auth/me");
      setUser(res.data);
      localStorage.setItem("backup_auth_user", JSON.stringify(res.data));
    } catch (e) {
      console.error("Failed to refresh user profile", e);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        login,
        logout,
        refreshUser,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
