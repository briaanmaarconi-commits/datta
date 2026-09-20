import { useState } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Props {
  units: string[];
  value: string;
  onChange: (unit: string) => void;
  onCreate?: (unit: string) => void;
  className?: string;
}

export default function UnitCombobox({ units, value, onChange, onCreate, className }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const term = search.trim();
  const exists = units.some(u => u.toLowerCase() === term.toLowerCase());

  const select = (unit: string) => {
    onChange(unit);
    setSearch('');
    setOpen(false);
  };

  const create = () => {
    if (!term) return;
    onCreate?.(term);
    select(term);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('justify-between font-normal px-2', className)}
        >
          <span className="truncate">{value || <span className="text-muted-foreground">Unidad</span>}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar o crear..." value={search} onValueChange={setSearch} />
          <CommandList>
            {!term && <CommandEmpty>Sin unidades.</CommandEmpty>}
            <CommandGroup>
              {units.map(u => (
                <CommandItem key={u} value={u} onSelect={() => select(u)}>
                  <Check className={cn('mr-2 h-4 w-4', value === u ? 'opacity-100' : 'opacity-0')} />
                  {u}
                </CommandItem>
              ))}
              {term && !exists && (
                <CommandItem value={`__create_${term}`} onSelect={create}>
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar "{term}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
