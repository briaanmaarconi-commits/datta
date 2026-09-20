import { LogOut, ChefHat } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="h-14 flex items-center justify-between border-b px-6 bg-card">
        <div className="flex items-center gap-2">
          <ChefHat className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight text-primary">datta</h1>
          <span className="ml-2 text-sm text-muted-foreground">Cocina</span>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut} className="gap-2">
          <LogOut className="h-4 w-4" />
          Salir
        </Button>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
