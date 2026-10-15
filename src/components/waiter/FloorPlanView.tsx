import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { getTableVisualState } from '@/lib/tableStatus';
import { PlanVariant, StoredFloorPlan, getLayout, hasWeekendLayout, weekendPlanEnabled, getTodayVariant, setTodayVariant } from '@/lib/floorPlanVariant';

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

/** Tamaño mínimo (px en pantalla) de una mesa en el celular para tocarla cómodo. */
const MIN_TOUCH = 40;
/** Distancia (px en pantalla) a la que un toque todavía cuenta para la mesa más cercana. */
const TAP_SLOP = 24;
const clampScale = (s: number) => Math.min(2.5, Math.max(0.3, s));

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
  // Distribución del día (semana / fin de semana); los feriados la cambia el mozo a mano.
  const [variant, setVariantState] = useState<PlanVariant>(getTodayVariant);
  const setVariant = (v: PlanVariant) => { setVariantState(v); setTodayVariant(v); };

  const { data: sectors = [] } = useQuery({
    queryKey: ['sectors', establishmentId],
    queryFn: async () => {
      const { data, error } = await db.from('sectors').select('*').eq('establishment_id', establishmentId!).order('sort_order');
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
  });

  const { data: floorPlan } = useQuery({
    queryKey: ['floor-plan', establishmentId, selectedSector],
    queryFn: async () => {
      const { data, error } = await db
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

  const stored = floorPlan?.layout_data as unknown as StoredFloorPlan | undefined;
  const hasWeekend = weekendPlanEnabled(establishmentId) && hasWeekendLayout(stored);
  const layout = getLayout(stored, hasWeekend ? variant : 'weekday') as FloorPlanData | null;
  const elements = layout?.elements || [];
  const hasFloorPlan = elements.length > 0;

  // Tamaño real del dibujo: algunos planos tienen elementos fuera del ancho/alto guardado.
  const planWidth = Math.max(layout?.width || 800, ...elements.map(el => el.x + el.width + 20));
  const planHeight = Math.max(layout?.height || 600, ...elements.map(el => el.y + el.height + 20));
  const tableEls = elements.filter(el => el.type === 'table' || el.type === 'bar-seat');
  // Tamaño típico de mesa (mediana): las banquetas de barra suelen ser más chicas y no
  // deberían obligar a agrandar todo el plano; igual se pueden tocar "cerca" (ver más abajo).
  const tableSizes = tableEls.map(el => Math.min(el.width, el.height)).sort((a, b) => a - b);
  const typicalTable = tableSizes[Math.floor(tableSizes.length / 2)] ?? 40;
  // Zona donde están las mesas (con margen para las sillas).
  const tablesBox = tableEls.length > 0 ? {
    x: Math.max(0, Math.min(...tableEls.map(el => el.x)) - 20),
    y: Math.max(0, Math.min(...tableEls.map(el => el.y)) - 20),
    right: Math.max(...tableEls.map(el => el.x + el.width)) + 20,
  } : null;

  const getContainerWidth = () => (containerRef.current?.clientWidth || window.innerWidth) - 2;

  // Escala que hace entrar todo el plano a lo ancho.
  const getFitScale = () => Math.min(1, getContainerWidth() / planWidth);

  // En pantallas angostas (celular) no achicamos tanto: la zona de mesas ocupa el ancho
  // y cada mesa queda de al menos MIN_TOUCH px para tocarla sin errarle; el resto del
  // plano se recorre deslizando el dedo.
  const getDefaultScale = () => {
    const fit = getFitScale();
    if (window.innerWidth >= 768 || !tablesBox) return clampScale(fit);
    const fitTables = getContainerWidth() / (tablesBox.right - tablesBox.x);
    const touchable = MIN_TOUCH / typicalTable;
    return clampScale(Math.max(fit, Math.min(Math.max(fitTables, touchable), 1.5)));
  };

  const applyDefaultView = () => {
    const s = getDefaultScale();
    setScale(s);
    // Arrancar mostrando las mesas (no la cocina o la barra de la esquina).
    if (tablesBox && window.innerWidth < 768) {
      pendingScrollRef.current = { left: tablesBox.x * s, top: tablesBox.y * s };
    }
  };

  // El desplazamiento inicial se aplica recién cuando el plano ya tiene el tamaño nuevo.
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (pendingScrollRef.current && containerRef.current) {
      containerRef.current.scrollTo(pendingScrollRef.current);
      pendingScrollRef.current = null;
    }
  });

  useEffect(() => {
    if (!hasFloorPlan) return;
    applyDefaultView();
    // Sólo si cambia el ancho (girar el celular): al deslizar, la barra del navegador
    // cambia el alto y no queremos perder el zoom que eligió el mozo.
    let lastWidth = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      applyDefaultView();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorPlan, hasFloorPlan, variant]);

  // Tocar "cerca" de una mesa la abre: se elige la mesa más próxima al dedo (hasta
  // TAP_SLOP px de pantalla), así un toque impreciso no abre la mesa de al lado.
  const onPlanClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / scale;
    const py = (e.clientY - rect.top) / scale;
    let best: { table: any; dist: number } | null = null;
    for (const el of tableEls) {
      const table = tables.find(t => t.id === el.tableId);
      if (!table) continue;
      const dx = Math.max(Math.abs(px - (el.x + el.width / 2)) - el.width / 2, 0);
      const dy = Math.max(Math.abs(py - (el.y + el.height / 2)) - el.height / 2, 0);
      const dist = Math.hypot(dx, dy);
      if (!best || dist < best.dist) best = { table, dist };
    }
    if (best && best.dist * scale <= TAP_SLOP) onTableClick(best.table);
  };

  // Pellizcar con dos dedos para acercar/alejar el plano (sin agrandar toda la página).
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const touchDist = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) pinchRef.current = { dist: touchDist(e.touches), scale };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      setScale(clampScale(pinchRef.current.scale * (touchDist(e.touches) / pinchRef.current.dist)));
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchRef.current = null;
  };

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

        {hasFloorPlan && (
          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => setScale(s => clampScale(s / 1.25))} title="Alejar">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => setScale(s => clampScale(s * 1.25))} title="Acercar">
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => setScale(clampScale(getFitScale()))} title="Ver todo el plano">
              <Maximize className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {hasWeekend && (
        <div className="grid grid-cols-2 gap-1 rounded-lg border p-1 sm:inline-grid sm:w-auto">
          {([['weekday', 'Día de semana'], ['weekend', 'Finde / feriado']] as const).map(([v, label]) => (
            <Button
              key={v} variant={variant === v ? 'default' : 'ghost'} className="h-10"
              onClick={() => setVariant(v)}
            >
              {label}
            </Button>
          ))}
        </div>
      )}

      {!hasFloorPlan ? (
        <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/20">
          <p>No hay plano diseñado para este sector.</p>
          <p className="text-xs mt-1">El administrador puede crear uno desde la sección de Mesas.</p>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="overflow-auto overscroll-contain border rounded-lg bg-muted/20 max-h-[70vh]"
          style={{ touchAction: 'pan-x pan-y' }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Caja con el tamaño ya escalado; adentro el plano en su tamaño real, escalado con transform. */}
          <div style={{ width: planWidth * scale, height: planHeight * scale }}>
          <div
            className="relative select-none"
            onClick={onPlanClick}
            style={{
              width: planWidth,
              height: planHeight,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
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
                    className={`flex items-center justify-center ${isTable ? 'cursor-pointer [@media(hover:hover)]:hover:scale-110 active:scale-95 transition-transform' : ''}`}
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
