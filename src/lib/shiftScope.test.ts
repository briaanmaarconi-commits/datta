import { describe, expect, it } from 'vitest';
import { formatShiftRange, getShiftWindow } from './shiftScope';

describe('shift window ignores a cash-register PC with its clock ahead', () => {
  // Caso Bodegón 65: la caja se abrió 10:00 (servidor) pero la PC registró 12:00.
  const shift = {
    shift_date: '2026-10-16',
    created_at: '2026-10-16T13:00:00.000Z',
    opened_at: '2026-10-16T15:00:00.000Z',
    closed_at: '2026-10-16T20:00:00.000Z',
  };

  it('starts at the server time, so an 11:00 card payment is inside the shift', () => {
    const { from, to } = getShiftWindow(shift);
    const cardPayment = '2026-10-16T14:00:00.000Z';
    expect(from).toBe(shift.created_at);
    expect(cardPayment >= from && cardPayment <= to).toBe(true);
  });

  it('shows the real opening hour in Argentina time', () => {
    expect(formatShiftRange(shift)).toMatch(/^10:00 → 17:00$/);
  });
});
