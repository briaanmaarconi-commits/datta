import bannerPromos from '@/assets/banner-promos.jpg';
import bannerPopular from '@/assets/banner-popular.jpg';
import bannerDesserts from '@/assets/banner-desserts.jpg';

interface PromoBannersProps {
  promoProducts: any[];
  popularProducts: any[];
  dessertProducts: any[];
  onSelectCategory?: (catName: string) => void;
}

export default function PromoBanners({ promoProducts, popularProducts, dessertProducts }: PromoBannersProps) {
  const banners = [
    { img: bannerPromos, label: 'Promociones', count: promoProducts.length, show: promoProducts.length > 0 },
    { img: bannerPopular, label: 'Los más pedidos', count: popularProducts.length, show: popularProducts.length > 0 },
    { img: bannerDesserts, label: 'Postres favoritos', count: dessertProducts.length, show: dessertProducts.length > 0 },
  ].filter(b => b.show);

  if (banners.length === 0) return null;

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
      {banners.map(b => (
        <div key={b.label} className="relative flex-shrink-0 w-64 h-32 rounded-xl overflow-hidden shadow-md">
          <img src={b.img} alt={b.label} className="w-full h-full object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-2 left-3 text-white">
            <p className="font-bold text-sm">{b.label}</p>
            <p className="text-xs opacity-80">{b.count} productos</p>
          </div>
        </div>
      ))}
    </div>
  );
}
