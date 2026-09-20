import { useState, useCallback, useEffect } from 'react';
import { Calculator, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Op = '+' | '-' | '×' | '÷';

/** Formatea un número para mostrarlo con coma decimal y separador de miles. */
function formatDisplay(n: number): string {
  if (!isFinite(n)) return 'Error';
  // Redondeamos a 8 decimales para evitar ruido de coma flotante
  const rounded = Math.round(n * 1e8) / 1e8;
  const [intPart, decPart] = String(Math.abs(rounded)).split('.');
  const intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = rounded < 0 ? '-' : '';
  return sign + intFmt + (decPart ? `,${decPart}` : '');
}

const opPriority: Record<Op, number> = { '+': 1, '-': 1, '×': 2, '÷': 2 };

function applyOp(a: number, b: number, op: Op): number {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '×': return a * b;
    case '÷': return b === 0 ? NaN : a / b;
  }
}

export default function FloatingCalculator() {
  const [open, setOpen] = useState(false);

  // Entrada en edición (string con coma decimal). Vacío cuando se usa un resultado.
  const [entry, setEntry] = useState('');
  // Pila de operaciones en notación con prioridad: [valor, op, valor, op, ...]
  const [expr, setExpr] = useState<{ val: number; op: Op | null }[]>([]);
  const [justEvaluated, setJustEvaluated] = useState(false);

  const entryNum = entry === '' || entry === '-' ? 0 : parseFloat(entry.replace(/\./g, '').replace(',', '.'));

  const currentTotal = useCallback((): number => {
    if (expr.length === 0) return entryNum;
    // Evalúa respetando prioridad de operadores
    const stack: { val: number; op: Op | null }[] = expr.map(e => ({ ...e }));
    // Agregamos el valor de entrada como el último operando sin operador
    const items = [...stack, { val: entryNum, op: null }];
    // Primera pasada: × y ÷
    const pass1: { val: number; op: Op | null }[] = [{ ...items[0] }];
    for (let i = 1; i < items.length; i++) {
      const prev = pass1[pass1.length - 1];
      const cur = items[i];
      if (prev.op === '×' || prev.op === '÷') {
        const result = applyOp(prev.val, cur.val, prev.op);
        pass1[pass1.length - 1] = { val: result, op: cur.op };
      } else {
        pass1.push({ ...cur });
      }
    }
    // Segunda pasada: + y -
    let acc = pass1[0].val;
    for (let i = 1; i < pass1.length; i++) {
      const cur = pass1[i];
      const prev = pass1[i - 1];
      acc = applyOp(acc, cur.val, prev.op!);
    }
    return acc;
  }, [expr, entryNum]);

  const pressDigit = (d: string) => {
    if (justEvaluated) {
      setExpr([]);
      setEntry(d);
      setJustEvaluated(false);
      return;
    }
    if (d === ',') {
      if (entry.includes(',')) return;
      setEntry(prev => (prev === '' ? '0,' : prev + ','));
    } else {
      // Evita ceros a la izquierda
      if (entry === '0') setEntry(d);
      else if (entry === '-0') setEntry('-' + d);
      else setEntry(prev => prev + d);
    }
  };

  const pressOp = (op: Op) => {
    if (justEvaluated) {
      // Continuamos desde el resultado
      setJustEvaluated(false);
      setExpr([{ val: entryNum, op }]);
      setEntry('');
      return;
    }
    if (entry === '') {
      // Si ya hay un operador pendiente, lo reemplazamos
      if (expr.length > 0) {
        setExpr(prev => prev.map((e, i) => (i === prev.length - 1 ? { ...e, op } : e)));
      }
      return;
    }
    setExpr(prev => [...prev, { val: entryNum, op }]);
    setEntry('');
  };

  const pressEquals = () => {
    if (expr.length === 0) {
      // Sin operación: solo formateamos la entrada
      if (entry !== '') {
        setExpr([{ val: entryNum, op: null }]);
        setEntry(formatDisplay(entryNum));
        setJustEvaluated(true);
      }
      return;
    }
    const total = currentTotal();
    setExpr([{ val: total, op: null }]);
    setEntry(formatDisplay(total));
    setJustEvaluated(true);
  };

  const pressClear = () => {
    setEntry('');
    setExpr([]);
    setJustEvaluated(false);
  };

  const pressBackspace = () => {
    if (justEvaluated) {
      pressClear();
      return;
    }
    setEntry(prev => prev.slice(0, -1));
  };

  const pressSign = () => {
    if (entry === '') return;
    setEntry(prev => (prev.startsWith('-') ? prev.slice(1) : '-' + prev));
  };

  const pressPercent = () => {
    if (entry === '') return;
    const base = expr.length > 0 ? expr[0].val : entryNum;
    const pct = (base * entryNum) / 100;
    setEntry(formatDisplay(pct));
    setJustEvaluated(false);
  };

  // Vista previa del resultado parcial mientras se tipea (no tras un =)
  const preview = !justEvaluated && expr.length > 0 && entry !== '' ? formatDisplay(currentTotal()) : '';

  const displayValue = entry === '' ? (expr.length > 0 ? formatDisplay(expr[0].val) : '0') : entry;

  // Soporte de teclado físico cuando el panel está abierto
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      // Dígitos
      if (/^[0-9]$/.test(k)) { pressDigit(k); return; }
      // Coma decimal: tanto "," como "." del teclado
      if (k === ',' || k === '.') { e.preventDefault(); pressDigit(','); return; }
      // Operadores
      if (k === '+') { pressOp('+'); return; }
      if (k === '-') { pressOp('-'); return; }
      if (k === '*') { e.preventDefault(); pressOp('×'); return; }
      if (k === '/') { e.preventDefault(); pressOp('÷'); return; }
      // Igual / Enter
      if (k === 'Enter' || k === '=') { e.preventDefault(); pressEquals(); return; }
      // Borrar todo con Escape
      if (k === 'Escape') { setOpen(false); return; }
      // Retroceso
      if (k === 'Backspace') { e.preventDefault(); pressBackspace(); return; }
      // Porcentaje
      if (k === '%') { e.preventDefault(); pressPercent(); return; }
      // Cambio de signo con la tecla "p" o "#"
      if (k === 'p' || k === '#') { pressSign(); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry, expr, justEvaluated]);

  const KeyBtn = ({
    label,
    onClick,
    variant = 'outline',
    className = '',
    span = 1,
  }: {
    label: React.ReactNode;
    onClick: () => void;
    variant?: 'outline' | 'secondary' | 'default';
    className?: string;
    span?: number;
  }) => (
    <button
      onClick={onClick}
      className={`h-12 rounded-lg text-base font-medium transition-colors ${
        variant === 'default'
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : variant === 'secondary'
          ? 'bg-muted hover:bg-muted/70'
          : 'border bg-card hover:bg-accent'
      } ${span === 2 ? 'col-span-2' : ''} ${className}`}
    >
      {label}
    </button>
  );

  return (
    <>
      {/* Botón flotante */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-transform hover:scale-105"
          aria-label="Abrir calculadora"
        >
          <Calculator className="h-6 w-6" />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex w-[300px] flex-col rounded-2xl border bg-card shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b bg-primary px-4 py-3">
            <div className="flex items-center gap-2 text-primary-foreground">
              <Calculator className="h-5 w-5" />
              <span className="font-semibold text-sm">Calculadora</span>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Display */}
          <div className="px-4 py-3 text-right border-b">
            <div className="text-muted-foreground text-xs h-4 truncate">
              {!justEvaluated && expr.length > 0
                ? expr.map(e => `${formatDisplay(e.val)} ${e.op ?? ''}`).join(' ') + (entry ? ` ${entry}` : '')
                : ''}
            </div>
            <div className="text-3xl font-semibold tracking-tight truncate mt-1">{displayValue}</div>
            {preview && <div className="text-xs text-primary mt-0.5">= {preview}</div>}
          </div>

          {/* Teclado */}
          <div className="grid grid-cols-4 gap-1.5 p-3">
            <KeyBtn label="C" onClick={pressClear} variant="secondary" />
            <KeyBtn label="±" onClick={pressSign} variant="secondary" />
            <KeyBtn label="%" onClick={pressPercent} variant="secondary" />
            <KeyBtn label="÷" onClick={() => pressOp('÷')} variant="secondary" />

            <KeyBtn label="7" onClick={() => pressDigit('7')} />
            <KeyBtn label="8" onClick={() => pressDigit('8')} />
            <KeyBtn label="9" onClick={() => pressDigit('9')} />
            <KeyBtn label="×" onClick={() => pressOp('×')} variant="secondary" />

            <KeyBtn label="4" onClick={() => pressDigit('4')} />
            <KeyBtn label="5" onClick={() => pressDigit('5')} />
            <KeyBtn label="6" onClick={() => pressDigit('6')} />
            <KeyBtn label="−" onClick={() => pressOp('-')} variant="secondary" />

            <KeyBtn label="1" onClick={() => pressDigit('1')} />
            <KeyBtn label="2" onClick={() => pressDigit('2')} />
            <KeyBtn label="3" onClick={() => pressDigit('3')} />
            <KeyBtn label="+" onClick={() => pressOp('+')} variant="secondary" />

            <KeyBtn label="0" onClick={() => pressDigit('0')} span={2} />
            <KeyBtn label="," onClick={() => pressDigit(',')} />
            <KeyBtn label="=" onClick={pressEquals} variant="default" />

            <KeyBtn label="⌫" onClick={pressBackspace} className="col-span-4 h-10" />
          </div>
        </div>
      )}
    </>
  );
}
