import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { getTableVisualState } from '@/lib/tableStatus';
import TableStatusLegend from '@/components/shared/TableStatusLegend';
import {
  Save, RotateCcw, Trash2, RotateCw,
  Move, UtensilsCrossed, Bath, DoorOpen, Wine, Armchair,
  Square, Circle, Flower2, Flame, CreditCard, Sofa,
  ParkingCircle, Fence, LampDesk, Music, Columns2,
  Scissors, LogIn, LogOut, PanelTop, Plus,
} from 'lucide-react';

export interface FloorElement {
  id: string;
  type: 'table' | 'bar-seat' | 'bar' | 'kitchen' | 'bathroom' | 'reception' | 'wall' | 'decoration'
    | 'stairs' | 'cashier' | 'lounge' | 'planter' | 'parking' | 'divider' | 'stage' | 'column' | 'firepit'
    | 'cutout' | 'door-entry' | 'door-exit' | 'window';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  tableId?: string;
  label?: string;
  shape?: 'round' | 'rect';
  chairs?: number;
  /** Polygon points for cutouts — absolute canvas coordinates */
  points?: { x: number; y: number }[];
}

export interface FloorPlanData {
  elements: FloorElement[];
  width: number;
  height: number;
}

const ELEMENT_PRESETS: { type: FloorElement['type']; label: string; icon: any; defaultW: number; defaultH: number; color: string; category: string }[] = [
  { type: 'wall', label: 'Pared', icon: Square, defaultW: 200, defaultH: 10, color: '#374151', category: 'estructura' },
  { type: 'cutout', label: 'Recorte', icon: Scissors, defaultW: 150, defaultH: 150, color: '#1F2937', category: 'estructura' },
  { type: 'door-entry', label: 'Ingreso', icon: LogIn, defaultW: 60, defaultH: 14, color: '#16A34A', category: 'estructura' },
  { type: 'door-exit', label: 'Salida', icon: LogOut, defaultW: 60, defaultH: 14, color: '#DC2626', category: 'estructura' },
  { type: 'window', label: 'Ventana', icon: PanelTop, defaultW: 80, defaultH: 8, color: '#38BDF8', category: 'estructura' },
  { type: 'column', label: 'Columna', icon: LampDesk, defaultW: 20, defaultH: 20, color: '#57534E', category: 'estructura' },
  { type: 'divider', label: 'Divisor', icon: Fence, defaultW: 150, defaultH: 8, color: '#A8A29E', category: 'estructura' },
  { type: 'stairs', label: 'Escalera', icon: Columns2, defaultW: 80, defaultH: 40, color: '#78716C', category: 'estructura' },
  { type: 'bar', label: 'Barra', icon: Wine, defaultW: 200, defaultH: 40, color: '#8B4513', category: 'areas' },
  { type: 'kitchen', label: 'Cocina', icon: UtensilsCrossed, defaultW: 150, defaultH: 120, color: '#6B7280', category: 'areas' },
  { type: 'bathroom', label: 'Baños', icon: Bath, defaultW: 80, defaultH: 80, color: '#3B82F6', category: 'areas' },
  { type: 'reception', label: 'Recepción', icon: DoorOpen, defaultW: 100, defaultH: 60, color: '#8B5CF6', category: 'areas' },
  { type: 'cashier', label: 'Caja', icon: CreditCard, defaultW: 80, defaultH: 50, color: '#D97706', category: 'areas' },
  { type: 'lounge', label: 'Sillón/Lounge', icon: Sofa, defaultW: 120, defaultH: 50, color: '#7C3AED', category: 'areas' },
  { type: 'stage', label: 'Escenario/DJ', icon: Music, defaultW: 150, defaultH: 80, color: '#EC4899', category: 'areas' },
  { type: 'decoration', label: 'Decoración', icon: Armchair, defaultW: 40, defaultH: 40, color: '#059669', category: 'deco' },
  { type: 'planter', label: 'Maceta/Planta', icon: Flower2, defaultW: 35, defaultH: 35, color: '#16A34A', category: 'deco' },
  { type: 'firepit', label: 'Fogón/Parrilla', icon: Flame, defaultW: 60, defaultH: 60, color: '#DC2626', category: 'deco' },
  { type: 'parking', label: 'Estacionamiento', icon: ParkingCircle, defaultW: 120, defaultH: 80, color: '#64748B', category: 'deco' },
];

const TABLE_DEFAULT_SIZE = 50;
const BAR_FIRST_NUMBER = 101;
const BAR_SEAT_COUNT = 6;
const BAR_SEAT_SIZE = 28;

/** Generate initial polygon points for a cutout: rectangle with intermediate points */
function createCutoutPoints(cx: number, cy: number, w: number, h: number): { x: number; y: number }[] {
  const hw = w / 2, hh = h / 2;
  // 16 points: 4 corners + 3 per side
  const pts: { x: number; y: number }[] = [];
  // Top side (left to right)
  pts.push({ x: cx - hw, y: cy - hh });
  pts.push({ x: cx - hw / 2, y: cy - hh });
  pts.push({ x: cx, y: cy - hh });
  pts.push({ x: cx + hw / 2, y: cy - hh });
  // Right side (top to bottom)
  pts.push({ x: cx + hw, y: cy - hh });
  pts.push({ x: cx + hw, y: cy - hh / 2 });
  pts.push({ x: cx + hw, y: cy });
  pts.push({ x: cx + hw, y: cy + hh / 2 });
  // Bottom side (right to left)
  pts.push({ x: cx + hw, y: cy + hh });
  pts.push({ x: cx + hw / 2, y: cy + hh });
  pts.push({ x: cx, y: cy + hh });
  pts.push({ x: cx - hw / 2, y: cy + hh });
  // Left side (bottom to top)
  pts.push({ x: cx - hw, y: cy + hh });
  pts.push({ x: cx - hw, y: cy + hh / 2 });
  pts.push({ x: cx - hw, y: cy });
  pts.push({ x: cx - hw, y: cy - hh / 2 });
  return pts;
}

function getPolygonCentroid(pts: { x: number; y: number }[]) {
  const n = pts.length;
  const sx = pts.reduce((s, p) => s + p.x, 0);
  const sy = pts.reduce((s, p) => s + p.y, 0);
  return { x: sx / n, y: sy / n };
}

export default function FloorPlanEditor() {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [selectedSector, setSelectedSector] = useState<string>('');
  const [elements, setElements] = useState<FloorElement[]>([]);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [resizing, setResizing] = useState<{ id: string; edge: string; startX: number; startY: number; startW: number; startH: number; startElX: number; startElY: number; rotation: number } | null>(null);
  const [pointDragging, setPointDragging] = useState<{ elId: string; index: number } | null>(null);
  const [canvasSize] = useState({ width: 800, height: 600 });
  const [tableShape, setTableShape] = useState<'round' | 'rect'>('round');

  const { data: sectors = [] } = useQuery({
    queryKey: ['sectors', establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase.from('sectors').select('*').eq('establishment_id', establishmentId!).order('sort_order');
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
  });

  const { data: tables = [] } = useQuery({
    queryKey: ['tables', establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase.from('tables').select('*').eq('establishment_id', establishmentId!).order('number');
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
    refetchInterval: 5000,
  });

  const { data: planActiveOrders = [] } = useQuery({
    queryKey: ['floor-plan-active-orders', establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, table_id, status')
        .eq('establishment_id', establishmentId!)
        .in('status', ['new', 'preparing', 'ready', 'delivered']);
      if (error) throw error;
      return data || [];
    },
    enabled: !!establishmentId,
    refetchInterval: 5000,
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
    if (floorPlan) {
      const layout = floorPlan.layout_data as unknown as FloorPlanData;
      setElements(layout?.elements || []);
    } else {
      setElements([]);
    }
  }, [floorPlan]);

  useEffect(() => {
    if (sectors.length > 0 && !selectedSector) setSelectedSector(sectors[0].id);
  }, [sectors, selectedSector]);

  const sectorTables = tables.filter(t => t.sector_id === selectedSector);
  const placedTableIds = elements.filter(e => (e.type === 'table' || e.type === 'bar-seat') && e.tableId).map(e => e.tableId);
  const unplacedTables = sectorTables.filter(t => !placedTableIds.includes(t.id) && t.number < BAR_FIRST_NUMBER);

  const savePlan = useMutation({
    mutationFn: async () => {
      const layoutData: FloorPlanData = { elements, ...canvasSize };
      if (floorPlan) {
        const { error } = await supabase.from('floor_plans').update({ layout_data: layoutData as any }).eq('id', floorPlan.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('floor_plans').insert({
          establishment_id: establishmentId!,
          sector_id: selectedSector,
          layout_data: layoutData as any,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['floor-plan'] }); toast.success('Plano guardado'); },
    onError: () => toast.error('Error al guardar'),
  });

  const addTable = (tableId: string, tableNumber: number) => {
    const existing = elements.filter(e => e.type === 'table').length;
    const col = existing % 6;
    const row = Math.floor(existing / 6);
    const table = tables.find(t => t.id === tableId);
    const chairs = table?.capacity || 4;
    const el: FloorElement = {
      id: crypto.randomUUID(),
      type: 'table',
      x: 60 + col * 100, y: 60 + row * 100,
      width: TABLE_DEFAULT_SIZE, height: TABLE_DEFAULT_SIZE,
      rotation: 0, tableId, label: `${tableNumber}`,
      shape: tableShape, chairs,
    };
    setElements(prev => [...prev, el]);
  };

  const generateBarSeats = useMutation({
    mutationFn: async () => {
      const bar = elements.find(e => e.id === selectedElement && e.type === 'bar');
      if (!bar) throw new Error('no-bar');

      // Ensure the 6 bar tables (101..106) exist in this sector
      const numbers = Array.from({ length: BAR_SEAT_COUNT }, (_, i) => BAR_FIRST_NUMBER + i);
      const existing = tables.filter(t => numbers.includes(t.number));
      const missing = numbers.filter(n => !existing.some(t => t.number === n));
      if (missing.length > 0) {
        const { error } = await supabase.from('tables').insert(
          missing.map(n => ({
            establishment_id: establishmentId!,
            sector_id: selectedSector,
            number: n,
            capacity: 1,
            status: 'free' as any,
          }))
        );
        if (error) throw error;
      }
      const { data: refreshed, error: fetchError } = await supabase
        .from('tables').select('*')
        .eq('establishment_id', establishmentId!)
        .in('number', numbers);
      if (fetchError) throw fetchError;

      // Distribute the seats along the bar counter, respecting its rotation
      const cx = bar.x + bar.width / 2;
      const cy = bar.y + bar.height / 2;
      const rad = (bar.rotation * Math.PI) / 180;
      const step = bar.width / BAR_SEAT_COUNT;
      const seatY = bar.y - BAR_SEAT_SIZE - 10;

      const newSeats: FloorElement[] = numbers.map((n, i) => {
        const table = (refreshed || []).find(t => t.number === n);
        const px = bar.x + step * i + step / 2;
        const dx = px - cx;
        const dy = seatY + BAR_SEAT_SIZE / 2 - cy;
        const rx = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
        const ry = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
        return {
          id: crypto.randomUUID(),
          type: 'bar-seat',
          x: rx - BAR_SEAT_SIZE / 2,
          y: ry - BAR_SEAT_SIZE / 2,
          width: BAR_SEAT_SIZE,
          height: BAR_SEAT_SIZE,
          rotation: bar.rotation,
          tableId: table?.id,
          label: `${n}`,
          shape: 'round',
          chairs: 0,
        };
      });

      return newSeats;
    },
    onSuccess: (newSeats) => {
      // Replace any previously placed bar seats
      setElements(prev => [...prev.filter(e => e.type !== 'bar-seat'), ...newSeats]);
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast.success('Lugares de barra generados (101 a 106). Acordate de guardar el plano.');
    },
    onError: (e: any) => {
      if (e?.message === 'no-bar') toast.error('Primero seleccioná la barra en el plano');
      else toast.error('Error al generar los lugares de barra');
    },
  });



  const addElement = (preset: typeof ELEMENT_PRESETS[0]) => {
    if (preset.type === 'cutout') {
      const cx = canvasSize.width / 2;
      const cy = canvasSize.height / 2;
      const el: FloorElement = {
        id: crypto.randomUUID(),
        type: 'cutout',
        x: cx - preset.defaultW / 2, y: cy - preset.defaultH / 2,
        width: preset.defaultW, height: preset.defaultH,
        rotation: 0, label: 'Recorte',
        points: createCutoutPoints(cx, cy, preset.defaultW, preset.defaultH),
      };
      setElements(prev => [...prev, el]);
    } else {
      const el: FloorElement = {
        id: crypto.randomUUID(),
        type: preset.type,
        x: canvasSize.width / 2 - preset.defaultW / 2,
        y: canvasSize.height / 2 - preset.defaultH / 2,
        width: preset.defaultW, height: preset.defaultH,
        rotation: 0, label: preset.label,
      };
      setElements(prev => [...prev, el]);
    }
  };

  const removeElement = (id: string) => {
    setElements(prev => prev.filter(e => e.id !== id));
    if (selectedElement === id) setSelectedElement(null);
  };

  const rotateElement = (id: string, deg: number) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, rotation: (el.rotation + deg) % 360 } : el));
  };

  const toggleTableShape = (id: string) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, shape: el.shape === 'round' ? 'rect' : 'round' } : el));
  };

  const addPointToCutout = (elId: string) => {
    setElements(prev => prev.map(el => {
      if (el.id !== elId || !el.points || el.points.length < 3) return el;
      // Add a midpoint between every pair of consecutive points
      const newPts: { x: number; y: number }[] = [];
      for (let i = 0; i < el.points.length; i++) {
        const curr = el.points[i];
        const next = el.points[(i + 1) % el.points.length];
        newPts.push(curr);
        newPts.push({ x: (curr.x + next.x) / 2, y: (curr.y + next.y) / 2 });
      }
      return { ...el, points: newPts };
    }));
  };

  const handleClick = useCallback((e: React.MouseEvent, elId: string) => {
    e.stopPropagation();
    setSelectedElement(prev => prev === elId ? null : elId);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent, elId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const el = elements.find(x => x.id === elId);
    if (!el) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (el.type === 'cutout' && el.points) {
      // For cutouts, drag from centroid
      const centroid = getPolygonCentroid(el.points);
      setDragging({
        id: elId,
        offsetX: e.clientX - rect.left - centroid.x,
        offsetY: e.clientY - rect.top - centroid.y,
      });
    } else {
      setDragging({
        id: elId,
        offsetX: e.clientX - rect.left - el.x,
        offsetY: e.clientY - rect.top - el.y,
      });
    }
  }, [elements]);

  const handlePointDown = useCallback((e: React.MouseEvent, elId: string, index: number) => {
    e.stopPropagation();
    e.preventDefault();
    setPointDragging({ elId, index });
  }, []);

  const handleResizeDown = useCallback((e: React.MouseEvent, elId: string, edge: string) => {
    e.stopPropagation();
    e.preventDefault();
    const el = elements.find(x => x.id === elId);
    if (!el) return;
    setResizing({
      id: elId, edge,
      startX: e.clientX, startY: e.clientY,
      startW: el.width, startH: el.height,
      startElX: el.x, startElY: el.y,
      rotation: el.rotation,
    });
  }, [elements]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (pointDragging) {
      const mx = Math.max(0, Math.min(canvasSize.width, e.clientX - rect.left));
      const my = Math.max(0, Math.min(canvasSize.height, e.clientY - rect.top));
      setElements(prev => prev.map(el => {
        if (el.id !== pointDragging.elId || !el.points) return el;
        const newPts = [...el.points];
        newPts[pointDragging.index] = { x: mx, y: my };
        return { ...el, points: newPts };
      }));
      return;
    }

    if (dragging) {
      const el = elements.find(e => e.id === dragging.id);
      if (!el) return;

      if (el.type === 'cutout' && el.points) {
        // Move all points by delta from centroid
        const centroid = getPolygonCentroid(el.points);
        const newCx = e.clientX - rect.left - dragging.offsetX;
        const newCy = e.clientY - rect.top - dragging.offsetY;
        const dx = newCx - centroid.x;
        const dy = newCy - centroid.y;
        setElements(prev => prev.map(el2 => {
          if (el2.id !== dragging.id || !el2.points) return el2;
          const newPts = el2.points.map(p => ({
            x: Math.max(0, Math.min(canvasSize.width, p.x + dx)),
            y: Math.max(0, Math.min(canvasSize.height, p.y + dy)),
          }));
          return { ...el2, points: newPts };
        }));
      } else {
        const w = el.width || 20;
        const h = el.height || 20;
        const rot = el.rotation || 0;
        const rad = (rot * Math.PI) / 180;
        const absCos = Math.abs(Math.cos(rad));
        const absSin = Math.abs(Math.sin(rad));
        const rotW = w * absCos + h * absSin;
        const rotH = w * absSin + h * absCos;
        const offsetX = (rotW - w) / 2;
        const offsetY = (rotH - h) / 2;
        const rawX = e.clientX - rect.left - dragging.offsetX;
        const rawY = e.clientY - rect.top - dragging.offsetY;
        const x = Math.max(-offsetX, Math.min(canvasSize.width - rotW + offsetX, rawX));
        const y = Math.max(-offsetY, Math.min(canvasSize.height - rotH + offsetY, rawY));
        setElements(prev => prev.map(el2 => el2.id === dragging.id ? { ...el2, x, y } : el2));
      }
    }

    if (resizing) {
      const rawDx = e.clientX - resizing.startX;
      const rawDy = e.clientY - resizing.startY;
      const rad = -(resizing.rotation * Math.PI) / 180;
      const dx = rawDx * Math.cos(rad) - rawDy * Math.sin(rad);
      const dy = rawDx * Math.sin(rad) + rawDy * Math.cos(rad);
      setElements(prev => prev.map(el => {
        if (el.id !== resizing.id) return el;
        const updates: Partial<FloorElement> = {};
        if (resizing.edge.includes('r')) updates.width = Math.max(20, resizing.startW + dx);
        if (resizing.edge.includes('b')) updates.height = Math.max(20, resizing.startH + dy);
        if (resizing.edge.includes('l')) {
          const newW = Math.max(20, resizing.startW - dx);
          updates.width = newW;
          updates.x = resizing.startElX + (resizing.startW - newW);
        }
        if (resizing.edge.includes('t')) {
          const newH = Math.max(20, resizing.startH - dy);
          updates.height = newH;
          updates.y = resizing.startElY + (resizing.startH - newH);
        }
        return { ...el, ...updates };
      }));
    }
  }, [dragging, resizing, pointDragging, canvasSize, elements]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setResizing(null);
    setPointDragging(null);
  }, []);

  const getElementColor = (type: FloorElement['type']) => {
    const preset = ELEMENT_PRESETS.find(p => p.type === type);
    return preset?.color || '#6B7280';
  };

  if (sectors.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Creá al menos un sector para diseñar el plano.</p>
      </div>
    );
  }

  const selectedEl = elements.find(e => e.id === selectedElement);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
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
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => { setElements([]); setSelectedElement(null); }} className="gap-1">
          <RotateCcw className="h-3 w-3" /> Limpiar
        </Button>
        <Button size="sm" onClick={() => savePlan.mutate()} disabled={savePlan.isPending} className="gap-1">
          <Save className="h-3 w-3" /> Guardar plano
        </Button>
      </div>

      <TableStatusLegend />

      <div className="flex gap-4 flex-col lg:flex-row">
        {/* Sidebar */}
        <div className="w-full lg:w-56 space-y-3 shrink-0">
          <div>
            <h3 className="text-sm font-semibold mb-2">Mesas sin colocar</h3>
            <div className="flex items-center gap-2 mb-2">
              <Label className="text-xs">Forma:</Label>
              <Button size="sm" variant={tableShape === 'round' ? 'default' : 'outline'} className="h-7 w-7 p-0" onClick={() => setTableShape('round')}>
                <Circle className="h-3 w-3" />
              </Button>
              <Button size="sm" variant={tableShape === 'rect' ? 'default' : 'outline'} className="h-7 w-7 p-0" onClick={() => setTableShape('rect')}>
                <Square className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {unplacedTables.length === 0 && <p className="text-xs text-muted-foreground">Todas colocadas</p>}
              {unplacedTables.map(t => (
                <Button key={t.id} size="sm" variant="outline" className="text-xs h-8" onClick={() => addTable(t.id, t.number)}>
                  <Circle className="h-3 w-3 mr-1" /> Mesa {t.number}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2">Estructura</h3>
            <div className="flex flex-wrap gap-1">
              {ELEMENT_PRESETS.filter(p => p.category === 'estructura').map(p => (
                <Button key={p.type} size="sm" variant="outline" className="text-xs h-8" onClick={() => addElement(p)}>
                  <p.icon className="h-3 w-3 mr-1" /> {p.label}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2">Áreas</h3>
            <div className="flex flex-wrap gap-1">
              {ELEMENT_PRESETS.filter(p => p.category === 'areas').map(p => (
                <Button key={p.type} size="sm" variant="outline" className="text-xs h-8" onClick={() => addElement(p)}>
                  <p.icon className="h-3 w-3 mr-1" /> {p.label}
                </Button>
              ))}
            </div>
            <div className="mt-2 rounded-md border p-2 space-y-1">
              <p className="text-xs text-muted-foreground">
                Seleccioná la barra en el plano y generá 6 lugares (mesas 101 a 106) para tomar pedidos individuales.
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="w-full text-xs h-8"
                disabled={generateBarSeats.isPending || !elements.some(e => e.id === selectedElement && e.type === 'bar')}
                onClick={() => generateBarSeats.mutate()}
              >
                <Wine className="h-3 w-3 mr-1" /> Generar lugares de barra
              </Button>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2">Decoración</h3>
            <div className="flex flex-wrap gap-1">
              {ELEMENT_PRESETS.filter(p => p.category === 'deco').map(p => (
                <Button key={p.type} size="sm" variant="outline" className="text-xs h-8" onClick={() => addElement(p)}>
                  <p.icon className="h-3 w-3 mr-1" /> {p.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-auto border rounded-lg bg-muted/30">
          <div
            ref={canvasRef}
            className="relative select-none"
            style={{ width: canvasSize.width, height: canvasSize.height, minWidth: canvasSize.width }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={() => setSelectedElement(null)}
          >
            {/* Grid */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                  <path d="M 50 0 L 0 0 0 50" fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" opacity="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>

            {/* Render cutouts as SVG polygons */}
            {elements.filter(el => el.type === 'cutout').map(el => {
              const isSelected = selectedElement === el.id;
              const pts = el.points || [];
              if (pts.length < 3) return null;
              const centroid = getPolygonCentroid(pts);
              const pointsStr = pts.map(p => `${p.x},${p.y}`).join(' ');

              return (
                <div key={el.id} style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', zIndex: 5, pointerEvents: 'none' }}>
                  {/* The cutout polygon */}
                  <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
                    <polygon
                      points={pointsStr}
                      fill="hsl(var(--background))"
                      stroke={isSelected ? 'hsl(var(--destructive))' : 'hsl(var(--border))'}
                      strokeWidth={isSelected ? 2 : 1}
                      strokeDasharray={isSelected ? '' : '6 3'}
                      style={{ pointerEvents: 'visibleFill', cursor: 'move' }}
                      onClick={e => handleClick(e, el.id)}
                      onMouseDown={e => handleMouseDown(e, el.id)}
                    />
                  </svg>

                  {/* Floating toolbar */}
                  {isSelected && (
                    <div
                      className="absolute flex items-center gap-1 bg-background border rounded-lg shadow-lg px-2 py-1 z-30"
                      style={{ left: centroid.x, top: centroid.y - 50, transform: 'translateX(-50%)', pointerEvents: 'auto' }}
                      onClick={e => e.stopPropagation()}
                    >
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => addPointToCutout(el.id)} title="Más puntos">
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => removeElement(el.id)} title="Eliminar">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}

                  {/* Center handle for moving */}
                  {isSelected && (
                    <div
                      className="absolute w-5 h-5 rounded-full bg-primary/80 border-2 border-primary cursor-move z-20 flex items-center justify-center"
                      style={{ left: centroid.x - 10, top: centroid.y - 10, pointerEvents: 'auto' }}
                      onMouseDown={e => handleMouseDown(e, el.id)}
                    >
                      <Move className="h-3 w-3 text-primary-foreground" />
                    </div>
                  )}

                  {/* Draggable vertex points */}
                  {isSelected && pts.map((p, i) => (
                    <div
                      key={i}
                      className="absolute w-3 h-3 rounded-full bg-primary border border-primary-foreground cursor-pointer z-20 hover:scale-150 transition-transform"
                      style={{ left: p.x - 6, top: p.y - 6, pointerEvents: 'auto' }}
                      onMouseDown={e => handlePointDown(e, el.id, i)}
                    />
                  ))}
                </div>
              );
            })}

            {/* Render normal elements */}
            {elements.filter(el => el.type !== 'cutout').map(el => {
              const isBarSeat = el.type === 'bar-seat';
              const isTable = el.type === 'table' || isBarSeat;
              const isDoor = el.type === 'door-entry' || el.type === 'door-exit';
              const isWindow = el.type === 'window';
              const isSelected = selectedElement === el.id;
              const elTable = isTable && el.tableId ? tables.find(t => t.id === el.tableId) : undefined;
              const color = isTable
                ? (elTable
                    ? getTableVisualState(elTable, planActiveOrders.filter(o => o.table_id === elTable.id)).color
                    : '#9CA3AF')
                : getElementColor(el.type);
              const isRound = isTable && (el.shape ?? 'round') === 'round';
              const chairs = el.chairs || 0;

              return (
                <div key={el.id} style={{ position: 'absolute', left: el.x, top: el.y }}>
                  {isTable && chairs > 0 && (
                    <ChairsAroundTable cx={el.width / 2} cy={el.height / 2} w={el.width} h={el.height} count={chairs} rotation={el.rotation} isRound={isRound} />
                  )}
                  {isSelected && (
                    <div
                      className="absolute flex items-center gap-1 bg-background border rounded-lg shadow-lg px-2 py-1 z-30"
                      style={{ left: '50%', transform: 'translateX(-50%)', top: -40 }}
                      onClick={e => e.stopPropagation()}
                    >
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => rotateElement(el.id, -45)} title="Rotar izq">
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => rotateElement(el.id, 45)} title="Rotar der">
                        <RotateCw className="h-3.5 w-3.5" />
                      </Button>
                      {isTable && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => toggleTableShape(el.id)} title="Cambiar forma">
                          {isRound ? <Square className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => removeElement(el.id)} title="Eliminar">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  <div style={{ transform: `rotate(${el.rotation}deg)`, transformOrigin: `${el.width / 2}px ${el.height / 2}px` }}>
                    <div
                      className={`cursor-move flex items-center justify-center transition-shadow ${isSelected ? 'ring-2 ring-primary shadow-lg z-10' : 'hover:shadow-md'}`}
                      style={{
                        width: el.width, height: el.height,
                        backgroundColor: isDoor || isWindow ? 'transparent' : color,
                        borderRadius: isRound ? '50%' : isDoor ? '2px' : '4px',
                        opacity: 0.85,
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
                      onClick={e => handleClick(e, el.id)}
                      onMouseDown={e => handleMouseDown(e, el.id)}
                    >
                      <span className={`font-bold select-none drop-shadow-md pointer-events-none text-center leading-tight px-1 ${isBarSeat ? 'text-[10px]' : 'text-xs'} ${isDoor || isWindow ? '' : 'text-white'}`}
                        style={isDoor ? { color } : isWindow ? { color: '#0EA5E9' } : undefined}
                      >
                        {isBarSeat ? el.label : isTable ? `M${el.label}` : el.label}
                      </span>
                    </div>
                    {isSelected && !isRound && (
                      <FullResizeHandles elId={el.id} onResizeDown={handleResizeDown} />
                    )}
                    {isSelected && isRound && (
                      <>
                        <div className="absolute w-2.5 h-2.5 bg-primary rounded-full cursor-se-resize z-20" style={{ right: -5, bottom: -5 }} onMouseDown={e => handleResizeDown(e, el.id, 'rb')} />
                        <div className="absolute w-2.5 h-2.5 bg-primary rounded-full cursor-e-resize z-20" style={{ right: -5, top: '50%', transform: 'translateY(-50%)' }} onMouseDown={e => handleResizeDown(e, el.id, 'r')} />
                        <div className="absolute w-2.5 h-2.5 bg-primary rounded-full cursor-s-resize z-20" style={{ bottom: -5, left: '50%', transform: 'translateX(-50%)' }} onMouseDown={e => handleResizeDown(e, el.id, 'b')} />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Move className="h-3 w-3" /> Click para seleccionar · Arrastrá para mover · Recortes: mové los puntos para moldear la forma · <Plus className="h-3 w-3 inline" /> para agregar más puntos
      </div>
    </div>
  );
}

function FullResizeHandles({ elId, onResizeDown }: { elId: string; onResizeDown: (e: React.MouseEvent, id: string, edge: string) => void }) {
  const s = 'w-2.5 h-2.5 bg-primary rounded-full absolute z-20';
  return (
    <>
      <div className={`${s} cursor-nw-resize`} style={{ left: -5, top: -5 }} onMouseDown={e => onResizeDown(e, elId, 'lt')} />
      <div className={`${s} cursor-ne-resize`} style={{ right: -5, top: -5 }} onMouseDown={e => onResizeDown(e, elId, 'rt')} />
      <div className={`${s} cursor-sw-resize`} style={{ left: -5, bottom: -5 }} onMouseDown={e => onResizeDown(e, elId, 'lb')} />
      <div className={`${s} cursor-se-resize`} style={{ right: -5, bottom: -5 }} onMouseDown={e => onResizeDown(e, elId, 'rb')} />
      <div className={`${s} cursor-n-resize`} style={{ left: '50%', top: -5, transform: 'translateX(-50%)' }} onMouseDown={e => onResizeDown(e, elId, 't')} />
      <div className={`${s} cursor-s-resize`} style={{ left: '50%', bottom: -5, transform: 'translateX(-50%)' }} onMouseDown={e => onResizeDown(e, elId, 'b')} />
      <div className={`${s} cursor-w-resize`} style={{ left: -5, top: '50%', transform: 'translateY(-50%)' }} onMouseDown={e => onResizeDown(e, elId, 'l')} />
      <div className={`${s} cursor-e-resize`} style={{ right: -5, top: '50%', transform: 'translateY(-50%)' }} onMouseDown={e => onResizeDown(e, elId, 'r')} />
    </>
  );
}

function ChairsAroundTable({ cx, cy, w, h, count, rotation, isRound }: {
  cx: number; cy: number; w: number; h: number; count: number; rotation: number; isRound: boolean;
}) {
  const chairSize = 10;
  const gap = 6;
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
      chairs.push({
        x: px - chairSize / 2 + (d < w || (d >= w + h && d < 2 * w + h) ? 0 : chairSize / 2),
        y: py - chairSize / 2 + (d < w || (d >= w + h && d < 2 * w + h) ? chairSize / 2 : 0),
      });
    }
  }

  const rad = (rotation * Math.PI) / 180;
  const rotatedChairs = chairs.map(c => {
    const dx = c.x + chairSize / 2 - cx;
    const dy = c.y + chairSize / 2 - cy;
    return { x: cx + dx * Math.cos(rad) - dy * Math.sin(rad) - chairSize / 2, y: cy + dx * Math.sin(rad) + dy * Math.cos(rad) - chairSize / 2 };
  });

  return (
    <>
      {rotatedChairs.map((c, i) => (
        <div key={i} className="absolute rounded-full pointer-events-none" style={{ left: c.x, top: c.y, width: chairSize, height: chairSize, backgroundColor: '#A1A1AA', border: '1px solid #71717A' }} />
      ))}
    </>
  );
}
