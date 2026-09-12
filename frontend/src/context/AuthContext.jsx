import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const AuthContext = createContext(null);

function clearUserSpecificStorage() {
  if (typeof window === 'undefined') return;
  const keysToClear = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    if (
      key === 'campusclimb_user' ||
      key === 'campusclimb_token' ||
      key.startsWith('campusclimb_sources_') ||
      key.startsWith('campusclimb_dashboard_') ||
      key.startsWith('campusclimb_query_') ||
      key.startsWith('campusclimb_history_')
    ) {
      keysToClear.push(key);
    }
  }
  keysToClear.forEach((key) => window.localStorage.removeItem(key));
}

export function AuthProvider({ children }) {
  // Synchronously initialize token from localStorage to prevent auth race conditions
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem('campusclimb_token') || null;
    } catch {
      return null;
    }
  });
  const [user, setUser]   = useState(() => {
    try {
      const saved = localStorage.getItem('campusclimb_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function initSession() {
      if (isSupabaseConfigured && supabase) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session && mounted) {
            const uData = {
              id: session.user.id,
              email: session.user.email,
              name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email,
            };
            setToken(session.access_token);
            setUser(uData);
            localStorage.setItem('campusclimb_token', session.access_token);
            localStorage.setItem('campusclimb_user', JSON.stringify(uData));
          }
        } catch (err) {
          console.error('[AuthContext] Session recovery error:', err);
        }
      }
      if (mounted) setLoading(false);
    }

    initSession();

    let authListener = null;
    if (isSupabaseConfigured && supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (!mounted) return;
        if (session) {
          const uData = {
            id: session.user.id,
            email: session.user.email,
            name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email,
          };
          setToken(session.access_token);
          setUser(uData);
          localStorage.setItem('campusclimb_token', session.access_token);
          localStorage.setItem('campusclimb_user', JSON.stringify(uData));
        } else if (event === 'SIGNED_OUT') {
          setToken(null);
          setUser(null);
          localStorage.removeItem('campusclimb_token');
          localStorage.removeItem('campusclimb_user');
          clearUserSpecificStorage();
        }
        setLoading(false);
      });
      authListener = subscription;
    }

    return () => {
      mounted = false;
      if (authListener) authListener?.unsubscribe();
    };
  }, []);

  const login = async (accessToken, userData, refreshToken = null) => {
    clearUserSpecificStorage();
    setToken(accessToken);
    setUser(userData);
    if (accessToken) {
      localStorage.setItem('campusclimb_token', accessToken);
    }
    if (userData) {
      localStorage.setItem('campusclimb_user', JSON.stringify(userData));
    }
    setLoading(false);
    if (isSupabaseConfigured && supabase && accessToken && refreshToken) {
      try {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      } catch (err) {
        console.warn('[AuthContext] setSession failed:', err);
      }
    }
  };

  const getToken = async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          if (session.access_token !== token) {
            setToken(session.access_token);
            localStorage.setItem('campusclimb_token', session.access_token);
          }
          return session.access_token;
        }
      } catch (err) {
        console.warn('[AuthContext] getToken error:', err);
      }
    }
    return token || localStorage.getItem('campusclimb_token');
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('campusclimb_token');
    localStorage.removeItem('campusclimb_user');
    clearUserSpecificStorage();
    if (isSupabaseConfigured && supabase) {
      supabase.auth.signOut().catch(() => {});
    }
  };

  return (
    <AuthContext.Provider value={{ token, getToken, user, login, logout, isAuthenticated: !!token, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
