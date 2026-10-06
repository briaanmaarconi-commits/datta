import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useState, useEffect, useRef } from 'react';
import { getTableVisualState } from '@/lib/tableStatus';

interface FloorElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  tableId?: string;
  label?: string;
  shape?: 'round' | 'rect';
  chairs?: number;
  points?: { x: number; y: number }[];
}

interface FloorPlanData {
  elements: FloorElement[];
  width: number;
  height: number;
}


const ELEMENT_COLORS: Record<string, string> = {
  bar: '#8B4513',
  kitchen: '#6B7280',
  bathroom: '#3B82F6',
  reception: '#8B5CF6',
  wall: '#374151',
  decoration: '#059669',
  stairs: '#78716C',
  cashier: '#D97706',
  lounge: '#7C3AED',
  planter: '#16A34A',
  parking: '#64748B',
  divider: '#A8A29E',
  stage: '#EC4899',
  column: '#57534E',
  firepit: '#DC2626',
  'door-entry': '#16A34A',
  'door-exit': '#DC2626',
  window: '#38BDF8',
};

interface FloorPlanViewProps {
  onTableClick: (table: any) => void;
  tables: any[];
  activeOrders: any[];
}

export default function FloorPlanView({ onTableClick, tables, activeOrders }: FloorPlanViewProps) {
  const { establishmentId } = useAuth();
  const [selectedSector, setSelectedSector] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const { data: sectors = [] } = useQuery({
    queryKey: ['sectors', establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase.from('sectors').select('*').eq('establishment_id', establishmentId!).order('sort_order');
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
  });

  const { data: floorPlan } = useQuery({
    queryKey: ['floor-plan', establishmentId, selectedSector],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('floor_plans').select('*')
        .eq('establishment_id', establishmentId!)
        .eq('sector_id', selectedSector)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId && !!selectedSector,
  });

  useEffect(() => {
    if (sectors.length > 0 && !selectedSector) setSelectedSector(sectors[0].id);
  }, [sectors, selectedSector]);

  useEffect(() => {
    const updateScale = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const planWidth = (floorPlan?.layout_data as unknown as FloorPlanData)?.width || 800;
        setScale(Math.min(1, containerWidth / planWidth));
      }
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [floorPlan]);

  const layout = floorPlan?.layout_data as unknown as FloorPlanData;
  const elements = layout?.elements || [];
  const hasFloorPlan = elements.length > 0;

  if (sectors.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Label className="text-sm font-medium">Sector:</Label>
        <Select value={selectedSector} onValueChange={setSelectedSector}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Seleccionar sector" /></SelectTrigger>
          <SelectContent>
            {sectors.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

      </div>

      {!hasFloorPlan ? (
        <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/20">
          <p>No hay plano diseñado para este sector.</p>
          <p className="text-xs mt-1">El administrador puede crear uno desde la sección de Mesas.</p>
        </div>
      ) : (
        <div ref={containerRef} className="overflow-auto border rounded-lg bg-muted/20">
          <div
            className="relative select-none mx-auto"
            style={{
              width: (layout?.width || 800) * scale,
              height: (layout?.height || 600) * scale,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              minWidth: layout?.width || 800,
              minHeight: layout?.height || 600,
            }}
          >
            <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid-view" width="50" height="50" patternUnits="userSpaceOnUse">
                  <path d="M 50 0 L 0 0 0 50" fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" opacity="0.3" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid-view)" />
            </svg>

            {/* Cutouts */}
            {elements.filter(el => el.type === 'cutout').map(el => {
              if (el.points && el.points.length >= 3) {
                const pointsStr = el.points.map((p: any) => `${p.x},${p.y}`).join(' ');
                return (
                  <svg key={el.id} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 5 }}>
                    <polygon points={pointsStr} fill="hsl(var(--background))" />
                  </svg>
                );
              }
              return (
                <div key={el.id} style={{
                  position: 'absolute', left: el.x, top: el.y,
                  width: el.width, height: el.height,
                  backgroundColor: 'hsl(var(--background))',
                  zIndex: 5,
                }} />
              );
            })}

            {/* Normal elements */}
            {elements.filter(el => el.type !== 'cutout').map(el => {
              const isBarSeat = el.type === 'bar-seat';
              const isTable = el.type === 'table' || isBarSeat;
              const isDoor = el.type === 'door-entry' || el.type === 'door-exit';
              const isWindow = el.type === 'window';
              const table = isTable ? tables.find(t => t.id === el.tableId) : null;
              const tableOrders = isTable ? activeOrders.filter(o => o.table_id === el.tableId) : [];
              const color = isTable
                ? (table ? getTableVisualState(table, tableOrders).color : '#9CA3AF')
                : ELEMENT_COLORS[el.type] || '#6B7280';
              const isRound = isTable && (el.shape ?? 'round') === 'round';
              const chairs = el.chairs || 0;

              return (
                <div key={el.id} style={{ position: 'absolute', left: el.x, top: el.y }}>
                  {/* Chairs */}
                  {isTable && chairs > 0 && (
                    <ViewChairs cx={el.width / 2} cy={el.height / 2} w={el.width} h={el.height} count={chairs} rotation={el.rotation} isRound={isRound} />
                  )}

                  <div
                    className={`flex items-center justify-center ${isTable ? 'cursor-pointer hover:scale-110 transition-transform' : ''}`}
                    style={{
                      width: el.width,
                      height: el.height,
                      backgroundColor: isDoor || isWindow ? 'transparent' : color,
                      borderRadius: isRound ? '50%' : isDoor ? '2px' : '4px',
                      opacity: isTable ? 1 : 0.7,
                      transform: `rotate(${el.rotation}deg)`,
                      boxShadow: isTable && table?.status !== 'free' ? `0 0 12px ${color}88` : undefined,
                      ...(isDoor ? {
                        border: `3px solid ${color}`,
                        backgroundImage: `repeating-linear-gradient(90deg, ${color}22, ${color}22 4px, transparent 4px, transparent 8px)`,
                      } : {}),
                      ...(isWindow ? {
                        border: `2px solid ${color}`,
                        backgroundImage: `linear-gradient(180deg, ${color}33 0%, ${color}11 50%, ${color}33 100%)`,
                        borderRadius: '1px',
                      } : {}),
                    }}
                    onClick={() => { if (isTable && table) onTableClick(table); }}
                  >
                    <div className="text-center pointer-events-none">
                      <span className={`font-bold drop-shadow-md leading-tight block ${isBarSeat ? 'text-[10px]' : 'text-xs'} ${isDoor || isWindow ? '' : 'text-white'}`}
                        style={isDoor ? { color } : isWindow ? { color: '#0EA5E9' } : undefined}
                      >
                        {isBarSeat ? el.label : isTable ? `M${el.label}` : el.label}
                      </span>
                      {isTable && tableOrders.length > 0 && (
                        <span className="text-white/90 text-[9px] drop-shadow-md block">
                          {tableOrders.length} ped.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ViewChairs({ cx, cy, w, h, count, rotation, isRound }: {
  cx: number; cy: number; w: number; h: number; count: number; rotation: number; isRound: boolean;
}) {
  const chairSize = 8;
  const gap = 5;
  const chairs: { x: number; y: number }[] = [];

  if (isRound) {
    const radius = Math.max(w, h) / 2 + gap + chairSize / 2;
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2;
      chairs.push({ x: cx + radius * Math.cos(angle) - chairSize / 2, y: cy + radius * Math.sin(angle) - chairSize / 2 });
    }
  } else {
    const perimeter = 2 * (w + h);
    const spacing = perimeter / count;
    for (let i = 0; i < count; i++) {
      let d = i * spacing;
      let px = 0, py = 0;
      if (d < w) { px = d; py = -gap - chairSize; }
      else if (d < w + h) { px = w + gap; py = d - w; }
      else if (d < 2 * w + h) { px = w - (d - w - h); py = h + gap; }
      else { px = -gap - chairSize; py = h - (d - 2 * w - h); }
      chairs.push({ x: px - chairSize / 2, y: py - chairSize / 2 });
    }
  }

  const rad = (rotation * Math.PI) / 180;
  const rotated = chairs.map(c => {
    const dx = c.x + chairSize / 2 - cx;
    const dy = c.y + chairSize / 2 - cy;
    return { x: cx + dx * Math.cos(rad) - dy * Math.sin(rad) - chairSize / 2, y: cy + dx * Math.sin(rad) + dy * Math.cos(rad) - chairSize / 2 };
  });

  return (
    <>
      {rotated.map((c, i) => (
        <div key={i} className="absolute rounded-full pointer-events-none" style={{ left: c.x, top: c.y, width: chairSize, height: chairSize, backgroundColor: '#D4D4D8', border: '1px solid #A1A1AA' }} />
      ))}
    </>
  );
}
