import { useState, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Maximize2, Minimize2 } from 'lucide-react';

export type ChartPeriod = 'day' | 'week' | 'month' | 'year' | 'custom';

const PERIOD_OPTIONS = [
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'year', label: 'Anual' },
  { value: 'custom', label: 'Personalizado' },
];

interface ExpandableChartCardProps {
  title: ReactNode;
  subtitle?: string;
  children: (height: number) => ReactNode;
  normalHeight?: number;
  expandedHeight?: number;
  /** If true, shows a period selector in the card header */
  showPeriodFilter?: boolean;
  period?: ChartPeriod;
  onPeriodChange?: (period: ChartPeriod) => void;
  customFrom?: string;
  customTo?: string;
  onCustomFromChange?: (v: string) => void;
  onCustomToChange?: (v: string) => void;
}

export default function ExpandableChartCard({
  title,
  subtitle,
  children,
  normalHeight = 220,
  expandedHeight = 500,
  showPeriodFilter = false,
  period,
  onPeriodChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
}: ExpandableChartCardProps) {
  const [expanded, setExpanded] = useState(false);

  const periodSelector = showPeriodFilter && period && onPeriodChange ? (
    <div className="flex items-center gap-2 flex-shrink-0">
      <Select value={period} onValueChange={(v) => onPeriodChange(v as ChartPeriod)}>
        <SelectTrigger className="h-7 text-xs w-[110px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {PERIOD_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {period === 'custom' && (
        <div className="flex gap-1">
          <Input type="date" value={customFrom || ''} onChange={e => onCustomFromChange?.(e.target.value)} className="h-7 text-xs w-[120px]" />
          <Input type="date" value={customTo || ''} onChange={e => onCustomToChange?.(e.target.value)} className="h-7 text-xs w-[120px]" />
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      <Card className="relative group">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <CardTitle className="text-base flex items-center gap-2">{title}</CardTitle>
              {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-2">
              {periodSelector}
              <button
                onClick={() => setExpanded(true)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-muted text-muted-foreground flex-shrink-0"
                title="Expandir gráfico"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>{children(normalHeight)}</CardContent>
      </Card>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-[90vw] w-full max-h-[90vh]">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <DialogTitle className="text-lg flex items-center gap-2">{title}</DialogTitle>
              <div className="flex items-center gap-2">
                {periodSelector}
                <button
                  onClick={() => setExpanded(false)}
                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                  title="Reducir gráfico"
                >
                  <Minimize2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </DialogHeader>
          <div className="mt-2">{children(expandedHeight)}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}
