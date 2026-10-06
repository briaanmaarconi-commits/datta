import { useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { useActiveShift } from '@/hooks/useActiveShift';
import { useTipMode } from '@/hooks/useTipMode';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { DollarSign, CreditCard, Banknote, Smartphone, AlertTriangle, Gift, HandCoins, Receipt, Plus, X, Utensils, Sparkles } from 'lucide-react';
import CourtesyDialog from '@/components/shared/CourtesyDialog';
import { useCloseTableAsCourtesy, CourtesyType } from '@/hooks/useCloseTableAsCourtesy';
import PreBillTicket from '@/components/cashier/PreBillTicket';
import CloseTicket, { CloseTicketData } from '@/components/cashier/CloseTicket';
import AddProductsDialog, { CartLine } from '@/components/cashier/AddProductsDialog';
import { printTicketPortal } from '@/lib/print';
import { getOrdersCutoff } from '@/lib/shiftScope';
import { useAuditLog } from '@/hooks/useAuditLog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getTableVisualState } from '@/lib/tableStatus';
import TableStatusLegend from '@/components/shared/TableStatusLegend';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Efectivo', icon: Banknote },
  { value: 'card', label: 'Tarjeta', icon: CreditCard },
  { value: 'transfer', label: 'Transferencia', icon: Smartphone },
];

export default function CashierTables() {
  const { establishmentId, session } = useAuth();
  const { isShiftOpen, activeShift } = useActiveShift();
  const ordersCutoff = getOrdersCutoff(activeShift as any);
  const { data: tipMode = 'individual' } = useTipMode(establishmentId);
  const queryClient = useQueryClient();
  const [selectedTable, setSelectedTable] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [tipAmount, setTipAmount] = useState('');
  const [tipWaiterId, setTipWaiterId] = useState<string>('');
  const [courtesyOpen, setCourtesyOpen] = useState(false);
  const [preBillOpen, setPreBillOpen] = useState(false);
  const [lastTicket, setLastTicket] = useState<CloseTicketData | null>(null);
  const [ticketReprint, setTicketReprint] = useState(false);
  const [printingClose, setPrintingClose] = useState(false);
  const [addProductsOpen, setAddProductsOpen] = useState(false);
  const { log: auditLog } = useAuditLog();

  useEffect(() => {
    if (!printingClose || !lastTicket) return;
    return printTicketPortal(() => setPrintingClose(false));
  }, [printingClose, lastTicket]);

  type ManualAdjustment = { id: string; name: string; qty: number; unit_price: number };
  const [adjustments, setAdjustments] = useState<ManualAdjustment[]>([]);
  const [adjName, setAdjName] = useState('');
  const [adjQty, setAdjQty] = useState('1');
  const [adjPrice, setAdjPrice] = useState('');
  // Items removed from the bill (not consumed / wrongly loaded)
  const [excludedItemIds, setExcludedItemIds] = useState<string[]>([]);
  // Motivo obligatorio cuando la mesa se cierra en $0
  const [zeroReason, setZeroReason] = useState('');


  const { data: tables = [] } = useQuery({
    queryKey: ['tables', establishmentId],
    queryFn: async () => {
      const { data, error } = await db.from('tables').select('*').eq('establishment_id', establishmentId!).order('number');
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
  });

  const { data: activeTableOrders = [] } = useQuery({
    queryKey: ['cashier-active-table-orders', establishmentId, ordersCutoff],
    queryFn: async () => {
      const { data, error } = await db
        .from('orders')
        .select('id, table_id, status')
        .eq('establishment_id', establishmentId!)
        .neq('channel', 'delivery')
        .in('status', ['new', 'preparing', 'ready', 'delivered'])
        .gte('created_at', ordersCutoff);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!establishmentId,
  });

  const { data: establishment } = useQuery({
    queryKey: ['establishment-name', establishmentId],
    queryFn: async () => {
      const { data } = await db.from('establishments').select('name').eq('id', establishmentId!).single();
      return data;
    },
    enabled: !!establishmentId,
  });

  // Realtime subscription
  useEffect(() => {
    if (!establishmentId) return;
    const channel = db
      .channel('cashier-tables-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter: `establishment_id=eq.${establishmentId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['tables', establishmentId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `establishment_id=eq.${establishmentId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['cashier-active-table-orders', establishmentId] });
      })
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, [establishmentId, queryClient]);

  // All non-closed orders of the table (any date). We split them into "current" (this shift / today)
  // and "stale" (left over from previous shifts) so old orders never get added to the customer's bill.
  const { data: allTableOrders = [] } = useQuery({
    queryKey: ['table-orders', selectedTable?.id],
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

  const tableOrders = useMemo(
    () => (allTableOrders as any[]).filter((o: any) => o.created_at >= ordersCutoff),
    [allTableOrders, ordersCutoff],
  );
  const staleOrders = useMemo(
    () => (allTableOrders as any[]).filter((o: any) => o.created_at < ordersCutoff),
    [allTableOrders, ordersCutoff],
  );

  const discardStaleOrders = useMutation({
    mutationFn: async () => {
      const ids = staleOrders.map((o: any) => o.id);
      if (ids.length === 0) return;
      const { error } = await db
        .from('orders')
        .update({ status: 'cancelled' as any })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['table-orders'] });
      toast.success('Pedidos viejos descartados');
    },
    onError: (e: any) => toast.error(e?.message || 'No se pudieron descartar'),
  });

  /** Agrega productos reales de la carta a la cuenta de la mesa (pedido del turno actual). */
  const addProductsToTable = useMutation({
    mutationFn: async ({ cart, sendToKitchen }: { cart: CartLine[]; sendToKitchen: boolean }) => {
      if (!selectedTable || cart.length === 0) return;
      const addedTotal = cart.reduce((s, l) => s + l.price * l.quantity, 0);
      const target = (tableOrders as any[])[0];
      const itemStatus = sendToKitchen ? 'pending' : 'ready';

      let orderId: string;
      if (target) {
        orderId = target.id;
        const { error } = await db.from('order_items').insert(
          cart.map(l => ({
            order_id: orderId,
            product_id: l.product_id,
            quantity: l.quantity,
            unit_price: l.price,
            status: itemStatus as any,
          })),
        );
        if (error) throw error;
        const update: any = { total: Number(target.total || 0) + addedTotal };
        if (sendToKitchen) update.status = 'new';
        const { error: uErr } = await db.from('orders').update(update).eq('id', orderId);
        if (uErr) throw uErr;
      } else {
        const { data: order, error } = await db
          .from('orders')
          .insert({
            table_id: selectedTable.id,
            establishment_id: establishmentId!,
            created_by: session?.user?.id,
            total: addedTotal,
            status: (sendToKitchen ? 'new' : 'delivered') as any,
          })
          .select()
          .single();
        if (error) throw error;
        orderId = order.id;
        const { error: iErr } = await db.from('order_items').insert(
          cart.map(l => ({
            order_id: orderId,
            product_id: l.product_id,
            quantity: l.quantity,
            unit_price: l.price,
            status: itemStatus as any,
          })),
        );
        if (iErr) throw iErr;
      }

      if (selectedTable.status === 'free') {
        await db.from('tables').update({ status: 'occupied' as any }).eq('id', selectedTable.id);
      }

      auditLog('cashier_add_items', 'order_items', orderId, {
        table_number: selectedTable.number,
        sent_to_kitchen: sendToKitchen,
        items: cart.map(l => ({ name: l.name, qty: l.quantity, unit_price: l.price })),
        total: addedTotal,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['table-orders'] });
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      setAddProductsOpen(false);
      toast.success('Productos agregados a la cuenta');
    },
    onError: (e: any) => toast.error(e?.message || 'No se pudieron agregar los productos'),
  });

  /** Elimina definitivamente un ítem cargado por error y recalcula el total del pedido. */
  const deleteOrderItem = useMutation({
    mutationFn: async (item: any) => {
      const order = (tableOrders as any[]).find((o: any) =>
        (o.order_items || []).some((i: any) => i.id === item.id),
      );
      const { error } = await db.from('order_items').delete().eq('id', item.id);
      if (error) throw error;
      if (order) {
        const newTotal = Math.max(
          0,
          Number(order.total || 0) - Number(item.unit_price) * Number(item.quantity),
        );
        await db.from('orders').update({ total: newTotal }).eq('id', order.id);
      }
      auditLog('cashier_delete_item', 'order_items', item.id, {
        table_number: selectedTable?.number,
        product: item.products?.name,
        qty: item.quantity,
        unit_price: Number(item.unit_price),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['table-orders'] });
      toast.success('Ítem eliminado del pedido');
    },
    onError: (e: any) => toast.error(e?.message || 'No se pudo eliminar el ítem'),
  });





  // Waiters list (only needed in 'individual' mode for the selector).
  // We fetch roles and profiles separately because there's no declared FK in types.
  const { data: waiters = [] } = useQuery({
    queryKey: ['waiters-list', establishmentId],
    queryFn: async () => {
      const { data: roles, error } = await db
        .from('user_roles')
        .select('user_id')
        .eq('establishment_id', establishmentId!)
        .eq('role', 'waiter');
      if (error) throw error;
      const ids = (roles || []).map((r: any) => r.user_id).filter(Boolean);
      if (ids.length === 0) return [] as any[];
      const { data: profs, error: pErr } = await db
        .from('profiles')
        .select('id, full_name, email')
        .in('id', ids);
      if (pErr) throw pErr;

      const profilesById = new Map<string, any>((profs || []).map((p: any) => [p.id, p] as [string, any]));
      return ids.map((id: string, index: number) => {
        const profile = profilesById.get(id);
        return {
          user_id: id,
          profiles: {
            full_name: profile?.full_name || (ids.length === 1 ? 'Mozo asignado' : `Mozo ${index + 1}`),
            email: profile?.email || null,
          },
        };
      });
    },
    enabled: !!establishmentId && tipMode === 'individual',
    staleTime: 5 * 60_000,
  });

  // Derive a "suggested waiter" from the oldest order's created_by
  const suggestedWaiterId = useMemo(() => {
    if (!tableOrders.length) return '';
    const sorted = [...tableOrders].sort((a: any, b: any) => a.created_at.localeCompare(b.created_at));
    return (sorted[0] as any)?.created_by || '';
  }, [tableOrders]);

  // Tip rules: in 'individual' mode, only card/transfer accept tips. In 'pool', any method.
  const canRegisterTip = tipMode === 'pool' || paymentMethod === 'card' || paymentMethod === 'transfer';
  const tipNum = parseFloat(tipAmount) || 0;

  const closeAllOrders = useMutation({
    mutationFn: async () => {
      const isZeroClose = grandTotal <= 0 && tableOrders.length > 0;
      if (isZeroClose && !zeroReason.trim()) {
        throw new Error('Indicá el motivo por el que la mesa se cierra en $0');
      }
      const paid = isZeroClose ? 0 : parseFloat(amountPaid);
      // For cash, the amount the customer hands over must cover total + tip (if pool/cash)
      const cashTipPart = paymentMethod === 'cash' && tipMode === 'pool' ? tipNum : 0;
      const cashRequired = grandTotal + cashTipPart;
      if (!isZeroClose && paymentMethod === 'cash' && (isNaN(paid) || paid < cashRequired)) {
        throw new Error('El monto pagado debe cubrir el total + propina en efectivo');
      }
      if (tipMode === 'individual' && tipNum > 0 && !tipWaiterId) {
        throw new Error('Seleccioná el mozo que recibe la propina');
      }


      // Cada pedido queda con el monto REALMENTE cobrado (sin ítems excluidos/eliminados).
      // Los ajustes manuales se imputan al primer pedido para que la suma coincida con la factura.
      for (let idx = 0; idx < tableOrders.length; idx++) {
        const order: any = tableOrders[idx];
        const orderItemsTotal = (order.order_items || [])
          .filter((i: any) => !excludedItemIds.includes(i.id))
          .reduce((s: number, i: any) => s + Number(i.unit_price) * Number(i.quantity), 0);
        const chargedTotal = orderItemsTotal + (idx === 0 ? adjustmentsTotal : 0);
        await db.from('orders').update({
          status: 'closed' as any,
          payment_method: paymentMethod,
          total: chargedTotal,
          amount_paid: paymentMethod === 'cash' && idx === 0 ? paid : chargedTotal,
        } as any).eq('id', order.id);
      }


      await db.from('tables').update({ status: 'free' as any }).eq('id', selectedTable!.id);

      // Auto-register SALES income (separate from tips)
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
          description: `Mesa ${selectedTable!.number} - ${paymentMethod === 'cash' ? 'Efectivo' : paymentMethod === 'card' ? 'Tarjeta' : 'Transferencia'}`,
          date: new Date().toISOString().split('T')[0],
          created_by: session?.user?.id || null,
        });
      }

      // Register TIP as neutral pair: income + matching expense (so balance is unaffected)
      // The expense represents the obligation to pay it out to the waiter (already accounted for).
      const tipToRegister = canRegisterTip ? tipNum : 0;
      let tipSettlementTxId: string | null = null;
      if (tipToRegister > 0) {
        const [{ data: tipIncomeCatId, error: incCatErr }, { data: tipPayoutCatId, error: payCatErr }] = await Promise.all([
          db.rpc('ensure_tips_income_category', { _establishment_id: establishmentId! }),
          db.rpc('ensure_tips_payout_category', { _establishment_id: establishmentId! }),
        ]);
        if (incCatErr) throw incCatErr;
        if (payCatErr) throw payCatErr;
        const waiterLabel = tipMode === 'individual' && tipWaiterId
          ? (waiters.find((w: any) => w.user_id === tipWaiterId)?.profiles?.full_name || 'Mozo')
          : 'Pozo común';
        const pmLabel = paymentMethod === 'cash' ? 'Efectivo' : paymentMethod === 'card' ? 'Tarjeta' : 'Transferencia';
        const today = new Date().toISOString().split('T')[0];

        // Income
        await db.from('finance_transactions').insert({
          establishment_id: establishmentId!,
          category_id: tipIncomeCatId as unknown as string,
          type: 'income',
          amount: tipToRegister,
          description: `Propina mesa ${selectedTable!.number} (${pmLabel}) — ${waiterLabel}`,
          date: today,
          created_by: session?.user?.id || null,
        });

        // Mirror expense (so caja stays neutral; this represents the payout obligation)
        const { data: expenseTx } = await db.from('finance_transactions').insert({
          establishment_id: establishmentId!,
          category_id: tipPayoutCatId as unknown as string,
          type: 'expense',
          amount: tipToRegister,
          description: `Propina a liquidar mesa ${selectedTable!.number} (${pmLabel}) — ${waiterLabel}`,
          date: today,
          created_by: session?.user?.id || null,
        }).select('id').single();
        tipSettlementTxId = expenseTx?.id || null;
      }

      // Auto-generate invoice
      // Cash: amount_paid is what customer handed over; change = paid - (total + cash-pool-tip)
      const actualPaid = paymentMethod === 'cash' ? parseFloat(amountPaid) : grandTotal + tipToRegister;
      const changeAmt = paymentMethod === 'cash' ? Math.max(0, parseFloat(amountPaid) - (grandTotal + cashTipPart)) : 0;
      // El snapshot guarda SIEMPRE el detalle completo, incluidos los ítems excluidos
      // (marcados como `excluded`), para que ninguna factura quede sin detalle.
      const rawItems = tableOrders.flatMap((o: any) => o.order_items || []);
      const excludedSnapshot = rawItems
        .filter((i: any) => excludedItemIds.includes(i.id))
        .map((item: any) => ({
          name: item.products?.name || 'Producto',
          qty: item.quantity,
          unit_price: Number(item.unit_price),
          subtotal: 0,
          excluded: true,
        }));
      const itemsSnapshot = [
        ...allItems.map((item: any) => ({
          name: item.products?.name || 'Producto',
          qty: item.quantity,
          unit_price: Number(item.unit_price),
          subtotal: Number(item.unit_price) * item.quantity,
        })),
        ...adjustments.map(a => ({
          name: a.name,
          qty: a.qty,
          unit_price: a.unit_price,
          subtotal: a.qty * a.unit_price,
          manual: true,
        })),
        ...excludedSnapshot,
      ];

      const { data: invoiceRow } = await db.from('invoices').insert({
        establishment_id: establishmentId!,
        table_number: selectedTable!.number,
        order_ids: tableOrders.map((o: any) => o.id),
        items: itemsSnapshot,
        total: grandTotal,
        payment_method: paymentMethod,
        amount_paid: actualPaid,
        change_amount: changeAmt,
        created_by: session?.user?.id || null,
        tip_amount: tipToRegister,
        tip_payment_method: tipToRegister > 0 ? paymentMethod : null,
        tip_waiter_id: tipMode === 'individual' && tipToRegister > 0 ? tipWaiterId : null,
        tip_mode: tipToRegister > 0 ? tipMode : null,
      } as any).select('id, invoice_number, created_at').maybeSingle();

      // Descuenta el stock de los productos de reventa (bebidas, etc.).
      // Los platos elaborados no se tocan. Es idempotente por comprobante.
      if ((invoiceRow as any)?.id) {
        const { error: stockErr } = await db.rpc('apply_sale_stock' as any, {
          _invoice_id: (invoiceRow as any).id,
        });
        if (stockErr) console.error('apply_sale_stock', stockErr);
      }


      if (isZeroClose || excludedSnapshot.length > 0) {
        await db.from('audit_logs').insert({
          establishment_id: establishmentId!,
          user_id: session?.user?.id || null,
          action: isZeroClose ? 'close_table_zero' : 'close_table_excluded_items',
          table_name: 'invoices',
          record_id: String((invoiceRow as any)?.invoice_number ?? ''),
          details: {
            table_number: selectedTable!.number,
            total: grandTotal,
            reason: zeroReason.trim() || null,
            excluded_items: excludedSnapshot,
            order_ids: tableOrders.map((o: any) => o.id),
          },
        } as any);
      }


      const ticket: CloseTicketData = {
        tableNumber: selectedTable!.number,
        invoiceNumber: (invoiceRow as any)?.invoice_number ?? null,
        items: itemsSnapshot,
        total: grandTotal,
        tipAmount: tipToRegister,
        paymentMethod,
        amountPaid: actualPaid,
        changeAmount: changeAmt,
        createdAt: (invoiceRow as any)?.created_at || new Date().toISOString(),
        establishmentName: establishment?.name,
      };
      return ticket;
    },
    onSuccess: (ticket: CloseTicketData) => {
      const paid = parseFloat(amountPaid);
      const cashTipPart = paymentMethod === 'cash' && tipMode === 'pool' ? tipNum : 0;
      const change = paymentMethod === 'cash' ? Math.max(0, paid - (grandTotal + cashTipPart)) : 0;
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      queryClient.invalidateQueries({ queryKey: ['table-orders'] });
      queryClient.invalidateQueries({ queryKey: ['tip-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['finance-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['direct-stock-products'] });


      if (change > 0) {
        toast.success(`Mesa cerrada. Vuelto: $${change.toFixed(2)}`);
      } else {
        toast.success('Mesa cerrada correctamente');
      }
      setSelectedTable(null);
      setPaymentMethod('cash');
      setAmountPaid('');
      setTipAmount('');
      setTipWaiterId('');
      setAdjustments([]);
      setExcludedItemIds([]);
      setZeroReason('');
      // Print both copies (cliente + control) in a single job
      setLastTicket(ticket);
      setTicketReprint(false);
      setPrintingClose(true);
    },

    onError: (err: any) => toast.error(err.message || 'Error al cerrar mesa'),
  });

  const allItems = useMemo(
    () => tableOrders.flatMap((o: any) => o.order_items || []).filter((i: any) => !excludedItemIds.includes(i.id)),
    [tableOrders, excludedItemIds],
  );
  const ordersTotal = allItems.reduce((s: number, i: any) => s + Number(i.unit_price) * Number(i.quantity), 0);
  const adjustmentsTotal = adjustments.reduce((s, a) => s + a.qty * a.unit_price, 0);
  const grandTotal = ordersTotal + adjustmentsTotal;
  const isZeroClose = grandTotal <= 0 && tableOrders.length > 0;
  const paidNum = parseFloat(amountPaid) || 0;
  // In cash + pool mode, the customer also hands over the tip; cash-required is total + tip
  const cashTipPart = paymentMethod === 'cash' && tipMode === 'pool' ? tipNum : 0;
  const cashRequired = grandTotal + cashTipPart;
  const change = paymentMethod === 'cash' ? Math.max(0, paidNum - cashRequired) : 0;

  // Combined items list for pre-bill ticket and final invoice snapshot
  const combinedItems = useMemo(() => {
    const orig = allItems.map((item: any) => ({
      name: item.products?.name || 'Producto',
      qty: item.quantity,
      unit_price: Number(item.unit_price),
      subtotal: Number(item.unit_price) * item.quantity,
      manual: false,
    }));
    const manual = adjustments.map(a => ({
      name: a.name,
      qty: a.qty,
      unit_price: a.unit_price,
      subtotal: a.qty * a.unit_price,
      manual: true,
    }));
    return [...orig, ...manual];
  }, [allItems, adjustments]);

  const addAdjustment = (name?: string, price?: string) => {
    const finalName = (name ?? adjName).trim();
    const finalQty = parseFloat(adjQty);
    const finalPrice = parseFloat(price ?? adjPrice);
    if (!finalName || isNaN(finalQty) || finalQty === 0 || isNaN(finalPrice)) {
      toast.error('Completá nombre, cantidad y precio del ítem');
      return;
    }
    setAdjustments(prev => [
      ...prev,
      { id: crypto.randomUUID(), name: finalName, qty: finalQty, unit_price: finalPrice },
    ]);
    setAdjName('');
    setAdjQty('1');
    setAdjPrice('');
  };

  const removeAdjustment = (id: string) => {
    setAdjustments(prev => prev.filter(a => a.id !== id));
  };

  /** Quita el ítem de la cuenta (no se cobra). No genera renglones con cantidad negativa. */
  const excludeOrderItem = (item: any) => {
    const name = item.products?.name || 'Producto';
    setExcludedItemIds(prev => (prev.includes(item.id) ? prev : [...prev, item.id]));
    toast.success(`${name} quitado de la cuenta`);
  };

  // Pre-fill the waiter selector: priority = suggested > single waiter > first waiter.
  // Runs whenever the dialog opens or the waiters list finishes loading.
  useEffect(() => {
    if (!selectedTable || tipMode !== 'individual') return;
    if (waiters.length === 0) return;
    if (tipWaiterId && waiters.some((w: any) => w.user_id === tipWaiterId)) return;

    if (suggestedWaiterId && waiters.some((w: any) => w.user_id === suggestedWaiterId)) {
      setTipWaiterId(suggestedWaiterId);
    } else {
      setTipWaiterId(waiters[0].user_id);
    }
  }, [selectedTable, suggestedWaiterId, tipMode, waiters, tipWaiterId]);

  const courtesyMutation = useCloseTableAsCourtesy({
    onSuccess: ({ totalCost }) => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      queryClient.invalidateQueries({ queryKey: ['table-orders'] });
      queryClient.invalidateQueries({ queryKey: ['finance_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      toast.success(`Mesa cerrada como cortesía. Costo registrado: $${totalCost.toFixed(2)}`);
      setCourtesyOpen(false);
      setSelectedTable(null);
    },
    onError: (e: any) => toast.error(e?.message || 'Error al cerrar como cortesía'),
  });

  const handleCourtesy = (type: CourtesyType, notes: string, accountId: string | null) => {
    if (!selectedTable || tableOrders.length === 0) return;
    courtesyMutation.mutate({
      establishmentId: establishmentId!,
      userId: session?.user?.id ?? null,
      tableId: selectedTable.id,
      tableNumber: selectedTable.number,
      orderIds: tableOrders.map((o: any) => o.id),
      courtesyType: type,
      notes,
      accountId,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
        <h1 className="text-3xl font-bold tracking-tight">Mesas</h1>
        {lastTicket && (
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              setTicketReprint(true);
              setPrintingClose(true);
            }}
          >
            <Receipt className="h-4 w-4" />
            Reimprimir ticket — Mesa {lastTicket.tableNumber}
          </Button>
        )}
      </div>


      {!isShiftOpen && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            No hay turno abierto. Debés abrir un turno desde "Resumen de turno" para poder cobrar mesas.
          </AlertDescription>
        </Alert>
      )}

      <TableStatusLegend />

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {tables.map(table => {
          const visualState = getTableVisualState(table, activeTableOrders.filter(order => order.table_id === table.id));
          return (
          <Card
            key={table.id}
            className={`cursor-pointer border-2 transition-all hover:shadow-md ${visualState.cardClass}`}
            onClick={() => {
              if (!isShiftOpen) {
                toast.error('No hay turno abierto. Abrí un turno primero.');
                return;
              }
              setSelectedTable(table);
              setPaymentMethod('cash');
              setAmountPaid('');
              setTipAmount('');
              setTipWaiterId('');
              setAdjustments([]);
              setExcludedItemIds([]);
            }}
          >
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{table.number}</div>
              <Badge variant="outline" className="mt-1">{visualState.label}</Badge>
            </CardContent>
          </Card>
          );
        })}
      </div>

      <Dialog open={!!selectedTable} onOpenChange={v => { if (!v) { setSelectedTable(null); setAmountPaid(''); setTipAmount(''); setTipWaiterId(''); setAdjustments([]); setExcludedItemIds([]); setZeroReason(''); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Mesa {selectedTable?.number} — Detalle de cuenta</DialogTitle>
          </DialogHeader>

          {staleOrders.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="space-y-2">
                <p>
                  Esta mesa tiene {staleOrders.length} pedido(s) fuera del turno actual. No se suman a esta cuenta.
                </p>
                <ul className="text-xs space-y-0.5">
                  {staleOrders.map((o: any) => (
                    <li key={o.id}>
                      {new Date(o.created_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      {' — '}${Number(o.total || 0).toLocaleString('es-AR')}
                    </li>
                  ))}
                </ul>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline" disabled={discardStaleOrders.isPending}>
                      Descartar pedidos viejos
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Descartar {staleOrders.length} pedido(s)?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Se cancelarán definitivamente y no se cobrarán. Total involucrado: $
                        {staleOrders.reduce((s: number, o: any) => s + Number(o.total || 0), 0).toLocaleString('es-AR')}.
                        Revisá antes que no sean consumos reales de esta mesa.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => discardStaleOrders.mutate()}>
                        Sí, descartar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </AlertDescription>
            </Alert>
          )}


          {tableOrders.length === 0 ? (
            <div className="text-center py-6 space-y-3">
              <p className="text-muted-foreground">Sin pedidos activos</p>
              <Button variant="outline" className="gap-2" onClick={() => setAddProductsOpen(true)}>
                <Plus className="h-4 w-4" />
                Agregar productos de la carta
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-center">Cant.</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allItems.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-sm">{item.products?.name}</TableCell>
                      <TableCell className="text-center">{item.quantity}</TableCell>
                      <TableCell className="text-right">${(Number(item.unit_price) * item.quantity).toFixed(2)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              title="Quitar o eliminar ítem"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="z-[100] w-64">
                            <DropdownMenuItem onClick={() => excludeOrderItem(item)}>
                              <div>
                                <p className="text-sm">Quitar de la cuenta</p>
                                <p className="text-[11px] text-muted-foreground">
                                  No se cobra, el pedido queda registrado.
                                </p>
                              </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => deleteOrderItem.mutate(item)}
                            >
                              <div>
                                <p className="text-sm">Eliminar el ítem</p>
                                <p className="text-[11px] text-muted-foreground">
                                  Se borra del pedido (cargado por error).
                                </p>
                              </div>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {adjustments.map(a => (
                    <TableRow key={a.id} className="bg-muted/30">
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-2">
                          <span>{a.name}</span>
                          <Badge variant="outline" className="text-[10px]">Manual</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{a.qty}</TableCell>
                      <TableCell className="text-right">${(a.qty * a.unit_price).toFixed(2)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeAdjustment(a.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => setAddProductsOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Agregar productos de la carta
              </Button>


              {/* Manual adjustments */}
              <div className="space-y-2 border-t pt-3">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Agregar ítem manual
                </Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => addAdjustment('Cubiertos', '500')}
                  >
                    <Utensils className="h-3.5 w-3.5" /> Cubiertos $500
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => addAdjustment('Servicio de mesa', '1000')}
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Servicio $1000
                  </Button>
                </div>
                <div className="grid grid-cols-12 gap-2">
                  <Input
                    className="col-span-6"
                    placeholder="Concepto"
                    value={adjName}
                    onChange={e => setAdjName(e.target.value)}
                  />
                  <Input
                    className="col-span-2"
                    type="number"
                    placeholder="Cant."
                    value={adjQty}
                    onChange={e => setAdjQty(e.target.value)}
                  />
                  <Input
                    className="col-span-3"
                    type="number"
                    placeholder="Precio"
                    value={adjPrice}
                    onChange={e => setAdjPrice(e.target.value)}
                  />
                  <Button
                    type="button"
                    size="icon"
                    className="col-span-1"
                    onClick={() => addAdjustment()}
                    title="Agregar"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Tip: usá cantidad negativa para descontar algo facturado de más.
                </p>
              </div>

              <div className="flex items-center justify-between font-bold text-lg border-t pt-3">
                <span>Total</span>
                <span>${grandTotal.toFixed(2)}</span>
              </div>

              {isZeroClose && (
                <div className="space-y-2 border border-destructive/40 bg-destructive/5 rounded-lg p-3">
                  <Label className="text-sm font-semibold flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    Motivo del cierre en $0
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    La mesa tiene pedidos pero el total a cobrar es $0. Indicá por qué (cortesía, error de carga, anulación).
                  </p>
                  <Input
                    placeholder="Ej: cortesía de la casa / ítems cargados por error"
                    value={zeroReason}
                    onChange={e => setZeroReason(e.target.value)}
                  />
                </div>
              )}


              {/* Pre-bill button */}
              <Button
                variant="secondary"
                className="w-full gap-2"
                onClick={() => setPreBillOpen(true)}
              >
                <Receipt className="h-4 w-4" />
                Imprimir pre-cuenta para la mesa
              </Button>

              {/* Payment section */}
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
                    {paidNum > 0 && paidNum >= cashRequired && (
                      <div className="flex items-center justify-between bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                        <span className="font-semibold text-green-700">Vuelto</span>
                        <span className="text-xl font-bold text-green-700">${change.toFixed(2)}</span>
                      </div>
                    )}
                    {paidNum > 0 && paidNum < cashRequired && (
                      <p className="text-sm text-destructive">Monto insuficiente (faltan ${(cashRequired - paidNum).toFixed(2)})</p>
                    )}
                  </div>
                )}
              </div>

              {/* Tip section */}
              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center gap-2">
                  <HandCoins className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-semibold">Propina</Label>
                  <Badge variant="outline" className="text-xs">
                    {tipMode === 'pool' ? 'Pozo común' : 'Individual'}
                  </Badge>
                </div>
                {!canRegisterTip ? (
                  <p className="text-xs text-muted-foreground">
                    En modo individual, las propinas en efectivo se las lleva el mozo directo y no se registran.
                  </p>
                ) : (
                  <>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={tipAmount}
                      onChange={e => setTipAmount(e.target.value)}
                      min={0}
                      step="0.01"
                    />
                    {tipMode === 'individual' && tipNum > 0 && (
                      <div className="space-y-1">
                        <Label className="text-xs">Mozo que recibe</Label>
                        {waiters.length === 0 ? (
                          <Alert>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription className="text-xs">
                              No hay mozos cargados. La propina quedará sin asignar (el admin debe registrar el personal en "Personal").
                            </AlertDescription>
                          </Alert>
                        ) : (
                          <Select value={tipWaiterId} onValueChange={setTipWaiterId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar mozo" />
                            </SelectTrigger>
                            <SelectContent position="popper" className="z-[100]">
                              {waiters.map((w: any) => (
                                <SelectItem key={w.user_id} value={w.user_id}>
                                  {w.profiles?.full_name || w.profiles?.email || 'Mozo'}
                                  {w.user_id === suggestedWaiterId ? ' (sugerido)' : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}
                    {tipMode === 'pool' && paymentMethod === 'cash' && tipNum > 0 && (
                      <p className="text-xs text-muted-foreground">
                        El cliente debe entregar ${cashRequired.toFixed(2)} (total + propina).
                      </p>
                    )}
                  </>
                )}
              </div>

              <Button
                className="w-full gap-2"
                onClick={() => closeAllOrders.mutate()}
                disabled={
                  closeAllOrders.isPending ||
                  (isZeroClose && !zeroReason.trim()) ||
                  (!isZeroClose && paymentMethod === 'cash' && (paidNum < cashRequired || paidNum === 0)) ||
                  (tipMode === 'individual' && canRegisterTip && tipNum > 0 && !tipWaiterId && waiters.length > 0)
                }
              >
                <DollarSign className="h-4 w-4" />
                Cerrar mesa — ${(grandTotal + (canRegisterTip ? tipNum : 0)).toFixed(2)}
              </Button>

              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => setCourtesyOpen(true)}
                disabled={courtesyMutation.isPending}
              >
                <Gift className="h-4 w-4" />
                Cerrar como cortesía (sin cobro)
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Pre-bill dialog */}
      <Dialog open={preBillOpen} onOpenChange={setPreBillOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pre-cuenta — Mesa {selectedTable?.number}</DialogTitle>
          </DialogHeader>
          {selectedTable && (
            <PreBillTicket
              tableNumber={selectedTable.number}
              items={combinedItems}
              total={grandTotal}
              establishmentName={establishment?.name}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Print-only: two copies (cliente + control) of the last closed table */}
      {printingClose && lastTicket && <CloseTicket data={lastTicket} reprint={ticketReprint} />}

      <CourtesyDialog
        open={courtesyOpen}
        onOpenChange={setCourtesyOpen}
        onConfirm={handleCourtesy}
        isPending={courtesyMutation.isPending}
        tableNumber={selectedTable?.number}
        total={grandTotal}
      />

      <AddProductsDialog
        open={addProductsOpen}
        onOpenChange={setAddProductsOpen}
        establishmentId={establishmentId}
        tableNumber={selectedTable?.number}
        isSubmitting={addProductsToTable.isPending}
        onConfirm={(cart, sendToKitchen) => addProductsToTable.mutate({ cart, sendToKitchen })}
      />
    </div>
  );
}
