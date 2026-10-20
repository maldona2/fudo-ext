import { NavLink, Outlet } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const link = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-lg px-2.5 py-2 text-base font-medium',
    isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
  );

export function Layout() {
  const { user, logout } = useAuth();
  const isOwner = user?.role === 'owner';

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-1 px-3 py-2">
          <nav className="flex flex-1 flex-wrap gap-0.5">
            {isOwner && (
              <NavLink to="/panel" className={link}>
                Panel
              </NavLink>
            )}
            <NavLink to="/contar" className={link}>
              Contar
            </NavLink>
            {isOwner && (
              <NavLink to="/listas" className={link}>
                Listas
              </NavLink>
            )}
            {isOwner && (
              <NavLink to="/bultos" className={link}>
                Bultos
              </NavLink>
            )}
            {isOwner && (
              <NavLink to="/usuarios" className={link}>
                Usuarios
              </NavLink>
            )}
          </nav>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {user?.name}
          </span>
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={() => void logout()}
            aria-label="Salir"
          >
            <LogOut />
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-4 pb-28">
        <Outlet />
      </main>
    </div>
  );
}
