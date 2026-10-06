import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Hook para listas largas: muestra `initial` elementos y un botón
 * "Ver más" para desplegar el resto.
 */
export function useShowMore<T>(items: T[], initial = 10) {
  const [expanded, setExpanded] = useState(false);
  const visible = useMemo(
    () => (expanded ? items : items.slice(0, initial)),
    [items, expanded, initial]
  );
  const hiddenCount = items.length - visible.length;
  return { visible, expanded, setExpanded, hiddenCount };
}

export function ShowMoreButton({
  hiddenCount,
  expanded,
  onToggle,
}: {
  hiddenCount: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!expanded && hiddenCount <= 0) return null;
  return (
    <div className="flex justify-center pt-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggle}
        className="text-[#EA580C] hover:text-[#EA580C] hover:bg-orange-50 gap-1"
      >
        {expanded ? (
          <>
            Ver menos <ChevronUp className="h-4 w-4" />
          </>
        ) : (
          <>
            Ver más ({hiddenCount}) <ChevronDown className="h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  );
}
