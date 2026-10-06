export type VisualTableStatus = 'free' | 'preparing' | 'ready' | 'occupied';

export interface TableVisualState {
  key: VisualTableStatus;
  label: string;
  cardClass: string;
  dotClass: string;
  textClass: string;
  badgeClass: string;
  color: string;
}

const STATES: Record<VisualTableStatus, Omit<TableVisualState, 'key'>> = {
  free: {
    label: 'Libre',
    cardClass: 'bg-green-500/20 border-green-500 text-green-700 dark:text-green-400',
    dotClass: 'bg-green-500',
    textClass: 'text-green-700 dark:text-green-400',
    badgeClass: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
    color: '#22C55E',
  },
  preparing: {
    label: 'En preparación',
    cardClass: 'bg-yellow-500/20 border-yellow-500 text-yellow-700 dark:text-yellow-400',
    dotClass: 'bg-yellow-500 animate-pulse',
    textClass: 'text-yellow-700 dark:text-yellow-400',
    badgeClass: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20',
    color: '#EAB308',
  },
  ready: {
    label: 'Listo para entregar',
    cardClass: 'bg-blue-500/20 border-blue-500 text-blue-700 dark:text-blue-400',
    dotClass: 'bg-blue-500',
    textClass: 'text-blue-700 dark:text-blue-400',
    badgeClass: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
    color: '#3B82F6',
  },
  occupied: {
    label: 'Ocupada',
    cardClass: 'bg-red-500/20 border-red-500 text-red-700 dark:text-red-400',
    dotClass: 'bg-red-500',
    textClass: 'text-red-700 dark:text-red-400',
    badgeClass: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
    color: '#EF4444',
  },
};

export function getTableVisualState(table: any, orders: any[] = []): TableVisualState {
  let key: VisualTableStatus = 'occupied';
  if (table?.status === 'free') key = 'free';
  else if (orders.some(order => order.status === 'new' || order.status === 'preparing')) key = 'preparing';
  else if (orders.some(order => order.status === 'ready')) key = 'ready';

  const state = STATES[key];
  return {
    key,
    ...state,
    label: table?.status === 'billing' && key === 'occupied' ? 'Pidió la cuenta' : state.label,
  };
}

export const TABLE_STATUS_LEGEND = (['free', 'preparing', 'ready', 'occupied'] as const).map(key => ({
  key,
  label: STATES[key].label,
  dotClass: STATES[key].dotClass,
}));
