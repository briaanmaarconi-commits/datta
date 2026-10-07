import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { useActiveShift } from '@/hooks/useActiveShift';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  DollarSign, CreditCard, Banknote, Smartphone, AlertTriangle,
  FileText, Search, Eye, FileCheck, FileX, Printer,
} from 'lucide-react';
import InvoiceTicket from '@/components/cashier/InvoiceTicket';
import CloseTicket, { CloseTicketData } from '@/components/cashier/CloseTicket';
import FiscalInvoiceDialog from '@/components/cashier/FiscalInvoiceDialog';
import ManualInvoiceDialog from '@/components/cashier/ManualInvoiceDialog';
import CreditNoteDialog from '@/components/cashier/CreditNoteDialog';
import FiscalTicketDialog from '@/components/cashier/FiscalTicketDialog';
import type { FacturaTicketData } from '@/components/cashier/FacturaTicket80mm';
import { printTicketPortal } from '@/lib/print';
import { useShowMore, ShowMoreButton } from '@/components/ui/show-more';
import { tableCell } from '@/lib/ownDelivery';

const STATUS_COLORS: Record<string, string> = {
  free: 'bg-green-500/20 border-green-500 text-green-700',
  occupied: 'bg-red-500/20 border-red-500 text-red-700',
  billing: 'bg-yellow-500/20 border-yellow-500 text-yellow-700',
};
const STATUS_LABELS: Record<string, string> = { free: 'Libre', occupied: 'Ocupada', billing: 'En preparación' };

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Efectivo', icon: Banknote },
  { value: 'card', label: 'Tarjeta', icon: CreditCard },
  { value: 'transfer', label: 'Transferencia', icon: Smartphone },
];

const PAYMENT_LABELS: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' };

export default function CashierInvoices() {
  const { establishmentId, session } = useAuth();
  const { isShiftOpen } = useActiveShift();
  const queryClient = useQueryClient();

  // Open accounts state
  const [selectedTable, setSelectedTable] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountPaid, setAmountPaid] = useState('');

  // Invoice history state
  const [dateFilter, setDateFilter] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [searchTable, setSearchTable] = useState('');
  const [viewingInvoice, setViewingInvoice] = useState<any>(null);
  const [fiscalInvoice, setFiscalInvoice] = useState<any>(null);
  const [creditNoteInvoice, setCreditNoteInvoice] = useState<any>(null);
  const [reprintTicket, setReprintTicket] = useState<CloseTicketData | null>(null);
  const [fiscalTicket, setFiscalTicket] = useState<FacturaTicketData | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  // El duplicado (cliente + control) se monta solo mientras dura su impresión,
  // para que nunca se cuele en el trabajo de impresión del ticket fiscal.
  useEffect(() => {
    if (!reprintTicket) return;
    return printTicketPortal(() => setReprintTicket(null), 250);
  }, [reprintTicket]);

  // Fetch establishment name
  const { data: establishment } = useQuery({
    queryKey: ['establishment', establishmentId],
    queryFn: async () => {
      const { data } = await db.from('establishments').select('name, condicion_iva, razon_social, cuit, domicilio_comercial').eq('id', establishmentId!).single();
      return data;
    },
    enabled: !!establishmentId,
  });

  // Fetch fiscal invoices for status display
  const { data: fiscalInvoices = [] } = useQuery({
    queryKey: ['fiscal-invoices', establishmentId, dateFilter],
    queryFn: async () => {
      const { data } = await db
        .from('fiscal_invoices')
        .select('*')
        .eq('establishment_id', establishmentId!)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!establishmentId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });


  // Fetch tables
  const { data: tables = [] } = useQuery({
    queryKey: ['tables', establishmentId],
    queryFn: async () => {
      const { data, error } = await db.from('tables').select('*').eq('establishment_id', establishmentId!).order('number');
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
  });

  const activeTables = tables.filter(t => t.status === 'occupied' || t.status === 'billing');

  // Realtime for tables
  useEffect(() => {
    if (!establishmentId) return;
    const channel = db
      .channel('invoices-tables-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter: `establishment_id=eq.${establishmentId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['tables', establishmentId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `establishment_id=eq.${establishmentId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['table-orders-invoice'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices', filter: `establishment_id=eq.${establishmentId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fiscal_invoices', filter: `establishment_id=eq.${establishmentId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['fiscal-invoices'] });
      })

      .subscribe();
    return () => { db.removeChannel(channel); };
  }, [establishmentId, queryClient]);

  // Fetch orders for selected table
  const { data: tableOrders = [] } = useQuery({
    queryKey: ['table-orders-invoice', selectedTable?.id],
    queryFn: async () => {
      const { data, error } = await db
        .from('orders')
        .select('*, order_items(*, products(name))')
        .eq('table_id', selectedTable!.id)
        .in('status', ['new', 'preparing', 'ready', 'delivered'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedTable,
  });

  // Fetch invoices history
  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', establishmentId, dateFilter],
    queryFn: async () => {
      let q = db
        .from('invoices')
        .select('*')
        .eq('establishment_id', establishmentId!)
        .order('created_at', { ascending: false });

      if (dateFilter) {
        // Los comprobantes se operan en horario de Argentina (UTC-3). Sin el
        // offset, Postgres interpretaba el filtro en UTC y ocultaba los cobros
        // realizados después de las 21:00 del día seleccionado.
        q = q
          .gte('created_at', `${dateFilter}T00:00:00-03:00`)
          .lte('created_at', `${dateFilter}T23:59:59.999-03:00`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });


  const filteredInvoices = searchTable
    ? invoices.filter((inv: any) => String(inv.table_number).includes(searchTable))
    : invoices;

  const invoicesList = useShowMore<any>(filteredInvoices, 15);

  // Close & invoice mutation
  const closeAndInvoice = useMutation({
    mutationFn: async () => {
      const paid = parseFloat(amountPaid);
      if (paymentMethod === 'cash' && (isNaN(paid) || paid < grandTotal)) {
        throw new Error('El monto pagado debe ser mayor o igual al total');
      }

      const actualPaid = paymentMethod === 'cash' ? paid : grandTotal;
      const changeAmt = paymentMethod === 'cash' ? Math.max(0, paid - grandTotal) : 0;

      // Close orders
      for (const order of tableOrders) {
        await db.from('orders').update({
          status: 'closed' as any,
          payment_method: paymentMethod,
          amount_paid: actualPaid,
        } as any).eq('id', order.id);
      }

      // Free table
      await db.from('tables').update({ status: 'free' as any }).eq('id', selectedTable!.id);

      // Finance transaction
      let { data: salesCat } = await db
        .from('finance_categories')
        .select('id')
        .eq('establishment_id', establishmentId!)
        .eq('name', 'Ventas')
        .eq('type', 'income')
        .maybeSingle();

      if (!salesCat) {
        const { data: newCat } = await db
          .from('finance_categories')
          .insert({ establishment_id: establishmentId!, name: 'Ventas', type: 'income' })
          .select('id')
          .single();
        salesCat = newCat;
      }

      if (salesCat) {
        await db.from('finance_transactions').insert({
          establishment_id: establishmentId!,
          category_id: salesCat.id,
          type: 'income',
          amount: grandTotal,
          description: `Mesa ${selectedTable!.number} - ${PAYMENT_LABELS[paymentMethod]}`,
          date: new Date().toISOString().split('T')[0],
          created_by: session?.user?.id || null,
        });
      }

      // Create invoice
      const itemsSnapshot = allItems.map((item: any) => ({
        name: item.products?.name || 'Producto',
        qty: item.quantity,
        unit_price: Number(item.unit_price),
        subtotal: Number(item.unit_price) * item.quantity,
      }));

      await db.from('invoices').insert({
        establishment_id: establishmentId!,
        table_number: selectedTable!.number,
        order_ids: tableOrders.map((o: any) => o.id),
        items: itemsSnapshot,
        total: grandTotal,
        payment_method: paymentMethod,
        amount_paid: actualPaid,
        change_amount: changeAmt,
        created_by: session?.user?.id || null,
      } as any);
    },
    onSuccess: () => {
      const paid = parseFloat(amountPaid);
      const change = paymentMethod === 'cash' ? paid - grandTotal : 0;
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      if (change > 0) {
        toast.success(`Mesa cerrada. Vuelto: $${change.toFixed(2)}`);
      } else {
        toast.success('Mesa cerrada y comprobante generado');
      }
      setSelectedTable(null);
      setPaymentMethod('cash');
      setAmountPaid('');
    },
    onError: (err: any) => toast.error(err.message || 'Error al cerrar mesa'),
  });

  const allItems = tableOrders.flatMap((o: any) => o.order_items || []);
  const grandTotal = tableOrders.reduce((s: number, o: any) => s + Number(o.total), 0);
  const paidNum = parseFloat(amountPaid) || 0;
  const change = paymentMethod === 'cash' ? Math.max(0, paidNum - grandTotal) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Facturación</h1>
        <Button className="gap-2" onClick={() => setManualOpen(true)}>
          <FileText className="h-4 w-4" />
          Factura manual
        </Button>
      </div>

      {!isShiftOpen && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            No hay turno abierto. Debés abrir un turno para poder facturar.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open" className="gap-2">
            <DollarSign className="h-4 w-4" />
            Cuentas abiertas
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <FileText className="h-4 w-4" />
            Comprobantes
          </TabsTrigger>
        </TabsList>

        {/* === OPEN ACCOUNTS === */}
        <TabsContent value="open">
          {activeTables.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>No hay cuentas abiertas en este momento</p>
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {activeTables.map(table => (
                <Card
                  key={table.id}
                  className={`cursor-pointer border-2 transition-all hover:shadow-md ${STATUS_COLORS[table.status]}`}
                  onClick={() => {
                    if (!isShiftOpen) {
                      toast.error('No hay turno abierto.');
                      return;
                    }
                    setSelectedTable(table);
                    setPaymentMethod('cash');
                    setAmountPaid('');
                  }}
                >
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold">{table.number}</div>
                    <Badge variant="outline" className="mt-1">{STATUS_LABELS[table.status]}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* === INVOICE HISTORY === */}
        <TabsContent value="history">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Fecha</Label>
                <Input
                  type="date"
                  value={dateFilter}
                  onChange={e => setDateFilter(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Buscar mesa</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Nº mesa"
                    value={searchTable}
                    onChange={e => setSearchTable(e.target.value)}
                    className="pl-8 w-32"
                  />
                </div>
              </div>
            </div>

            {filteredInvoices.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p>No hay comprobantes para esta fecha</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Mesa</TableHead>
                    <TableHead>Hora</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-center">Fiscal</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoicesList.visible.map((inv: any) => {
                    const fiscal = fiscalInvoices.find((fi: any) => fi.invoice_id === inv.id && !fi.is_credit_note);
                    const hasNC = fiscalInvoices.some((fi: any) => fi.invoice_id === inv.id && fi.is_credit_note);
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                        <TableCell>{tableCell(inv.table_number)}</TableCell>
                        <TableCell className="text-xs">
                          {format(new Date(inv.created_at), 'HH:mm', { locale: es })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{PAYMENT_LABELS[inv.payment_method] || inv.payment_method}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">${Number(inv.total).toFixed(2)}</TableCell>
                        <TableCell className="text-center">
                          {fiscal ? (
                            hasNC ? (
                              <Badge variant="outline" className="text-orange-600 border-orange-600">NC emitida</Badge>
                            ) : (
                              <Badge variant="outline" className="text-green-600 border-green-600">CAE ✓</Badge>
                            )
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">Sin facturar</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex gap-1 justify-center">
                            <Button size="icon" variant="ghost" onClick={() => setViewingInvoice(inv)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Reimprimir duplicado (cliente + control)"
                              onClick={() => {
                                setViewingInvoice(null);
                                setReprintTicket({
                                  tableNumber: inv.table_number,
                                  invoiceNumber: inv.invoice_number,
                                  items: (inv.items || []) as any,
                                  total: Number(inv.total),
                                  tipAmount: Number(inv.tip_amount || 0),
                                  paymentMethod: inv.payment_method,
                                  amountPaid: Number(inv.amount_paid || 0),
                                  changeAmount: Number(inv.change_amount || 0),
                                  createdAt: inv.created_at,
                                  establishmentName: establishment?.name,
                                });
                                
                              }}
                            >
                              <Printer className="h-4 w-4" />
                            </Button>

                            {fiscal && fiscal.cae && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 text-xs"
                                title="Vista previa / imprimir ticket fiscal 80mm"
                                onClick={() => {
                                  setReprintTicket(null);
                                  setFiscalTicket({
                                    tipo_cbte: fiscal.tipo_cbte,
                                    punto_venta: fiscal.punto_venta,
                                    cbte_numero: fiscal.cbte_numero,
                                    cae: fiscal.cae,
                                    cae_vto: fiscal.cae_vto,
                                    created_at: fiscal.created_at,
                                    total: Number(fiscal.total ?? inv.total),
                                    neto_gravado: fiscal.neto_gravado,
                                    iva_amount: fiscal.iva_amount,
                                    payment_method: fiscal.payment_method || inv.payment_method,
                                    receptor_cuit: fiscal.receptor_cuit,
                                    receptor_razon_social: fiscal.receptor_razon_social,
                                    receptor_condicion_iva: fiscal.receptor_condicion_iva,
                                    is_credit_note: fiscal.is_credit_note,
                                    items: (fiscal.items_detail || inv.items || []) as any,
                                  });
                                }}
                              >
                                <Printer className="h-3 w-3" />
                                Ticket fiscal
                              </Button>
                            )}

                            {!fiscal && (
                              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setFiscalInvoice(inv)}>
                                <FileCheck className="h-3 w-3" />
                                Facturar
                              </Button>

                            )}
                            {fiscal && !hasNC && (
                              <Button size="sm" variant="outline" className="gap-1 text-xs text-orange-600" onClick={() => setCreditNoteInvoice(fiscal)}>
                                <FileX className="h-3 w-3" />
                                NC
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            <ShowMoreButton hiddenCount={invoicesList.hiddenCount} expanded={invoicesList.expanded} onToggle={() => invoicesList.setExpanded(!invoicesList.expanded)} />
          </div>
        </TabsContent>
      </Tabs>

      {/* === CHARGE DIALOG === */}
      <Dialog open={!!selectedTable} onOpenChange={v => { if (!v) { setSelectedTable(null); setAmountPaid(''); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Mesa {selectedTable?.number} — Cobrar y facturar</DialogTitle>
          </DialogHeader>

          {tableOrders.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">Sin pedidos activos</p>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-center">Cant.</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allItems.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-sm">{item.products?.name}</TableCell>
                      <TableCell className="text-center">{item.quantity}</TableCell>
                      <TableCell className="text-right">${(Number(item.unit_price) * item.quantity).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between font-bold text-lg border-t pt-3">
                <span>Total</span>
                <span>${grandTotal.toFixed(2)}</span>
              </div>

              <div className="space-y-3 border-t pt-4">
                <Label className="text-sm font-semibold">Método de pago</Label>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_METHODS.map(pm => (
                    <Button
                      key={pm.value}
                      variant={paymentMethod === pm.value ? 'default' : 'outline'}
                      className="gap-2"
                      onClick={() => {
                        setPaymentMethod(pm.value);
                        if (pm.value !== 'cash') setAmountPaid('');
                      }}
                    >
                      <pm.icon className="h-4 w-4" />
                      {pm.label}
                    </Button>
                  ))}
                </div>

                {paymentMethod === 'cash' && (
                  <div className="space-y-2">
                    <Label htmlFor="amountPaid">Monto recibido</Label>
                    <Input
                      id="amountPaid"
                      type="number"
                      placeholder="0.00"
                      value={amountPaid}
                      onChange={e => setAmountPaid(e.target.value)}
                      min={0}
                      step="0.01"
                    />
                    {paidNum > 0 && paidNum >= grandTotal && (
                      <div className="flex items-center justify-between bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                        <span className="font-semibold text-green-700">Vuelto</span>
                        <span className="text-xl font-bold text-green-700">${change.toFixed(2)}</span>
                      </div>
                    )}
                    {paidNum > 0 && paidNum < grandTotal && (
                      <p className="text-sm text-destructive">Monto insuficiente (faltan ${(grandTotal - paidNum).toFixed(2)})</p>
                    )}
                  </div>
                )}
              </div>

              <Button
                className="w-full gap-2"
                onClick={() => closeAndInvoice.mutate()}
                disabled={
                  closeAndInvoice.isPending ||
                  (paymentMethod === 'cash' && (paidNum < grandTotal || paidNum === 0))
                }
              >
                <DollarSign className="h-4 w-4" />
                Cobrar y facturar — ${grandTotal.toFixed(2)}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* === VIEW INVOICE DIALOG === */}
      <Dialog open={!!viewingInvoice} onOpenChange={v => { if (!v) setViewingInvoice(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Comprobante #{viewingInvoice?.invoice_number}</DialogTitle>
          </DialogHeader>
          {viewingInvoice && (
            <InvoiceTicket
              invoice={viewingInvoice}
              establishmentName={establishment?.name}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* === FISCAL INVOICE DIALOG === */}
      <FiscalInvoiceDialog
        open={!!fiscalInvoice}
        onOpenChange={(v) => { if (!v) setFiscalInvoice(null); }}
        invoice={fiscalInvoice}
        condicionIvaEmisor={establishment?.condicion_iva || 'monotributo'}
        onAuthorized={(t) => { setReprintTicket(null); setFiscalTicket(t); }}
      />

      {/* === FACTURA MANUAL === */}
      <ManualInvoiceDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        condicionIvaEmisor={establishment?.condicion_iva || 'monotributo'}
        onAuthorized={(t) => { setReprintTicket(null); setFiscalTicket(t); }}
      />

      {/* === CREDIT NOTE DIALOG === */}
      <CreditNoteDialog
        open={!!creditNoteInvoice}
        onOpenChange={(v) => { if (!v) setCreditNoteInvoice(null); }}
        fiscalInvoice={creditNoteInvoice}
      />

      {/* === TICKET FISCAL 80mm (factura ya autorizada) === */}
      <FiscalTicketDialog
        open={!!fiscalTicket}
        onOpenChange={(v) => { if (!v) setFiscalTicket(null); }}
        data={fiscalTicket}
        emisor={{
          nombre: establishment?.name,
          razon_social: (establishment as any)?.razon_social,
          cuit: (establishment as any)?.cuit,
          domicilio: (establishment as any)?.domicilio_comercial,
          condicion_iva: establishment?.condicion_iva,
        }}
      />

      {/* Print-only: duplicate ticket (cliente + control) */}
      {reprintTicket && <CloseTicket data={reprintTicket} reprint />}
    </div>
  );
}
