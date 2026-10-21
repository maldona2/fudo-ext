import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Notice } from '@/components/Notice';
import { errorMessage, users as usersApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Role, User } from '@/types/api';

const ROLE_LABEL: Record<Role, string> = {
  owner: 'Dueño (ve resultados)',
  counter: 'Encargado/a (solo cuenta)',
};

const ROLE_CHIP: Record<Role, { text: string; className: string }> = {
  owner: { text: 'Dueño', className: 'bg-primary text-primary-foreground' },
  counter: {
    text: 'Encargada',
    className: 'bg-muted text-foreground-medium',
  },
};

const ROLE_CARD: Record<Role, { title: string; hint: string }> = {
  counter: { title: 'Encargado/a', hint: 'Solo cuenta' },
  owner: { title: 'Dueño', hint: 'Ve resultados y administra' },
};

export function UsersPage() {
  const [list, setList] = useState<User[]>([]);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'counter' as Role,
  });
  const [message, setMessage] = useState<{
    tone: 'error' | 'success';
    text: string;
  } | null>(null);

  const load = () =>
    usersApi
      .list()
      .then(setList)
      .catch((err) => setMessage({ tone: 'error', text: errorMessage(err) }));

  useEffect(() => {
    void load();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const created = await usersApi.create(form);
      setMessage({
        tone: 'success',
        text: `Listo: ${created.name} ya puede ingresar.`,
      });
      setForm({ name: '', email: '', password: '', role: 'counter' });
      void load();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-extrabold">Usuarios</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {list.map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold">
                    {u.name}
                  </span>
                  <span className="block truncate text-sm font-medium text-foreground-secondary">
                    {u.email}
                  </span>
                </span>
                <span
                  className={cn(
                    'rounded-full px-3 py-1 text-[13px] font-bold',
                    ROLE_CHIP[u.role].className
                  )}
                >
                  {ROLE_CHIP[u.role].text}
                </span>
                {u.active === false && (
                  <span className="rounded-full border-2 border-field px-3 py-0.5 text-[13px] font-bold text-foreground-secondary">
                    Inactivo
                  </span>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-extrabold">
            Agregar usuario
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                value={form.name}
                maxLength={100}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-email">Email</Label>
              <Input
                id="new-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">
                Contraseña (mínimo 8 caracteres)
              </Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-[15px] font-bold">Rol</legend>
              {(Object.keys(ROLE_LABEL) as Role[]).map((role) => (
                <label
                  key={role}
                  className={cn(
                    'flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-2 has-focus-visible:ring-4 has-focus-visible:ring-ring-soft',
                    form.role === role
                      ? 'border-primary bg-[#f6f2ff]'
                      : 'border-field bg-card'
                  )}
                >
                  <input
                    type="radio"
                    name="role"
                    className="size-5 accent-primary"
                    aria-label={ROLE_LABEL[role]}
                    checked={form.role === role}
                    onChange={() => setForm({ ...form, role })}
                  />
                  <span className="text-base font-bold">
                    {ROLE_CARD[role].title}
                    <span className="block text-sm font-medium text-foreground-secondary">
                      {ROLE_CARD[role].hint}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            {message && <Notice tone={message.tone}>{message.text}</Notice>}
            <Button type="submit" size="lg" className="w-full">
              Crear usuario
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
