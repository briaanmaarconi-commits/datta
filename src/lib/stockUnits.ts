// Utilidad para mostrar stock en la unidad más legible.
// El stock se almacena siempre en unidad base (g, ml, unidad), pero
// se muestra escalado a kg/l cuando la cantidad lo amerita.

export function formatStock(quantity: number, baseUnit: string): { value: string; unit: string } {
  const qty = Number(quantity) || 0;
  const unit = (baseUnit || '').toLowerCase();

  // g -> kg cuando >= 1000g
  if (unit === 'g' && Math.abs(qty) >= 1000) {
    return { value: trim(qty / 1000), unit: 'kg' };
  }
  // ml -> l cuando >= 1000ml
  if (unit === 'ml' && Math.abs(qty) >= 1000) {
    return { value: trim(qty / 1000), unit: 'l' };
  }
  return { value: trim(qty), unit: baseUnit };
}

function trim(n: number): string {
  // Hasta 3 decimales pero sin ceros sobrantes
  return Number(n.toFixed(3)).toString();
}
