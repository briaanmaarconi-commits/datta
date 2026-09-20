import { createPortal } from 'react-dom';

export interface KitchenTicketItem {
  id: string;
  quantity: number;
  name: string;
  notes?: string | null;
}

export interface KitchenTicketData {
  establishmentName?: string;
  tableNumber?: number | string;
  sectorName?: string | null;
  createdAt: string;
  isAddition?: boolean;
  reprint?: boolean;
  items: KitchenTicketItem[];
}

export function KitchenTicketBody({ data }: { data: KitchenTicketData }) {
  const date = new Date(data.createdAt);
  return (
    <div>
      <div className="text-center mb-2">
        <p className="font-bold text-base">{data.establishmentName || 'Cocina'}</p>
        <p className="font-bold text-base border-y border-dashed border-foreground py-0.5 my-1">
          {data.isAddition ? 'COMANDA - AGREGADO' : 'COMANDA'}
        </p>
        {data.reprint && <p className="text-xs font-bold">*** REIMPRESIÓN ***</p>}
        <p className="text-2xl font-bold leading-tight">MESA {data.tableNumber ?? '-'}</p>
        {data.sectorName && <p className="text-xs">Sector: {data.sectorName}</p>}
        <p className="text-xs">
          {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      <div className="border-t border-dashed border-foreground pt-2 space-y-2">
        {data.items.map((item) => (
          <div key={item.id}>
            <p className="text-lg font-bold leading-tight">
              {item.quantity} x {item.name}
            </p>
            {item.notes && <p className="text-sm pl-4">&gt; {item.notes}</p>}
          </div>
        ))}
      </div>

      <div className="border-t border-dashed border-foreground mt-3 pt-2 text-center text-xs">
        <p>------------------------------</p>
      </div>
    </div>
  );
}

export function KitchenTicket({ data }: { data: KitchenTicketData }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="print-portal print-ticket">
      <KitchenTicketBody data={data} />
    </div>,
    document.body
  );
}

