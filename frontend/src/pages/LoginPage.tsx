import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Notice } from '@/components/Notice';
import { useAuth } from '@/contexts/AuthContext';
import { useKeyboardOpen } from '@/hooks/useKeyboardOpen';
import { errorMessage, isUnauthorized } from '@/lib/api';
import { cn } from '@/lib/utils';

export function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const keyboardOpen = useKeyboardOpen();

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(
        isUnauthorized(err)
          ? 'Email o contraseña incorrectos.'
          : errorMessage(err)
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-primary">
      <div
        className={cn(
          'px-6 text-primary-foreground',
          keyboardOpen ? 'flex items-center gap-3 py-4' : 'space-y-3 pt-12 pb-8'
        )}
      >
        <span
          aria-hidden
          className={cn(
            'grid place-items-center rounded-xl bg-white/20',
            keyboardOpen ? 'size-10' : 'size-12'
          )}
        >
          <Check className="size-7" strokeWidth={3} />
        </span>
        <div>
          <h1
            className={cn(
              'font-extrabold',
              keyboardOpen ? 'text-xl' : 'text-3xl'
            )}
          >
            Control de stock
          </h1>
          {!keyboardOpen && (
            <p className="mt-1 text-base font-medium text-primary-foreground/85">
              Ingresá para contar o ver resultados.
            </p>
          )}
        </div>
      </div>
      <div className="mx-auto w-full max-w-md flex-1 rounded-t-[28px] bg-card px-6 pt-8 pb-8">
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              aria-invalid={error ? true : undefined}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              aria-invalid={error ? true : undefined}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          <Button
            type="submit"
            size="lg"
            className="w-full disabled:bg-[#7c5ce0] disabled:text-white"
            disabled={busy}
          >
            {busy && <Loader2 aria-hidden className="size-5 animate-spin" />}
            {busy ? 'Ingresando…' : 'Ingresar'}
          </Button>
        </form>
      </div>
    </div>
  );
}
