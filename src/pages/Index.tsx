import { useEffect, useMemo, useRef, useState } from "react";
import { PAIRS, TIMEFRAMES, TimeframeValue, Pair, fetchCandles, subscribeCandles } from "@/lib/markets";
import { Candle } from "@/lib/indicators";
import { generateSignal, SignalResult, Direction } from "@/lib/signal";
import { PairSelector } from "@/components/PairSelector";
import { TimeframeSelector } from "@/components/TimeframeSelector";
import { SignalPanel } from "@/components/SignalPanel";
import { MarketTicker } from "@/components/MarketTicker";
import { toast } from "sonner";

const PairMonitor = ({
  pair,
  timeframe,
  onPriceUpdate
}: {
  pair: Pair;
  timeframe: typeof TIMEFRAMES[number];
  onPriceUpdate: (td: string, price: number) => void;
}) => {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [liveCandle, setLiveCandle] = useState<Candle | null>(null);
  const [connected, setConnected] = useState(false);

  const lastSignalDir   = useRef<Direction>("WAIT");
  const lastSignalPrice = useRef<number>(0);
  const lastSignalBar   = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;

    fetchCandles(pair, timeframe.td, 200)
      .then(data => {
        if (cancelled) return;
        setCandles(data);
        unsub = subscribeCandles(pair, timeframe.td, (c, isFinal) => {
          setConnected(true);
          setLiveCandle(c);
          onPriceUpdate(pair.td, c.close);
          if (isFinal) {
            setCandles(prev => {
              const last = prev[prev.length - 1];
              if (last && last.time === c.time) return [...prev.slice(0, -1), c];
              return [...prev.slice(-199), c];
            });
          }
        });
      })
      .catch(err => {
        if (cancelled) return;
        toast.error(`Falha ao buscar ${pair.symbol}: ${err.message}`);
      });

    return () => { cancelled = true; if (unsub) unsub(); };
  }, [pair, timeframe.td, onPriceUpdate]);

  const composedCandles = useMemo(() => {
    if (!liveCandle || candles.length === 0) return candles;
    const last = candles[candles.length - 1];
    if (last.time === liveCandle.time) return [...candles.slice(0, -1), liveCandle];
    if (liveCandle.time > last.time) return [...candles, liveCandle];
    return candles;
  }, [candles, liveCandle]);

  const signal: SignalResult | null = useMemo(() => {
    if (composedCandles.length < 60) return null;
    return generateSignal(
      composedCandles,
      timeframe.minutes,
      lastSignalDir.current,
      lastSignalPrice.current,
      lastSignalBar.current
    );
  }, [composedCandles, timeframe.minutes]);

  useEffect(() => {
    if (!signal || signal.direction === "WAIT") return;
    const barSec = timeframe.minutes * 60;
    const currentBar = Math.floor(Date.now() / 1000 / barSec) * barSec;
    if (currentBar !== lastSignalBar.current || signal.direction !== lastSignalDir.current) {
      lastSignalDir.current   = signal.direction;
      lastSignalPrice.current = signal.price;
      lastSignalBar.current   = currentBar;
    }
  }, [signal, timeframe.minutes]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2 gap-3 flex-wrap">
        <h3 className="font-display font-black text-xl tracking-wider flex items-baseline gap-3">
          <span>{pair.symbol}</span>
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.25em] font-bold">
            {timeframe.label}
          </span>
        </h3>
        {connected && <span className="live-dot" />}
      </div>
      <SignalPanel signal={signal} pair={pair.symbol} timeframeLabel={timeframe.label} timeframeMinutes={timeframe.minutes} livePrice={liveCandle?.close} />
    </div>
  );
};

const Index = () => {
  const [selectedPairs, setSelectedPairs] = useState<Pair[]>([PAIRS[0]]);
  const [tf, setTf] = useState<TimeframeValue>("5m");
  const [prices, setPrices] = useState<Record<string, number>>({});

  const tfMeta = useMemo(() => TIMEFRAMES.find(t => t.value === tf)!, [tf]);

  const togglePair = (p: Pair) => {
    setSelectedPairs(prev => {
      const exists = prev.find(item => item.td === p.td);
      if (exists) {
        if (prev.length <= 1) return prev;
        return prev.filter(item => item.td !== p.td);
      }
      return [...prev, p];
    });
  };

  const updatePrice = (td: string, price: number) => {
    setPrices(prev => {
      if (prev[td] === price) return prev;
      return { ...prev, [td]: price };
    });
  };

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "long", year: "numeric"
  });

  return (
    <div className="min-h-screen bg-background relative selection:bg-primary/20">
      <div className="border-b border-border/40 bg-background/60 backdrop-blur-xl">
        <div className="container flex items-center justify-between py-2.5 text-[11px] font-mono">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-bull/5 border border-bull/20 text-bull font-bold">
              <span className="live-dot" />
              <span>CONTA REAL</span>
            </div>
            <span className="text-muted-foreground/60 capitalize hidden lg:inline">{dateStr}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="live-dot" />
              <span className="text-bull tracking-widest font-black uppercase">MERCADO ABERTO</span>
            </div>
          </div>
        </div>
      </div>

      <header className="border-b border-border/40 bg-background/40 backdrop-blur-xl sticky top-0 z-20">
        <div className="container py-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl sm:text-6xl font-display font-black tracking-tighter leading-none flex items-baseline gap-2">
              <span className="italic font-light text-muted-foreground/40 text-2xl sm:text-4xl">O</span>
              <span className="bg-gradient-to-br from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent drop-shadow-[0_2px_8px_hsl(var(--primary)/0.3)]">
                Elder
              </span>
              <span className="bg-gradient-to-br from-primary via-primary to-primary/60 bg-clip-text text-transparent drop-shadow-[0_2px_12px_hsl(var(--primary)/0.6)]">
                Trader
              </span>
              <span className="ml-1 px-2.5 py-0.5 text-[10px] sm:text-[11px] font-mono font-black tracking-widest bg-primary text-primary-foreground rounded-sm shadow-[0_0_20px_hsl(var(--primary)/0.4)]">
                PRO
              </span>
            </h1>
            <p className="text-[11px] font-mono tracking-[0.25em] text-primary/80 mt-2.5 uppercase font-bold">
              Terminal Institucional · Precisão em Tempo Real
            </p>
          </div>
          <div className="hidden md:flex items-center gap-8 text-right">
            <div>
              <div className="label-mono opacity-50">Sinais Gerados</div>
              <div className="font-mono font-bold tabular text-foreground text-sm mt-0.5">Verificado · 24h</div>
            </div>
            <div className="divider-vertical-dotted h-10 opacity-30" />
            <div>
              <div className="label-mono opacity-50">Fluxo de Dados</div>
              <div className="font-mono font-bold tabular text-bull text-sm mt-0.5">Tempo Real</div>
            </div>
          </div>
        </div>
      </header>

      <MarketTicker />

      <main className="container py-8 space-y-6">
        <section className="premium-card rounded-lg p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <span className="label-mono">Configurações de Busca</span>
                <span className="px-2 py-0.5 rounded-sm bg-primary/10 border border-primary/30 text-[10px] font-mono tracking-widest text-primary uppercase font-bold">
                  Automático
                </span>
              </div>
              <h2 className="text-3xl font-display font-black tracking-tighter">
                Busca de Gatilhos <span className="text-primary italic">Ativa</span>
              </h2>
              <p className="text-xs font-mono text-muted-foreground mt-2 max-w-md">
                O sistema monitora simultaneamente todos os ativos selecionados no tempo gráfico escolhido, buscando por convergências institucionais.
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <span className="label-mono">Tempo Gráfico Global</span>
              <TimeframeSelector value={tf} onChange={setTf} />
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
          <aside className="space-y-6">
            <PairSelector
              selectedPairs={selectedPairs}
              onToggle={togglePair}
              prices={prices}
            />
          </aside>
          <section className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
            {selectedPairs.map(p => (
              <PairMonitor
                key={p.td}
                pair={p}
                timeframe={tfMeta}
                onPriceUpdate={updatePrice}
              />
            ))}
          </section>
        </div>

        <footer className="pt-8 mt-8 border-t border-border/40">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] font-mono text-muted-foreground/60">
            <div>
              <span className="font-display italic text-foreground/80 font-bold">The Elder Trader</span>
            </div>
            <div className="tracking-widest uppercase font-bold">
              Opere com Responsabilidade
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default Index;
