import { edgeErrorMessage } from '@/lib/invokeError';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { Users as UsersIcon, Plus, Trash2, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { Database } from '@/lib/dbTypes';

type AppRole = Database['public']['Enums']['app_role'];

const ROLE_LABELS: Record<AppRole, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  cashier: 'Cajero',
  waiter: 'Mesero',
  kitchen: 'Cocina',
};

export default function SuperAdminUsers() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<AppRole>('waiter');
  const [establishmentId, setEstablishmentId] = useState<string>('');

  // Edit state
  const [editRoleId, setEditRoleId] = useState('');
  const [editRole, setEditRole] = useState<AppRole>('waiter');
  const [editEstablishmentId, setEditEstablishmentId] = useState<string>('');
  const [editUserName, setEditUserName] = useState('');

  const { data: roles = [] } = useQuery({
    queryKey: ['all-user-roles'],
    queryFn: async () => {
      const { data, error } = await db
        .from('user_roles')
        .select('*, profiles:user_id(full_name, email), establishments:establishment_id(name)')
        .order('role');
      if (error) throw error;
      return data;
    },
  });

  const { data: establishments = [] } = useQuery({
    queryKey: ['establishments'],
    queryFn: async () => {
      const { data, error } = await db.from('establishments').select('id, name').eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  const createUser = useMutation({
    mutationFn: async () => {
      const res = await db.functions.invoke('create-user', {
        body: { email, password, fullName, role, establishmentId: role === 'superadmin' ? null : establishmentId || null },
      });
      if (res.error) throw new Error(await edgeErrorMessage(res.error, 'Error al crear usuario'));
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-user-roles'] });
      toast.success('Usuario creado');
      setCreateOpen(false);
      resetCreateForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateRole = useMutation({
    mutationFn: async () => {
      const res = await db.functions.invoke('create-user', {
        body: {
          action: 'update_role',
          roleId: editRoleId,
          role: editRole,
          establishmentId: editRole === 'superadmin' ? null : editEstablishmentId || null,
        },
      });
      if (res.error) throw new Error(await edgeErrorMessage(res.error, 'Error al actualizar'));
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-user-roles'] });
      toast.success('Rol actualizado');
      setEditOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteRole = useMutation({
    mutationFn: async (id: string) => {
      const res = await db.functions.invoke('create-user', {
        body: { action: 'delete_role', roleId: id },
      });
      if (res.error) throw new Error(await edgeErrorMessage(res.error, 'Error al eliminar'));
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-user-roles'] });
      toast.success('Rol eliminado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetCreateForm = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setRole('waiter');
    setEstablishmentId('');
  };

  const openEdit = (r: any) => {
    setEditRoleId(r.id);
    setEditRole(r.role as AppRole);
    setEditEstablishmentId(r.establishment_id || '');
    setEditUserName(r.profiles?.full_name || r.profiles?.email || '—');
    setEditOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Usuarios</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Nuevo usuario</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Crear usuario</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createUser.mutate(); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre completo</Label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Contraseña</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
              </div>
              <div className="space-y-2">
                <Label>Rol</Label>
                <Select value={role} onValueChange={v => setRole(v as AppRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {role !== 'superadmin' && (
                <div className="space-y-2">
                  <Label>Establecimiento</Label>
                  <Select value={establishmentId} onValueChange={setEstablishmentId}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>
                      {establishments.map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={createUser.isPending}>
                {createUser.isPending ? 'Creando...' : 'Crear usuario'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar usuario: {editUserName}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); updateRole.mutate(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={editRole} onValueChange={v => setEditRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editRole !== 'superadmin' && (
              <div className="space-y-2">
                <Label>Establecimiento</Label>
                <Select value={editEstablishmentId} onValueChange={setEditEstablishmentId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    {establishments.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={updateRole.isPending}>
              {updateRole.isPending ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersIcon className="h-5 w-5 text-primary" />
            Todos los usuarios ({roles.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Establecimiento</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{r.profiles?.full_name || '—'}</TableCell>
                  <TableCell>{r.profiles?.email || '—'}</TableCell>
                  <TableCell><Badge variant="outline">{ROLE_LABELS[r.role as AppRole]}</Badge></TableCell>
                  <TableCell>{r.establishments?.name || 'Global'}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteRole.mutate(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
