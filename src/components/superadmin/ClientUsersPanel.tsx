import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { edgeErrorMessage } from '@/lib/invokeError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Role = 'admin' | 'cashier' | 'waiter' | 'kitchen';
export const ROLE_LABELS: Record<Role, string> = { admin: 'Admin (dueño)', cashier: 'Cajero', waiter: 'Mozo', kitchen: 'Cocina' };
const ROLE_ORDER: Record<string, number> = { admin: 0, cashier: 1, waiter: 2, kitchen: 3 };

async function invoke(body: Record<string, unknown>, fallback: string) {
  const res = await db.functions.invoke('create-user', { body });
  if (res.error) throw new Error(await edgeErrorMessage(res.error, fallback));
  if (res.data?.error) throw new Error(res.data.error);
  return res.data;
}

export function useClientUsers(establishmentId: string) {
  return useQuery({
    queryKey: ['sa-client-users', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('user_roles')
        .select('*, profiles:user_id(full_name, email)')
        .eq('establishment_id', establishmentId);
      if (error) throw error;
      return [...(data ?? [])].sort((a: any, b: any) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));
    },
  });
}

/** Usuarios de UN restaurante: ver, crear, cambiar rol, resetear contraseña y quitar. */
export default function ClientUsersPanel({ establishmentId }: { establishmentId: string }) {
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useClientUsers(establishmentId);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: 'waiter' as Role });
  const [edit, setEdit] = useState<{ id: string; name: string; role: Role } | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['sa-client-users', establishmentId] });
    qc.invalidateQueries({ queryKey: ['all-user-roles'] });
  };

  const create = useMutation({
    mutationFn: () => invoke({ email: form.email, password: form.password, fullName: form.fullName, role: form.role, establishmentId }, 'Error al crear usuario'),
    onSuccess: () => {
      refresh();
      toast.success('Usuario creado');
      setCreateOpen(false);
      setForm({ fullName: '', email: '', password: '', role: 'waiter' });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateRole = useMutation({
    mutationFn: () => invoke({ action: 'update_role', roleId: edit!.id, role: edit!.role, establishmentId }, 'Error al actualizar'),
    onSuccess: () => { refresh(); toast.success('Rol actualizado'); setEdit(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetPassword = useMutation({
    mutationFn: async (userId: string) => (await invoke({ action: 'reset_password', userId }, 'Error al resetear'))?.tempPassword as string | undefined,
    onSuccess: (temp) => toast.success(temp ? `Contraseña temporal: ${temp}` : 'Contraseña reseteada', { duration: 20000 }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (roleId: string) => invoke({ action: 'delete_role', roleId }, 'Error al quitar'),
    onSuccess: () => { refresh(); toast.success('Usuario quitado del restaurante'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{users.length} {users.length === 1 ? 'usuario' : 'usuarios'} con acceso a este restaurante.</p>
        <Button size="sm" className="gap-1" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Nuevo usuario</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u: any) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.profiles?.full_name || '—'}</TableCell>
              <TableCell>{u.profiles?.email || '—'}</TableCell>
              <TableCell><Badge variant={u.role === 'admin' ? 'default' : 'outline'}>{ROLE_LABELS[u.role as Role] ?? u.role}</Badge></TableCell>
              <TableCell className="text-right space-x-1 whitespace-nowrap">
                <Button variant="ghost" size="icon" title="Cambiar rol" onClick={() => setEdit({ id: u.id, name: u.profiles?.full_name || u.profiles?.email || '—', role: u.role })}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" title="Resetear contraseña" onClick={() => window.confirm(`¿Generar una contraseña nueva para ${u.profiles?.email}? La actual deja de funcionar.`) && resetPassword.mutate(u.user_id)}><KeyRound className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" title="Quitar del restaurante" className="text-destructive hover:text-destructive" onClick={() => window.confirm(`¿Quitar a ${u.profiles?.email} de este restaurante?`) && remove.mutate(u.id)}><Trash2 className="h-4 w-4" /></Button>
              </TableCell>
            </TableRow>
          ))}
          {!isLoading && users.length === 0 && (
            <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Este restaurante todavía no tiene usuarios</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo usuario</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
            <div className="space-y-2"><Label>Nombre completo</Label><Input value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} required /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></div>
            <div className="space-y-2"><Label>Contraseña</Label><Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={6} /></div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={form.role} onValueChange={v => setForm({ ...form, role: v as Role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={create.isPending}>{create.isPending ? 'Creando...' : 'Crear usuario'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cambiar rol: {edit?.name}</DialogTitle></DialogHeader>
          {edit && (
            <form onSubmit={(e) => { e.preventDefault(); updateRole.mutate(); }} className="space-y-4">
              <Select value={edit.role} onValueChange={v => setEdit({ ...edit, role: v as Role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="submit" className="w-full" disabled={updateRole.isPending}>{updateRole.isPending ? 'Guardando...' : 'Guardar'}</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
