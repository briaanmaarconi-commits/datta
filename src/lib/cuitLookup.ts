import { invokeAfip } from '@/lib/afipInvoke';

export interface CuitLookupResult {
  razon_social: string;
  tipo_persona: string | null;
}

/** Consulta el padrón de ARCA por CUIT y devuelve la razón social. */
export async function lookupCuit(establishmentId: string, cuit: string): Promise<CuitLookupResult> {
  return await invokeAfip<CuitLookupResult>({
    action: 'padron',
    establishment_id: establishmentId,
    cuit_consultado: cuit,
  });
}
