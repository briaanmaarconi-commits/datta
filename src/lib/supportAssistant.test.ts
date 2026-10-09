import { describe, expect, it } from 'vitest';
import { buildTicketDraft, isSupportComposeState } from './supportAssistant';
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX } from './support';

describe('buildTicketDraft', () => {
  it('usa el título que sugiere el asistente y arma la descripción con la charla', () => {
    const d = buildTicketDraft(
      [
        { role: 'user', content: 'La comanda no sale por la impresora de cocina' },
        { role: 'assistant', content: 'Probá desde Impresoras → Probar impresión.' },
        { role: 'user', content: 'Ya lo hice y sigue sin imprimir' },
      ],
      'La impresora de cocina no imprime',
      'Impresoras',
    );
    expect(d.title).toBe('La impresora de cocina no imprime');
    expect(d.description).toContain('Qué me pasa:\nLa comanda no sale por la impresora de cocina\nYa lo hice y sigue sin imprimir');
    expect(d.description).toContain('Sección donde estaba: Impresoras');
    expect(d.description).toContain('Asistente: Probá desde Impresoras → Probar impresión.');
  });

  it('sin título sugerido usa la primera consulta, recortada', () => {
    const d = buildTicketDraft([{ role: 'user', content: 'x'.repeat(300) }]);
    expect(d.title.length).toBe(TITLE_MAX);
    expect(d.title.endsWith('…')).toBe(true);
  });

  it('siempre cumple los mínimos y máximos del formulario', () => {
    const short = buildTicketDraft([{ role: 'user', content: 'ayuda' }]);
    expect(short.title.length).toBeGreaterThanOrEqual(5);
    expect(short.description.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
    const long = buildTicketDraft([{ role: 'user', content: 'a'.repeat(4000) }, { role: 'assistant', content: 'b'.repeat(4000) }]);
    expect(long.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });
});

describe('isSupportComposeState', () => {
  it('reconoce solo el borrador bien formado', () => {
    expect(isSupportComposeState({ compose: { title: 'a', description: 'b' } })).toBe(true);
    expect(isSupportComposeState(null)).toBe(false);
    expect(isSupportComposeState({ compose: { title: 1 } })).toBe(false);
  });
});
