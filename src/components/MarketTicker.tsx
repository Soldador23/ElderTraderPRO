import { useEffect, useState } from "react";
import { PAIRS, fetchBinanceTicker, fetchMT4Tickers } from "@/lib/markets";

interface Tick {
  symbol: string;
  price: number;
  change: number;
}

const TICKER_PAIRS = PAIRS.slice(0, 12);

export const MarketTicker = () => {
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [flash, setFlash] = useState<Record<string, "up" | "down">>({});

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const cryptoPairs = TICKER_PAIRS.filter(p => p.category === "crypto");
        const fxPairs     = TICKER_PAIRS.filter(p => p.category !== "crypto");

        const [binanceData, mt4Data] = await Promise.all([
          fetchBinanceTicker(cryptoPairs),
          fetchMT4Tickers(fxPairs),
        ]);

        if (cancelled) return;

        const mapped: Tick[] = TICKER_PAIRS.map(p => {
          if (p.category === "crypto" && p.binance) {
            const d = binanceData[p.binance];
            if (!d) return null;
            return { symbol: p.symbol, price: d.price, change: d.change };
          } else if (p.mt4) {
            const d = mt4Data[p.td];
            if (!d) return null;
            return { symbol: p.symbol, price: d.price, change: 0 };
          }
          return null;
        }).filter(Boolean) as Tick[];

        if (mapped.length > 0) {
          setTicks(prev => {
            const newFlash: Record<string, "up" | "down"> = {};
            for (const t of mapped) {
              const old = prev.find(x => x.symbol === t.symbol);
              if (old && old.price !== t.price) {
                newFlash[t.symbol] = t.price > old.price ? "up" : "down";
              }
            }
            if (Object.keys(newFlash).length > 0) {
              setFlash(newFlash);
              setTimeout(() => setFlash({}), 600);
            }
            return mapped;
          });
        }
      } catch {
        // silencia
      }
    };

    load();
    // 1s para forex MT4 aparecer mudando em tempo real
    const id = setInterval(load, 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (ticks.length === 0) {
    return (
      <div className="border-b border-border bg-card/40 h-9 flex items-center overflow-hidden">
        <div className="container">
          <span className="text-[10px] font-mono text-muted-foreground tracking-widest animate-blink">
            CARREGANDO DADOS…
          </span>
        </div>
      </div>
    );
  }

  const tape = [...ticks, ...ticks];

  return (
    <div className="border-b border-border bg-card/40 h-9 flex items-center overflow-hidden relative">
      <div className="absolute left-0 top-0 bottom-0 z-10 w-16 bg-gradient-to-r from-background to-transparent pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 z-10 w-16 bg-gradient-to-l from-background to-transparent pointer-events-none" />
      <div className="flex items-center gap-8 animate-ticker whitespace-nowrap">
        {tape.map((t, i) => {
          const dir = flash[t.symbol];
          return (
            <div key={i} className="flex items-center gap-2 text-[11px] font-mono">
              <span className="font-bold text-foreground">{t.symbol}</span>
              <span className={`tabular transition-colors duration-300 ${
                dir === "up" ? "text-bull" : dir === "down" ? "text-bear" : "text-muted-foreground"
              }`}>
                {(() => { const digits = t.price < 10 ? 5 : t.price < 100 ? 4 : t.price < 1000 ? 3 : 2; return t.price.toFixed(digits); })()}
              </span>
              <span className={`tabular font-bold ${t.change >= 0 ? "text-bull" : "text-bear"}`}>
                {t.change >= 0 ? "▲" : "▼"} {Math.abs(t.change).toFixed(2)}%
              </span>
              <span className="text-border">·</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
