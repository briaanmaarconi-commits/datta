import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDown, ArrowRight, BarChart3, Boxes, CalendarDays, ChefHat,
  LayoutDashboard, MessageCircle, MonitorSmartphone, ReceiptText, Sparkles,
  Store, UserRound, Users, WalletCards, Star, Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import dashboard from '@/assets/presentation/dashboard.png';
import analyticsOverview from '@/assets/presentation/analytics-overview.png';
import analyticsIncome from '@/assets/presentation/analytics-income.png';
import analyticsDishes from '@/assets/presentation/analytics-top-dishes.png';
import analyticsDemand from '@/assets/presentation/analytics-demand.png';
import floorPlan from '@/assets/presentation/floor-plan.png';
import stock from '@/assets/presentation/stock.png';
import reservations from '@/assets/presentation/reservations.png';
import './Presentation.css';

const solutions = [
  ['Pedidos dispersos y errores de comanda', 'Pedidos conectados entre salón, cocina y caja.'],
  ['Demoras que nadie detecta a tiempo', 'Monitoreo de preparación y estados en tiempo real.'],
  ['Caja difícil de controlar', 'Turnos, ingresos, egresos, arqueo y cierres claros.'],
  ['Decisiones tomadas por intuición', 'Ventas, demanda, productos y rentabilidad con datos reales.'],
  ['Stock sin seguimiento', 'Compras, costos, faltantes y sugerencias en un mismo flujo.'],
  ['Reservas en cuadernos o mensajes', 'Agenda ordenada por mesa, horario y cantidad de personas.'],
  ['Facturación separada de la operación', 'Comprobantes y facturación ARCA integrados al cobro.'],
  ['Información repartida entre sistemas', 'Una sola plataforma para todo el restaurante.'],
];

const ecosystem = [
  [LayoutDashboard, 'Dashboard', 'La operación resumida en una vista.'],
  [MonitorSmartphone, 'Salón y mesas', 'Estados y pedidos sincronizados.'],
  [UserRound, 'Mozos', 'Toma de comandas desde el sistema, directamente en el salón.'],
  [ChefHat, 'Cocina', 'Comandas, tiempos y platos listos.'],
  [WalletCards, 'Caja', 'Cobros, turnos y control diario.'],
  [ReceiptText, 'Facturación', 'Comprobantes integrados con ARCA.'],
  [Boxes, 'Stock y costos', 'Compras, márgenes y faltantes.'],
  [CalendarDays, 'Reservas', 'Agenda conectada al salón.'],
  [BarChart3, 'Analíticas', 'Información para decidir mejor.'],
  [Sparkles, 'Asistente IA', 'Alertas y oportunidades automáticas.'],
];

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true);
        observer.unobserve(element);
      }
    }, { threshold: 0.14, rootMargin: '0px 0px -7% 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={elementRef} className={`datta-reveal ${visible ? 'is-visible' : ''} ${className}`} style={{ '--reveal-delay': `${delay}ms` } as React.CSSProperties}>
      {children}
    </div>
  );
}

function BrowserFrame({ src, alt, contain = false }: { src: string; alt: string; contain?: boolean }) {
  return (
    <div className="datta-screen overflow-hidden rounded-md">
      <div className="datta-browserbar flex h-9 items-center gap-2 border-b px-3">
        <span className="datta-browser-dot datta-browser-dot-primary" />
        <span className="datta-browser-dot" />
        <span className="datta-browser-dot" />
        <span className="datta-browser-address ml-3 text-[10px]">dattagestion.com</span>
      </div>
      <img src={src} alt={alt} loading="lazy" className={`w-full ${contain ? 'object-contain' : 'object-cover object-top'}`} />
    </div>
  );
}

function SectionIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <Reveal className="max-w-3xl">
      <p className="datta-kicker text-xs font-semibold">{eyebrow}</p>
      <h2 className="mt-4 font-display text-3xl font-semibold leading-tight md:text-5xl">{title}</h2>
      <p className="datta-muted mt-5 max-w-2xl text-base leading-relaxed md:text-lg">{description}</p>
      <div className="datta-accent-line mt-7 h-px w-32" />
    </Reveal>
  );
}

export default function Presentation() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const updateProgress = () => {
      const height = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(height > 0 ? Math.min(100, (window.scrollY / height) * 100) : 0);
    };
    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);
    return () => {
      window.removeEventListener('scroll', updateProgress);
      window.removeEventListener('resize', updateProgress);
    };
  }, []);

  return (
    <main className="datta-presentation min-h-screen overflow-x-hidden">
      <header className="datta-nav fixed inset-x-0 top-0 z-50 border-b">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 md:px-10">
          <a href="#inicio" className="datta-logo font-display text-2xl font-bold" aria-label="Ir al inicio">datta<span className="datta-logo-line" /></a>
          <nav className="hidden items-center gap-7 text-xs md:flex" aria-label="Secciones de la presentación">
            <a href="#soluciones">Soluciones</a><a href="#plataforma">Plataforma</a><a href="#analiticas">Analíticas</a><a href="#contacto">Contacto</a>
          </nav>
          <Button asChild size="sm"><a href="#contacto">Conversemos</a></Button>
        </div>
        <div className="datta-progress" style={{ transform: `scaleX(${progress / 100})` }} />
      </header>

      <section id="inicio" className="datta-hero relative flex min-h-[86svh] items-center pt-16">
        <div className="mx-auto w-full max-w-[1240px] px-5 py-20 md:px-10">
          <Reveal className="max-w-4xl">
            <h1 className="datta-cover-logo font-display font-bold leading-none">datta<span className="datta-logo-line" /></h1>
            <p className="mt-8 max-w-3xl font-display text-3xl font-semibold leading-tight md:text-5xl">Sistema integral de negocios gastronómicos.</p>
            <p className="datta-muted mt-7 max-w-2xl text-lg leading-relaxed md:text-xl">Todo tu restaurante, en una sola plataforma. Datta conecta cada área para que trabajes con más control, menos errores y mejores decisiones.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg"><a href="#plataforma">Conocer Datta <ArrowDown className="ml-2 h-4 w-4" /></a></Button>
              <Button asChild variant="outline" size="lg" className="datta-outline"><a href="#contacto">Contactar</a></Button>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="soluciones" className="datta-section datta-section-raised">
        <div className="mx-auto max-w-[1240px] px-5 md:px-10">
          <Reveal className="max-w-4xl">
            <p className="datta-kicker text-xs font-semibold">UNA OPERACIÓN MÁS SIMPLE</p>
            <h2 className="datta-problems-title mt-4 font-display font-semibold leading-none">Los problemas que resolvemos.</h2>
            <p className="datta-muted mt-6 max-w-2xl text-base leading-relaxed md:text-lg">Datta reemplaza procesos aislados por un flujo conectado, desde que se toma el pedido hasta que se analiza el resultado.</p>
            <div className="datta-accent-line mt-7 h-px w-32" />
          </Reveal>
          <div className="mt-12 grid gap-3 md:grid-cols-2">
            {solutions.map(([problem, answer], index) => (
              <Reveal key={problem} delay={(index % 2) * 90}>
                <div className="datta-panel flex min-h-28 gap-4 border p-5">
                  <span className="datta-orange-soft flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-sm font-bold">{String(index + 1).padStart(2, '0')}</span>
                  <div><p className="font-semibold">{problem}</p><p className="datta-muted mt-2 text-sm leading-relaxed">{answer}</p></div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="plataforma" className="datta-section">
        <div className="mx-auto max-w-[1240px] px-5 md:px-10">
          <SectionIntro eyebrow="TODO EL RESTAURANTE EN UN SOLO LUGAR" title="Cada área trabaja conectada." description="Una plataforma pensada para el ritmo real de un restaurante, con una vista específica para cada rol." />
          <div className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ecosystem.map(([Icon, label, copy], index) => {
              const Component = Icon as typeof Store;
              return <Reveal key={label as string} delay={(index % 3) * 80}><div className="datta-panel h-full border p-6"><Component className="datta-kicker h-6 w-6" /><p className="mt-5 font-semibold">{label as string}</p><p className="datta-muted mt-2 text-sm">{copy as string}</p></div></Reveal>;
            })}
          </div>
        </div>
      </section>

      <section className="datta-section datta-section-raised">
        <div className="mx-auto grid max-w-[1440px] gap-10 px-5 md:px-10 lg:grid-cols-[0.65fr_1.35fr] lg:items-center">
          <SectionIntro eyebrow="PANEL DE CONTROL" title="Lo importante, apenas abrís el sistema." description="Ventas, pedidos, ticket promedio, ocupación y recomendaciones inteligentes, en una lectura inmediata." />
          <Reveal delay={120}><BrowserFrame src={dashboard} alt="Panel de control de Datta" /></Reveal>
        </div>
      </section>

      <section className="datta-section">
        <div className="mx-auto grid max-w-[1440px] gap-10 px-5 md:px-10 lg:grid-cols-[1.35fr_0.65fr] lg:items-center">
          <Reveal><BrowserFrame src={floorPlan} alt="Plano real de mesas de Bodegón 65" /></Reveal>
          <SectionIntro eyebrow="SALÓN Y MESAS" title="El plano real, siempre actualizado." description="El equipo sabe qué está libre, ocupado, preparando o listo para entregar, sin perder tiempo consultando." />
        </div>
      </section>

      <section id="analiticas" className="datta-section datta-section-raised">
        <div className="mx-auto max-w-[1440px] px-5 md:px-10">
          <SectionIntro eyebrow="ANALÍTICAS" title="La operación se convierte en decisiones." description="Ingresos, pedidos, ticket promedio, tiempos y mesas atendidas se presentan como información clara y accionable." />
          <Reveal className="mt-12"><BrowserFrame src={analyticsOverview} alt="Panel de analíticas con datos reales" /></Reveal>
          <div className="mt-16 grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-center">
            <SectionIntro eyebrow="EVOLUCIÓN DE INGRESOS" title="Entendé la fluctuación, no solo el total." description="La curva diaria permite detectar crecimiento, caídas y días clave para ajustar compras, personal y promociones." />
            <Reveal delay={100}><BrowserFrame src={analyticsIncome} alt="Gráfico de evolución de ingresos diarios" contain /></Reveal>
          </div>
          <div className="mt-12 grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-center">
            <SectionIntro eyebrow="PUNTO DE EQUILIBRIO" title="Cuánto vender para cubrir tus costos." description="Datta cruza los gastos fijos con el margen de contribución para calcular las ventas mínimas necesarias para no perder dinero. Comparalo con los ingresos del período para decidir si necesitás ajustar precios, costos o ventas." />
            <Reveal delay={100}>
              <div className="datta-panel border p-6 md:p-9">
                <div className="flex items-center gap-3"><Target className="datta-kicker h-5 w-5" /><h3 className="font-semibold">Punto de equilibrio</h3></div>
                <p className="datta-muted mt-2 text-xs">Ejemplo ilustrativo · período mensual</p>
                <p className="mt-8 font-display text-5xl font-semibold md:text-6xl">$750.000</p>
                <p className="datta-muted mt-3 text-sm">Ventas mínimas del mes para cubrir costos fijos y variables.</p>
                <div className="datta-equilibrium-scale relative mt-7 h-2 rounded-sm"><span className="datta-equilibrium-marker absolute inset-y-0 left-1/2 w-0.5" /></div>
                <div className="datta-muted mt-3 grid grid-cols-2 gap-4 text-xs"><span>Por debajo: no cubrís los costos</span><span>Por encima: generás ganancia</span></div>
                <p className="datta-muted mt-7 text-xs leading-relaxed">El valor real se calcula con los datos de cada restaurante. Este ejemplo no modifica la información de Bodegón 65.</p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="datta-section">
        <div className="mx-auto max-w-[1440px] px-5 md:px-10">
          <SectionIntro eyebrow="DEMANDA REAL" title="Qué se vende y cuándo se concentra la demanda." description="Los rankings muestran los platos que impulsan el negocio y el mapa de calor identifica con precisión los horarios pico." />
          <div className="mt-12 grid gap-5 lg:grid-cols-[0.72fr_1.28fr]">
            <Reveal><BrowserFrame src={analyticsDishes} alt="Ranking de platos más pedidos" contain /></Reveal>
            <Reveal delay={120}><BrowserFrame src={analyticsDemand} alt="Mapa de calor de demanda por día y hora" contain /></Reveal>
          </div>
        </div>
      </section>

      <section className="datta-section datta-section-raised">
        <div className="mx-auto grid max-w-[1440px] gap-10 px-5 md:px-10 lg:grid-cols-[0.65fr_1.35fr] lg:items-center">
          <SectionIntro eyebrow="RESERVAS" title="La agenda, conectada con las mesas." description="Centralizá horarios, cantidad de personas y estado. Al llegar el cliente, la reserva pasa al salón sin duplicar tareas." />
          <Reveal delay={120}><BrowserFrame src={reservations} alt="Gestión de reservas de Datta con datos personales protegidos" /></Reveal>
        </div>
      </section>

      <section id="resenas" className="datta-section">
        <div className="mx-auto max-w-[1240px] px-5 md:px-10">
          <SectionIntro eyebrow="RESEÑAS DE PLATOS Y MOZOS" title="La experiencia de tus clientes también cuenta." description="Los clientes pueden reseñar los platos y la atención de los mozos con estrellas y comentarios. Las opiniones sobre los platos ayudan a futuros clientes a elegir; las valoraciones del servicio permiten reconocer al equipo y detectar oportunidades de mejora." />
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {[{ title: 'Reseñas de platos', Icon: ReceiptText, copy: 'Valoración de cada plato, estrellas y comentarios reunidos en la carta.', comment: 'Muy buena presentación y sabor.' }, { title: 'Reseñas de mozos', Icon: UserRound, copy: 'Opiniones sobre la atención para conocer la experiencia en el salón.', comment: 'Atención amable y muy buena predisposición.' }].map(({ title, Icon, copy, comment }, index) => (
              <Reveal key={title} delay={index * 100}>
                <div className="datta-panel h-full border p-6 md:p-8">
                  <Icon className="datta-kicker h-6 w-6" /><h3 className="mt-5 font-display text-2xl font-semibold">{title}</h3>
                  <p className="datta-muted mt-3 text-sm leading-relaxed">{copy}</p>
                  <div className="datta-review-example mt-7 border-t pt-6">
                    <p className="datta-muted text-xs">Ejemplo ilustrativo de reseña</p>
                    <div className="datta-review-stars mt-4 flex gap-1" aria-label="5 de 5 estrellas">{[1, 2, 3, 4, 5].map(star => <Star key={star} className="h-5 w-5 fill-current" />)}</div>
                    <p className="mt-4 text-sm leading-relaxed">“{comment}”</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="datta-section">
        <div className="mx-auto max-w-[1440px] px-5 md:px-10">
          <SectionIntro eyebrow="STOCK + INTELIGENCIA ARTIFICIAL" title="Comprá mejor y anticipá lo que viene." description="Datta organiza compras y costos. El asistente analiza la operación y destaca alertas y oportunidades sin revisar planillas." />
          <div className="mt-12 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
            <Reveal><BrowserFrame src={stock} alt="Gestión de stock simple de Datta" /></Reveal>
            <Reveal delay={120} className="h-full">
              <div className="datta-panel flex h-full min-h-80 flex-col justify-center border p-7 md:p-10">
                <Sparkles className="datta-kicker h-9 w-9" />
                <h3 className="mt-6 font-display text-2xl font-semibold">Un asistente que mira el negocio con vos.</h3>
                <div className="mt-7 space-y-4">
                  {['Detecta productos destacados', 'Señala cambios de tendencia', 'Sugiere acciones concretas', 'Prioriza alertas relevantes'].map(item => <div key={item} className="flex items-center gap-3 text-sm"><span className="datta-bullet" />{item}</div>)}
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section id="contacto" className="datta-contact flex min-h-[82svh] items-center border-t">
        <div className="mx-auto w-full max-w-[1240px] px-5 py-24 md:px-10">
          <Reveal className="max-w-4xl">
            <p className="datta-kicker text-xs font-semibold">DATTA</p>
            <h2 className="mt-5 font-display text-4xl font-semibold leading-tight md:text-7xl">Tu restaurante, mejor gestionado.</h2>
            <p className="datta-muted mt-6 max-w-xl text-lg">Conversemos sobre cómo Datta puede adaptarse a tu operación.</p>
          </Reveal>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {[['2314-576149', 'https://wa.me/5492314576149'], ['2314-487074', 'https://wa.me/5492314487074']].map(([phone, href], index) => (
              <Reveal key={phone} delay={index * 100}>
                <a href={href} target="_blank" rel="noreferrer" className="datta-contact-link group flex items-center gap-4 border p-6">
                  <MessageCircle className="datta-kicker h-7 w-7" /><div><p className="text-sm font-semibold">WhatsApp comercial</p><p className="datta-muted mt-1">{phone}</p></div><ArrowRight className="ml-auto h-5 w-5 transition-transform group-hover:translate-x-1" />
                </a>
              </Reveal>
            ))}
          </div>
          <Reveal delay={140} className="mt-4"><div className="datta-panel flex items-center gap-4 border p-6"><Users className="datta-kicker h-7 w-7" /><div><p className="text-sm font-semibold">Atención al cliente</p><p className="datta-muted mt-1">Lunes a sábado, de 9:00 a 18:00</p></div></div></Reveal>
        </div>
      </section>
    </main>
  );
}
