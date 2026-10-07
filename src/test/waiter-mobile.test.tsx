import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsMobile } from '@/hooks/use-mobile';
import MotivationalDialog from '@/components/waiter/MotivationalDialog';
import WaiterCallNotifications from '@/components/waiter/WaiterCallNotifications';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('waiter mobile compatibility', () => {
  it('renders and toggles notifications when session storage access is blocked', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });
    render(<WaiterCallNotifications establishmentId={null} tables={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Llamadas activas' }));
    expect(screen.getByRole('button', { name: 'Llamadas silenciadas' })).toBeVisible();
  });

  it('keeps the welcome dialog usable when session storage is full', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    });
    render(<MotivationalDialog />);
    expect(screen.getByText('Mensaje del día')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Vamos/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('supports mobile browsers with legacy media-query listeners', () => {
    let listener: (() => void) | undefined;
    const media = {
      matches: true,
      addListener: vi.fn((callback: () => void) => { listener = callback; }),
      removeListener: vi.fn(),
    };
    vi.spyOn(window, 'matchMedia').mockReturnValue(media as unknown as MediaQueryList);
    const { result, unmount } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
    act(() => { media.matches = false; listener?.(); });
    expect(result.current).toBe(false);
    unmount();
    expect(media.removeListener).toHaveBeenCalledWith(listener);
  });
});
