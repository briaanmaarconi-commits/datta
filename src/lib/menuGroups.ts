export const DRINK_CATEGORY_RE = /bebida|trago|vino|cerveza|gaseosa|jugo|cafeteria|cafe|licor|barra|sin alcohol|aperitivo|coctel/;
export const DESSERT_CATEGORY_RE = /postre|dulce|helado|torta/;

export type MenuGroup = 'main' | 'dessert' | 'drink';

export const GROUP_LABELS: Record<MenuGroup, string> = {
  main: 'Platos',
  dessert: 'Postres',
  drink: 'Bebidas',
};

export const GROUP_LABELS_SINGULAR: Record<MenuGroup, string> = {
  main: 'Plato',
  dessert: 'Postre',
  drink: 'Bebida',
};

/** Deduce el grupo (plato / postre / bebida) a partir del nombre de la categoría. */
export function groupFromCategoryName(name?: string | null): MenuGroup {
  const n = (name || '').toLowerCase();
  if (DESSERT_CATEGORY_RE.test(n)) return 'dessert';
  if (DRINK_CATEGORY_RE.test(n)) return 'drink';
  return 'main';
}
