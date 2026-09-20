import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

const PHRASES = [
  { text: "Cada mesa es una oportunidad para hacer sonreír a alguien. ¡Dale con todo! 💪", emoji: "🌟" },
  { text: "Tu actitud define la experiencia del cliente. ¡Hoy vas a brillar! ✨", emoji: "🔥" },
  { text: "Un buen servicio se recuerda para siempre. ¡Hacé que hoy sea inolvidable!", emoji: "⭐" },
  { text: "La diferencia entre un buen restaurante y uno excelente sos vos. ¡A romperla!", emoji: "🚀" },
  { text: "Cada plato que llevás es una oportunidad de hacer feliz a alguien. ¡Disfrutá el turno!", emoji: "😊" },
  { text: "Los mejores meseros no solo sirven comida, crean momentos. ¡Hoy es tu día!", emoji: "🎯" },
  { text: "Tu energía contagia al equipo y a los clientes. ¡Arrancá con la mejor onda!", emoji: "⚡" },
  { text: "Recordá: un cliente feliz siempre vuelve. ¡Hacé la diferencia hoy!", emoji: "💯" },
  { text: "No hay mesa chica ni grande, hay atención excelente. ¡Vamos con todo!", emoji: "🏆" },
  { text: "La hospitalidad es un arte y vos sos el artista. ¡A crear tu obra maestra!", emoji: "🎨" },
  { text: "Sonreí, escuchá y sorprendé. ¡Esa es la fórmula del éxito!", emoji: "😄" },
  { text: "Hoy puede ser el mejor turno de tu vida. ¡Solo depende de tu actitud!", emoji: "💪" },
];

const SESSION_KEY = 'waiter_motivational_shown';

export default function MotivationalDialog() {
  const [open, setOpen] = useState(false);
  const [phrase] = useState(() => PHRASES[Math.floor(Math.random() * PHRASES.length)]);

  useEffect(() => {
    const shown = sessionStorage.getItem(SESSION_KEY);
    if (!shown) {
      setOpen(true);
      sessionStorage.setItem(SESSION_KEY, 'true');
    }
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md text-center border-primary/30 bg-gradient-to-b from-card to-card/95">
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-3xl">
            {phrase.emoji}
          </div>
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-5 w-5" />
            <span className="text-sm font-semibold uppercase tracking-wider">Mensaje del día</span>
            <Sparkles className="h-5 w-5" />
          </div>
          <p className="text-lg font-medium leading-relaxed px-2">
            {phrase.text}
          </p>
          <Button onClick={() => setOpen(false)} className="mt-2 px-8">
            ¡Vamos! 🙌
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
