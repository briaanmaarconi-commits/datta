import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, DollarSign, TrendingDown, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

export default function SuperAdminCash() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [form, setForm] = useState({ type: 'income', amount: '', description: '', category_id: '', establishment_id: '', date: new Date().toISOString().split('T')[0] });

  const { data: categories = [] } = useQuery({
    queryKey: ['datta-finance-cats'],
    queryFn: async () => {
      const { data, error } = await supabase.from('datta_finance_categories').select('*').order('type, name');
      if (error) throw error;
      return data;
    },
  });

  const { data: establishments = [] } = useQuery({
    queryKey: ['sa-est-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('establishments').select('id, name').order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['datta-transactions', dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase.from('datta_transactions')
        .select('*, datta_finance_categories(name, type), establishments(name)')
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createTx = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('datta_transactions').insert({
        type: form.type,
        amount: Number(form.amount),
        description: form.description || null,
        category_id: form.category_id,
        establishment_id: form.establishment_id || null,
        date: form.date,
        created_by: user?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datta-transactions'] });
      toast.success('Movimiento registrado');
      setOpen(false);
      setForm({ type: 'income', amount: '', description: '', category_id: '', establishment_id: '', date: new Date().toISOString().split('T')[0] });
    },
    onError: () => toast.error('Error al registrar'),
  });

  const totalIncome = transactions.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalExpense = transactions.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0);
  const balance = totalIncome - totalExpense;
  const filteredCats = categories.filter((c: any) => c.type === form.type);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Caja Datta</h1>
        <div className="flex gap-2 items-center">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" />
          <span className="text-muted-foreground">a</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Nuevo movimiento</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Registrar movimiento</DialogTitle></DialogHeader>
              <form onSubmit={e => { e.preventDefault(); createTx.mutate(); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={form.type} onValueChange={v => setForm({ ...form, type: v, category_id: '' })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income">Ingreso</SelectItem>
                      <SelectItem value="expense">Egreso</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Categoría</Label>
                  <Select value={form.category_id} onValueChange={v => setForm({ ...form, category_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>
                      {filteredCats.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Monto ($)</Label><Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></div>
                <div className="space-y-2"><Label>Descripción</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
                <div className="space-y-2">
                  <Label>Cliente (opcional)</Label>
                  <Select value={form.establishment_id} onValueChange={v => setForm({ ...form, establishment_id: v })}>
                    <SelectTrigger><SelectValue placeholder="General" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">General</SelectItem>
                      {establishments.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Fecha</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
                <Button type="submit" className="w-full" disabled={createTx.isPending}>{createTx.isPending ? 'Guardando...' : 'Registrar'}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingUp className="h-4 w-4" />Ingresos</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">${totalIncome.toLocaleString('es-AR')}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingDown className="h-4 w-4" />Egresos</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-red-600">${totalExpense.toLocaleString('es-AR')}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><DollarSign className="h-4 w-4" />Balance</CardTitle></CardHeader>
          <CardContent><div className={`text-2xl font-bold ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>${balance.toLocaleString('es-AR')}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell>{new Date(t.date).toLocaleDateString('es-AR')}</TableCell>
                  <TableCell><Badge variant={t.type === 'income' ? 'default' : 'destructive'}>{t.type === 'income' ? 'Ingreso' : 'Egreso'}</Badge></TableCell>
                  <TableCell>{t.datta_finance_categories?.name || '—'}</TableCell>
                  <TableCell>{t.description || '—'}</TableCell>
                  <TableCell>{t.establishments?.name || 'General'}</TableCell>
                  <TableCell className={`text-right font-medium ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>${Number(t.amount).toLocaleString('es-AR')}</TableCell>
                </TableRow>
              ))}
              {transactions.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sin movimientos en este período</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
