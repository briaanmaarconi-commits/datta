import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp } from 'lucide-react';

interface PopularDishesProps {
  products: any[];
  avgRatings: Record<string, { avg: number; count: number }>;
}

export default function PopularDishes({ products, avgRatings }: PopularDishesProps) {
  const popular = [...products]
    .sort((a, b) => (avgRatings[b.id]?.count || 0) - (avgRatings[a.id]?.count || 0))
    .slice(0, 6)
    .filter(p => avgRatings[p.id]?.count > 0);

  if (popular.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h2 className="font-bold text-base">Los más pedidos</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
        {popular.map((p, i) => (
          <Card key={p.id} className="flex-shrink-0 w-44 overflow-hidden">
            <CardContent className="p-0">
              {p.image_url && (
                <div className="relative">
                  <img src={p.image_url} alt={p.name} className="w-full h-24 object-cover" loading="lazy" />
                  <div className="absolute top-1 left-1 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </div>
                </div>
              )}
              <div className="p-2 space-y-1">
                <h3 className="font-semibold text-xs line-clamp-1">{p.name}</h3>
                <div className="flex justify-between items-center">
                  <Badge variant="outline" className="text-[10px]">${Number(p.price).toFixed(2)}</Badge>
                  <span className="text-[10px] text-muted-foreground">⭐ {avgRatings[p.id]?.avg.toFixed(1)} ({avgRatings[p.id]?.count})</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
