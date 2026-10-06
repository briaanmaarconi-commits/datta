import { useLocation } from 'react-router-dom';
import { Info } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getSectionHelp, type SectionHelp as SectionHelpData } from '@/lib/sectionHelp';

function HelpBody({ help }: { help: SectionHelpData }) {
  return (
    <div className="space-y-2 text-sm">
      <p className="font-semibold text-foreground">{help.title}</p>
      <p className="text-muted-foreground">{help.what}</p>
      {help.bullets.length > 0 && (
        <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
          {help.bullets.map(b => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      {help.note && (
        <p className="rounded-md bg-muted px-2 py-1.5 text-xs text-foreground">
          <span className="font-medium">Tené en cuenta: </span>
          {help.note}
        </p>
      )}
    </div>
  );
}

export default function SectionHelp() {
  const { pathname } = useLocation();
  const help = getSectionHelp(pathname);
  if (!help) return null;

  const trigger = (
    <button
      type="button"
      aria-label={`Ayuda sobre ${help.title}`}
      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Info className="h-4 w-4" />
    </button>
  );

  return (
    <>
      {/* Escritorio: se abre al pasar el mouse */}
      <div className="hidden md:block">
        <HoverCard openDelay={120} closeDelay={80}>
          <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
          <HoverCardContent align="start" className="w-80 max-w-[90vw]">
            <HelpBody help={help} />
          </HoverCardContent>
        </HoverCard>
      </div>

      {/* Celular: se abre al tocar */}
      <div className="md:hidden">
        <Popover>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent align="start" className="w-72 max-w-[92vw]">
            <HelpBody help={help} />
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
}
