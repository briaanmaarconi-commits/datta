import { LogOut, ChefHat } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { usePrivateTheme } from '@/hooks/usePrivateTheme';

export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  usePrivateTheme();

  return (
    <div className="workspace-shell flex min-h-screen flex-col">
      <header className="workspace-header justify-between">
        <div className="flex items-center gap-2">
          <ChefHat className="h-5 w-5 text-primary" />
          <h1 className="workspace-brand text-2xl">datta</h1>
          <span className="ml-2 text-sm text-muted-foreground">Cocina</span>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut} className="gap-2">
          <LogOut className="h-4 w-4" />
          Salir
        </Button>
      </header>
      <main className="workspace-main">{children}</main>
    </div>
  );
}
