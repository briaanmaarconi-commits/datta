import { describe, expect, it } from 'vitest';
import { agendaMatches, fromArgentinaInput, toArgentinaInput, whatsappUrl } from './prospects';

describe('prospect agenda uses Argentina time independently of the browser', () => {
  it('round trips a visit across UTC midnight', () => {
    expect(fromArgentinaInput('2026-10-08T23:30')).toBe('2026-10-09T02:30:00.000Z');
    expect(toArgentinaInput('2026-10-09T02:30:00.000Z')).toBe('2026-10-08T23:30');
  });
  it('rejects missing and impossible dates', () => {
    for (const value of ['', '2026-02-30T12:00', '2026-10-08T25:00', '2026-10-08']) {
      expect(() => fromArgentinaInput(value)).toThrow();
    }
  });
  it('groups today by Argentina date at UTC midnight', () => {
    const now = new Date('2026-10-09T01:00:00Z');
    const visit = { status: 'pending', scheduled_at: '2026-10-09T02:00:00Z' };
    expect(agendaMatches(visit, 'today', '', now)).toBe(true);
    expect(agendaMatches(visit, 'day', '2026-10-08', now)).toBe(true);
    expect(agendaMatches(visit, 'day', '2026-10-09', now)).toBe(false);
    expect(agendaMatches(visit, 'overdue', '', now)).toBe(false);
    expect(agendaMatches({ ...visit, scheduled_at: '2026-10-09T00:00:00Z' }, 'overdue', '', now)).toBe(true);
  });
  it('keeps completed and cancelled visits out of pending and overdue lists', () => {
    for (const status of ['completed', 'cancelled']) {
      const visit = { status, scheduled_at: '2026-01-01T12:00:00Z' };
      expect(agendaMatches(visit, 'pending', '')).toBe(false);
      expect(agendaMatches(visit, 'overdue', '')).toBe(false);
      expect(agendaMatches(visit, status, '')).toBe(true);
    }
  });
});
describe('WhatsApp links', () => {
  it('retains the supplied country code and strips formatting', () => {
    expect(whatsappUrl('+54 9 (2284) 123-456')).toBe('https://wa.me/5492284123456');
  });
  it('does not create a link for empty or incomplete numbers', () => {
    expect(whatsappUrl('')).toBeNull();
    expect(whatsappUrl('12345')).toBeNull();
    expect(whatsappUrl('1234567890123456')).toBeNull();
  });
});
