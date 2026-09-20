import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, UtensilsCrossed } from 'lucide-react';
import { GROUP_LABELS, GROUP_LABELS_SINGULAR, MenuGroup, groupFromCategoryName } from '@/lib/menuGroups';

interface DailySpecialsProps {
  products: any[];
  categories?: any[];
  combos?: any[];
}

const GROUP_ORDER: MenuGroup[] = ['main', 'dessert', 'drink'];

export default function DailySpecials({ products, categories = [], combos = [] }: DailySpecialsProps) {
  const specials = products.filter(p => p.is_daily_special);
  const activeCombos = combos.filter(c => c.is_active !== false);
  if (specials.length === 0 && activeCombos.length === 0) return null;

  const categoryName = (id: string) => categories.find((c: any) => c.id === id)?.name;

  const grouped = GROUP_ORDER.map(group => ({
    group,
    items: specials.filter(p => groupFromCategoryName(categoryName(p.category_id)) === group),
  })).filter(g => g.items.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
        <h2 className="font-bold text-base">Menú del día</h2>
      </div>

      {activeCombos.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
          {activeCombos.map(c => {
            const items = (c.menu_combo_items || [])
              .slice()
              .sort((a: any, b: any) => a.sort_order - b.sort_order);
            const listPrice = items.reduce((s: number, i: any) => s + Number(i.products?.price || 0), 0);
            return (
              <Card key={c.id} className="flex-shrink-0 w-64 overflow-hidden border-amber-500/40 bg-amber-500/10">
                <CardContent className="p-0">
                  {c.image_url && (
                    <img src={c.image_url} alt={c.name} className="w-full h-28 object-cover" loading="lazy" />
                  )}
                  <div className="p-3 space-y-1.5">
                    <h3 className="font-semibold text-sm flex items-center gap-1.5">
                      <UtensilsCrossed className="h-4 w-4 text-amber-500" />
                      {c.name}
                    </h3>
                    {c.description && <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>}
                    <ul className="space-y-0.5">
                      {items.map((i: any) => (
                        <li key={i.id} className="text-xs text-muted-foreground">
                          <span className="uppercase tracking-wide">
                            {GROUP_LABELS_SINGULAR[i.item_group as MenuGroup]}
                          </span>
                          {' · '}
                          {i.products?.name}
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-1 items-center pt-1">
                      <Badge className="bg-amber-500 hover:bg-amber-600">${Number(c.price).toFixed(2)}</Badge>
                      {listPrice > Number(c.price) && (
                        <Badge variant="outline" className="line-through text-muted-foreground">
                          ${listPrice.toFixed(2)}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {grouped.map(({ group, items }) => (
        <div key={group} className="space-y-2">
          {grouped.length > 1 && (
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {GROUP_LABELS[group]}
            </h3>
          )}
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
            {items.map(p => (
              <Card key={p.id} className="flex-shrink-0 w-56 overflow-hidden border-amber-500/30 bg-amber-500/5">
                <CardContent className="p-0">
                  {p.image_url && (
                    <img src={p.image_url} alt={p.name} className="w-full h-28 object-cover" loading="lazy" />
                  )}
                  <div className="p-3 space-y-1">
                    <h3 className="font-semibold text-sm">{p.name}</h3>
                    {p.description && <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
                    <div className="flex gap-1 items-center">
                      {p.promo_active && p.promo_price != null ? (
                        <>
                          <Badge className="bg-amber-500 hover:bg-amber-600">${Number(p.promo_price).toFixed(2)}</Badge>
                          <Badge variant="outline" className="line-through text-muted-foreground">${Number(p.price).toFixed(2)}</Badge>
                        </>
                      ) : (
                        <Badge className="bg-amber-500 hover:bg-amber-600">${Number(p.price).toFixed(2)}</Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
