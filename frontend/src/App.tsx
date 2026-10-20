import {
  BrowserRouter as Router,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';
import type { ReactNode } from 'react';
import { Layout } from '@/components/Layout';
import { Notice } from '@/components/Notice';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CountDetailPage } from '@/pages/CountDetailPage';
import { CountPage } from '@/pages/CountPage';
import { PacksPage } from '@/pages/PacksPage';
import { ListsPage } from '@/pages/ListsPage';
import { LoginPage } from '@/pages/LoginPage';
import { PanelPage } from '@/pages/PanelPage';
import { UsersPage } from '@/pages/UsersPage';
import type { Role } from '@/types/api';

function RequireUser({ role, children }: { role?: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Notice>Cargando…</Notice>;
  if (!user) return <Navigate to="/ingresar" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Home() {
  const { user } = useAuth();
  return (
    <Navigate to={user?.role === 'owner' ? '/panel' : '/contar'} replace />
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/ingresar" element={<LoginPage />} />
          <Route
            element={
              <RequireUser>
                <Layout />
              </RequireUser>
            }
          >
            <Route path="/" element={<Home />} />
            <Route path="/contar" element={<CountPage />} />
            <Route
              path="/panel"
              element={
                <RequireUser role="owner">
                  <PanelPage />
                </RequireUser>
              }
            />
            <Route
              path="/panel/conteos/:id"
              element={
                <RequireUser role="owner">
                  <CountDetailPage />
                </RequireUser>
              }
            />
            <Route
              path="/listas"
              element={
                <RequireUser role="owner">
                  <ListsPage />
                </RequireUser>
              }
            />
            <Route
              path="/bultos"
              element={
                <RequireUser role="owner">
                  <PacksPage />
                </RequireUser>
              }
            />
            <Route
              path="/usuarios"
              element={
                <RequireUser role="owner">
                  <UsersPage />
                </RequireUser>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
