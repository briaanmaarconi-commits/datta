import { describe, expect, it } from "vitest";
import { computeSensitivity, type SaleRow } from "../src/lib/priceSensitivity.js";

// Escenarios armados a mano: N días a un precio y M días al siguiente.
function scenario(spec: { price: number; days: number; unitsPerDay: number; ordersPerDay: number }[]) {
  const sales: SaleRow[] = [];
  const orders = new Map<string, number>();
  let d = new Date(Date.UTC(2026, 0, 1));
  for (const s of spec) {
    for (let i = 0; i < s.days; i++) {
      const day = d.toISOString().slice(0, 10);
      orders.set(day, s.ordersPerDay);
      if (s.unitsPerDay > 0) sales.push({ product_id: "p", day, unit_price: s.price, quantity: s.unitsPerDay });
      d = new Date(d.getTime() + 86_400_000);
    }
  }
  return computeSensitivity([{ id: "p", name: "Milanesa", price: spec.at(-1)!.price }], sales, orders)[0];
}

describe("sensibilidad al precio", () => {
  it("sube el precio y casi no cambia la demanda: puede subir", () => {
    const r = scenario([{ price: 100, days: 20, unitsPerDay: 10, ordersPerDay: 100 }, { price: 120, days: 20, unitsPerDay: 9.5 as any, ordersPerDay: 100 }]);
    expect(r.verdict).toBe("can_raise");
    expect(r.revenue_change_pct!).toBeGreaterThan(0);
    expect(r.elasticity!).toBeGreaterThan(-1);
  });
  it("sube el precio y se vende mucho menos: cuidado", () => {
    const r = scenario([{ price: 100, days: 20, unitsPerDay: 10, ordersPerDay: 100 }, { price: 120, days: 20, unitsPerDay: 6, ordersPerDay: 100 }]);
    expect(r.verdict).toBe("careful");
    expect(r.elasticity!).toBeLessThan(-1);
  });
  it("menos días al precio nuevo no se confunde con menos demanda", () => {
    // Antes se comparaban totales: 25 días vs 8 días parecía una caída enorme de ventas.
    const r = scenario([{ price: 100, days: 25, unitsPerDay: 10, ordersPerDay: 100 }, { price: 120, days: 8, unitsPerDay: 10, ordersPerDay: 100 }]);
    expect(r.verdict).toBe("can_raise");
    expect(r.demand_change_pct).toBe(0);
  });
  it("si el local vendió el doble, no se lo atribuye al precio", () => {
    const r = scenario([{ price: 100, days: 20, unitsPerDay: 10, ordersPerDay: 100 }, { price: 120, days: 20, unitsPerDay: 20, ordersPerDay: 200 }]);
    expect(r.verdict).toBe("can_raise");
    expect(r.demand_change_pct).toBe(0);
  });
  it("los días sin ventas del plato cuentan al precio vigente", () => {
    const r = scenario([
      { price: 100, days: 20, unitsPerDay: 10, ordersPerDay: 100 },
      { price: 120, days: 10, unitsPerDay: 5, ordersPerDay: 100 },
      { price: 120, days: 10, unitsPerDay: 0, ordersPerDay: 100 },
    ]);
    expect(r.after!.days).toBe(20);
    expect(r.verdict).toBe("careful");
  });
  it("sin cambio de precio o con pocos días no concluye", () => {
    expect(scenario([{ price: 100, days: 30, unitsPerDay: 5, ordersPerDay: 50 }]).verdict).toBe("no_change");
    expect(scenario([{ price: 100, days: 30, unitsPerDay: 5, ordersPerDay: 50 }, { price: 120, days: 3, unitsPerDay: 5, ordersPerDay: 50 }]).verdict).toBe("not_enough_data");
  });
});
