import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Notice } from '@/components/Notice';
import { errorMessage, users as usersApi } from '@/lib/api';
import type { Role, User } from '@/types/api';

const ROLE_LABEL: Record<Role, string> = {
  owner: 'Dueño (ve resultados)',
  counter: 'Encargado/a (solo cuenta)',
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
          <CardTitle className="text-xl">Usuarios</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {list.map((u) => (
              <li key={u.id} className="py-2">
                <span className="block text-base font-medium">{u.name}</span>
                <span className="text-sm text-muted-foreground">
                  {u.email} · {ROLE_LABEL[u.role]}
                  {u.active === false && ' · inactivo'}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Agregar usuario</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-base">
                Nombre
              </Label>
              <Input
                id="name"
                className="h-12 text-lg"
                value={form.name}
                maxLength={100}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-email" className="text-base">
                Email
              </Label>
              <Input
                id="new-email"
                type="email"
                className="h-12 text-lg"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-base">
                Contraseña (mínimo 8 caracteres)
              </Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                className="h-12 text-lg"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-base font-medium">Rol</legend>
              {(Object.keys(ROLE_LABEL) as Role[]).map((role) => (
                <label key={role} className="flex items-center gap-2 text-base">
                  <input
                    type="radio"
                    name="role"
                    className="size-5"
                    checked={form.role === role}
                    onChange={() => setForm({ ...form, role })}
                  />
                  {ROLE_LABEL[role]}
                </label>
              ))}
            </fieldset>
            {message && <Notice tone={message.tone}>{message.text}</Notice>}
            <Button type="submit" className="h-12 w-full text-lg">
              Crear usuario
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
