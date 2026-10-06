import { edgeErrorMessage } from '@/lib/invokeError';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Users, Plus, Trash2, Pencil, KeyRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useShowMore, ShowMoreButton } from '@/components/ui/show-more';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

const STAFF_ROLES: { value: AppRole; label: string }[] = [
  { value: 'cashier', label: 'Cajero' },
  { value: 'waiter', label: 'Mesero' },
  { value: 'kitchen', label: 'Cocina' },
];

export default function AdminStaff() {
  const { establishmentId, role: myRole } = useAuth();
  const isCashierCaller = myRole === 'cashier';
  const assignableRoles = isCashierCaller
    ? STAFF_ROLES.filter(r => r.value !== 'cashier')
    : STAFF_ROLES;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<AppRole>('waiter');

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editRoleId, setEditRoleId] = useState('');
  const [editUserId, setEditUserId] = useState('');
  const [editRole, setEditRole] = useState<AppRole>('waiter');
  const [editUserName, setEditUserName] = useState('');

  const { data: staff = [] } = useQuery({
    queryKey: ['staff', establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*, profiles:user_id(full_name, email)')
        .eq('establishment_id', establishmentId!)
        .order('role');
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
    staleTime: 5 * 60_000,
  });

  const staffList = useShowMore<any>(staff, 10);

  const createStaff = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No autenticado');

      const res = await supabase.functions.invoke('create-user', {
        body: { email, password, fullName, role, establishmentId },
      });
      if (res.error) throw new Error(await edgeErrorMessage(res.error));
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Personal creado');
      setOpen(false);
      setEmail('');
      setPassword('');
      setFullName('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateRole = useMutation({
    mutationFn: async () => {
      const res = await supabase.functions.invoke('create-user', {
        body: { action: 'update_role', roleId: editRoleId, role: editRole, establishmentId },
      });
      if (res.error) throw new Error(await edgeErrorMessage(res.error));
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Rol actualizado');
      setEditOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetPassword = useMutation({
    mutationFn: async (userId: string) => {
      const res = await supabase.functions.invoke('create-user', {
        body: { action: 'reset_password', userId },
      });
      if (res.error) throw new Error(await edgeErrorMessage(res.error));
      if (res.data?.error) throw new Error(res.data.error);
      return res.data?.tempPassword as string | undefined;
    },
    onSuccess: (tempPassword) => {
      if (tempPassword) {
        toast.success(`Contraseña temporal: ${tempPassword}`, { duration: 20000 });
      } else {
        toast.success('Contraseña reseteada');
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteStaff = useMutation({
    mutationFn: async (id: string) => {
      const res = await supabase.functions.invoke('create-user', {
        body: { action: 'delete_role', roleId: id },
      });
      if (res.error) throw new Error(await edgeErrorMessage(res.error));
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Personal eliminado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleName = (r: string) => STAFF_ROLES.find(s => s.value === r)?.label || r;

  const openEdit = (s: any) => {
    setEditRoleId(s.id);
    setEditUserId(s.user_id);
    setEditRole(s.role as AppRole);
    setEditUserName(s.profiles?.full_name || s.profiles?.email || '—');
    setEditOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Personal</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Nuevo</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Agregar personal</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); createStaff.mutate(); }} className="space-y-4">
              <div className="space-y-2"><Label>Nombre</Label><Input value={fullName} onChange={e => setFullName(e.target.value)} required /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
              <div className="space-y-2"><Label>Contraseña</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} /></div>
              <div className="space-y-2">
                <Label>Rol</Label>
                <Select value={role} onValueChange={v => setRole(v as AppRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {assignableRoles.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={createStaff.isPending}>Crear</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar: {editUserName}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); updateRole.mutate(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={editRole} onValueChange={v => setEditRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {assignableRoles.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={updateRole.isPending}>
              {updateRole.isPending ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Personal ({staff.length})</CardTitle>
        </CardHeader>
        <CardContent>
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
              {staffList.visible.map((s: any) => {
                const canManage = !isCashierCaller || s.role === 'waiter' || s.role === 'kitchen';
                return (
                <TableRow key={s.id}>
                  <TableCell>{s.profiles?.full_name || '—'}</TableCell>
                  <TableCell>{s.profiles?.email || '—'}</TableCell>
                  <TableCell><Badge variant="outline">{roleName(s.role)}</Badge></TableCell>
                  <TableCell className="text-right space-x-1">
                    {canManage ? (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(s)} title="Editar rol">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => resetPassword.mutate(s.user_id)} title="Resetear contraseña">
                          <KeyRound className="h-4 w-4 text-amber-500" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteStaff.mutate(s.id)} title="Eliminar">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">Solo lectura</span>
                    )}
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <ShowMoreButton hiddenCount={staffList.hiddenCount} expanded={staffList.expanded} onToggle={() => staffList.setExpanded(!staffList.expanded)} />
        </CardContent>
      </Card>
    </div>
  );
}
