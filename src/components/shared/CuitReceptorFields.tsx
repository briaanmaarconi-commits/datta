import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { lookupCuit } from '@/lib/cuitLookup';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Search } from 'lucide-react';

interface Props {
  cuit: string;
  razonSocial: string;
  onCuitChange: (v: string) => void;
  onRazonSocialChange: (v: string) => void;
}

/**
 * Campos CUIT + Razón Social del receptor.
 * Al completar los 11 dígitos (o con la lupa) consulta el padrón de ARCA
 * y autocompleta la razón social, que queda editable.
 */
export default function CuitReceptorFields({ cuit, razonSocial, onCuitChange, onRazonSocialChange }: Props) {
  const { establishmentId } = useAuth();
  const [loading, setLoading] = useState(false);
  const lastLookup = useRef('');

  const lookup = async (digits: string) => {
    if (!establishmentId || loading) return;
    lastLookup.current = digits;
    setLoading(true);
    try {
      const res = await lookupCuit(establishmentId, digits);
      onRazonSocialChange(res.razon_social);
      toast.success('Razón social encontrada en ARCA');
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo consultar el padrón de ARCA');
    } finally {
      setLoading(false);
    }
  };

  // Autocompletar al llegar a 11 dígitos
  useEffect(() => {
    const digits = cuit.replace(/\D/g, '');
    if (digits.length !== 11 || digits === lastLookup.current) return;
    const t = setTimeout(() => lookup(digits), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuit, establishmentId]);

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="receptor-cuit">CUIT del receptor</Label>
        <div className="flex gap-2">
          <Input
            id="receptor-cuit"
            placeholder="20-12345678-9"
            value={cuit}
            onChange={e => onCuitChange(e.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            title="Buscar razón social en ARCA"
            disabled={loading || cuit.replace(/\D/g, '').length !== 11}
            onClick={() => lookup(cuit.replace(/\D/g, ''))}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="receptor-razon" className="flex items-center gap-2">
          Razón Social del receptor
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </Label>
        <Input
          id="receptor-razon"
          placeholder="Se completa solo al cargar el CUIT"
          value={razonSocial}
          onChange={e => onRazonSocialChange(e.target.value)}
        />
      </div>
    </>
  );
}
