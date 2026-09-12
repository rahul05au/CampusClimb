import React, { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
const Home = lazy(() => import('./pages/Home'));
const Login = lazy(() => import('./pages/Login'));
const Query = lazy(() => import('./pages/Query'));
const Upload = lazy(() => import('./pages/Upload'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));

function RouteSkeleton() {
  return <div className="min-h-[100dvh] bg-[#0a0a0a] px-4 py-8" aria-label="Loading workspace" role="status">
    <div className="mx-auto max-w-7xl space-y-5 animate-pulse">
      <div className="h-12 w-full rounded-lg bg-neutral-900" />
      <div className="h-8 w-1/3 rounded bg-neutral-900" />
      <div className="grid gap-4 md:grid-cols-2"><div className="h-56 rounded-xl bg-neutral-900" /><div className="h-56 rounded-xl bg-neutral-900" /></div>
    </div>
  </div>;
}

export default function App() {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <AuthProvider>
      <Router>
        <Suspense fallback={<RouteSkeleton />}>
          <Routes>
            <Route path="/" element={<Home theme={theme} toggleTheme={toggleTheme} />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/query" element={<Query />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Router>
    </AuthProvider>
  );
}
