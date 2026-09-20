import { useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Ingredient {
  id: string;
  name: string;
  unit?: string;
  current_stock?: number;
}

interface Props {
  ingredients: Ingredient[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  /** Show "(stock unidad)" next to the name in the list */
  showStock?: boolean;
}

export default function IngredientCombobox({ ingredients, value, onChange, placeholder = 'Seleccionar ingrediente', showStock = false }: Props) {
  const [open, setOpen] = useState(false);
  const selected = ingredients.find(i => i.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="flex items-center gap-2 truncate">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {selected ? selected.name : <span className="text-muted-foreground">{placeholder}</span>}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar ingrediente..." />
          <CommandList>
            <CommandEmpty>No se encontraron ingredientes.</CommandEmpty>
            <CommandGroup>
              {ingredients.map(ing => (
                <CommandItem
                  key={ing.id}
                  value={ing.name}
                  onSelect={() => { onChange(ing.id); setOpen(false); }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === ing.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="flex-1">{ing.name}</span>
                  {showStock && ing.unit !== undefined && (
                    <span className="text-xs text-muted-foreground ml-2">
                      {Number(ing.current_stock ?? 0)} {ing.unit}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
