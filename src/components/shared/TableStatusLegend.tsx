import { TABLE_STATUS_LEGEND } from '@/lib/tableStatus';

export default function TableStatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border bg-card px-3 py-2" aria-label="Referencia de colores de mesas">
      <span className="text-xs font-medium text-muted-foreground">Estados:</span>
      {TABLE_STATUS_LEGEND.map(item => (
        <span key={item.key} className="flex items-center gap-1.5 text-xs">
          <span className={`h-2.5 w-2.5 rounded-full ${item.dotClass}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
