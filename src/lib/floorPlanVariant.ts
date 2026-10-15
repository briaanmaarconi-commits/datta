// Algunos locales mueven las mesas los fines de semana / feriados. El plano de un sector
// puede guardar una segunda distribución en `layout_data.weekend`; la de siempre
// (días de semana) sigue en `elements/width/height`, así los planos viejos no cambian.

export type PlanVariant = 'weekday' | 'weekend';

/** Locales que usan distribución de fin de semana (pedido particular de cada cliente). */
const WEEKEND_PLAN_ESTABLISHMENTS = new Set([
  '018b04a8-18d9-49f7-86f8-b30be9307dd7', // RESTAURANT OLAVARRIA
]);

export const weekendPlanEnabled = (establishmentId: string | null | undefined) =>
  !!establishmentId && WEEKEND_PLAN_ESTABLISHMENTS.has(establishmentId);

export interface PlanLayout {
  elements: any[];
  width: number;
  height: number;
}

export interface StoredFloorPlan extends PlanLayout {
  weekend?: PlanLayout;
}

export const VARIANT_LABEL: Record<PlanVariant, string> = {
  weekday: 'Día de semana',
  weekend: 'Fin de semana / feriado',
};

export const hasWeekendLayout = (data: StoredFloorPlan | null | undefined) =>
  !!data?.weekend && Array.isArray(data.weekend.elements);

/** Distribución a mostrar; si no hay versión de fin de semana se usa la de siempre. */
export function getLayout(data: StoredFloorPlan | null | undefined, variant: PlanVariant): PlanLayout | null {
  if (!data) return null;
  if (variant === 'weekend' && hasWeekendLayout(data)) return data.weekend!;
  return { elements: data.elements || [], width: data.width, height: data.height };
}

/** Sábado y domingo cuentan como fin de semana; los feriados se eligen a mano. */
export const variantForDate = (d = new Date()): PlanVariant => (d.getDay() === 0 || d.getDay() === 6 ? 'weekend' : 'weekday');

const todayKey = () => {
  const d = new Date();
  return `floor-plan-variant:${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/** Lo que eligió el mozo hoy (p. ej. "feriado" un lunes); mañana vuelve a ser automático. */
export function getTodayVariant(): PlanVariant {
  try {
    const saved = localStorage.getItem(todayKey());
    if (saved === 'weekday' || saved === 'weekend') return saved;
  } catch { /* sin almacenamiento: automático */ }
  return variantForDate();
}

export function setTodayVariant(v: PlanVariant) {
  try { localStorage.setItem(todayKey(), v); } catch { /* sin almacenamiento */ }
}
