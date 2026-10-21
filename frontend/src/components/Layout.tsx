import { NavLink, Outlet } from 'react-router-dom';
import { Check, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const link = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex h-11 shrink-0 items-center rounded-full px-5 text-[15px] font-bold lg:h-12 lg:w-full',
    isActive
      ? 'bg-primary text-primary-foreground'
      : 'text-foreground-medium hover:bg-primary-soft'
  );

export function Layout() {
  const { user, logout } = useAuth();
  const isOwner = user?.role === 'owner';

  const nav = (
    <>
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
        <NavLink to="/codigos" className={link}>
          Códigos
        </NavLink>
      )}
      {isOwner && (
        <NavLink to="/usuarios" className={link}>
          Usuarios
        </NavLink>
      )}
    </>
  );

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[248px_1fr] lg:grid-rows-[auto_1fr]">
      <header className="sticky top-0 z-20 border-b border-border bg-card lg:col-span-2">
        <div className="flex h-14 items-center gap-3 px-4">
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"
          >
            <Check className="size-5" strokeWidth={3} />
          </span>
          <span className="flex-1 truncate text-base font-extrabold">
            Control de stock
          </span>
          <span className="hidden max-w-48 truncate text-sm font-medium text-foreground-secondary sm:inline">
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
      {isOwner && (
        <nav
          aria-label="Principal"
          className="sticky top-14 z-10 flex gap-2 overflow-x-auto border-b border-border bg-card px-4 py-2 lg:static lg:flex-col lg:gap-1 lg:overflow-visible lg:border-r lg:border-b-0 lg:p-4"
        >
          {nav}
        </nav>
      )}
      <main
        className={cn(
          'mx-auto w-full max-w-3xl min-w-0 px-4 py-4 pb-40 lg:max-w-[960px]',
          isOwner ? 'lg:col-start-2' : 'lg:col-span-2'
        )}
      >
        <Outlet />
      </main>
    </div>
  );
}
