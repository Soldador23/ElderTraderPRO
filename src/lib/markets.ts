// =============================================================================
// FONTE DE PREÇOS - ARQUITETURA DUPLA
//
//  CRIPTO  → Binance WebSocket (gratuito, sem API key, tempo real)
//  FOREX   → Supabase (servidor Python envia dados do MT4)
//  METAIS  → Supabase (mesma bridge)
//
// Visual do app não muda. Só a origem dos dados muda.
// =============================================================================
import { Candle } from "./indicators";

export interface Pair {
  symbol: string;
  td: string;
  category: "crypto" | "forex" | "commodity";
  binance?: string;
  mt4?: string;
}

export const PAIRS: Pair[] = [
  // Forex Majors
  { symbol: "EUR/USD", td: "EUR/USD", category: "forex",     mt4: "EURUSD"  },
  { symbol: "GBP/USD", td: "GBP/USD", category: "forex",     mt4: "GBPUSD"  },
  { symbol: "USD/JPY", td: "USD/JPY", category: "forex",     mt4: "USDJPY"  },
  { symbol: "USD/CHF", td: "USD/CHF", category: "forex",     mt4: "USDCHF"  },
  { symbol: "USD/CAD", td: "USD/CAD", category: "forex",     mt4: "USDCAD"  },
  { symbol: "AUD/JPY", td: "AUD/JPY", category: "forex",     mt4: "AUDJPY"  },
  { symbol: "AUD/CAD", td: "AUD/CAD", category: "forex",     mt4: "AUDCAD"  },
  { symbol: "CAD/CHF", td: "CAD/CHF", category: "forex",     mt4: "CADCHF"  },
  { symbol: "EUR/CHF", td: "EUR/CHF", category: "forex",     mt4: "EURCHF"  },
  { symbol: "EUR/GBP", td: "EUR/GBP", category: "forex",     mt4: "EURGBP"  },
  { symbol: "EUR/JPY", td: "EUR/JPY", category: "forex",     mt4: "EURJPY"  },
  { symbol: "GBP/JPY", td: "GBP/JPY", category: "forex",     mt4: "GBPJPY"  },
  { symbol: "NZD/JPY", td: "NZD/JPY", category: "forex",     mt4: "NZDJPY"  },
  { symbol: "NZD/USD", td: "NZD/USD", category: "forex",     mt4: "NZDUSD"  },
  // Cripto
  { symbol: "BTC/USD", td: "BTC/USD", category: "crypto", binance: "BTCUSDT" },
  { symbol: "ETH/USD", td: "ETH/USD", category: "crypto", binance: "ETHUSDT" },
  { symbol: "SOL/USD", td: "SOL/USD", category: "crypto", binance: "SOLUSDT" },
  { symbol: "XRP/USD", td: "XRP/USD", category: "crypto", binance: "XRPUSDT" },
  { symbol: "BNB/USD", td: "BNB/USD", category: "crypto", binance: "BNBUSDT" },
  { symbol: "ADA/USD", td: "ADA/USD", category: "crypto", binance: "ADAUSDT" },
  { symbol: "DOGE/USD",td: "DOGE/USD",category: "crypto", binance: "DOGEUSDT"},
  { symbol: "LTC/USD", td: "LTC/USD", category: "crypto", binance: "LTCUSDT" },
];

// =============================================================================
// TIMEFRAMES
// =============================================================================
export type TimeframeValue = "1m" | "5m" | "15m" | "1h" | "4h";

export const TIMEFRAMES: { label: string; value: TimeframeValue; td: string; minutes: number }[] = [
  { label: "1M",  value: "1m",  td: "1m",  minutes: 1   },
  { label: "5M",  value: "5m",  td: "5m",  minutes: 5   },
  { label: "15M", value: "15m", td: "15m", minutes: 15  },
  { label: "1H",  value: "1h",  td: "1h",  minutes: 60  },
  { label: "4H",  value: "4h",  td: "4h",  minutes: 240 },
];

// =============================================================================
// SUPABASE - lê preços do MT4 enviados pelo servidor Python
// =============================================================================
const SUPABASE_URL = "https://quepacntuujfycvrkftq.supabase.co";
const SUPABASE_KEY = "sb_publishable_ECo0I3aO8uHepfPKWLSlkg_wyM2m5X2";

interface MT4Tick {
  symbol: string;
  bid: number;
  ask: number;
  time: number;
}

const lastTickTime: Record<string, number> = {};

async function fetchSupabaseTick(mt4Symbol: string): Promise<MT4Tick | null> {
  try {
    const url = `${SUPABASE_URL}/rest/v1/precos?symbol=eq.${mt4Symbol}&select=symbol,bid,ask,time&limit=1`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (!res.ok) return null;
    const data: MT4Tick[] = await res.json();
    if (!data || data.length === 0) return null;
    const tick = data[0];
    if (tick?.symbol && typeof tick.bid === "number" && typeof tick.ask === "number") {
      // descarta ticks fora de ordem
      const last = lastTickTime[mt4Symbol] ?? 0;
      if (tick.time < last) return null;
      lastTickTime[mt4Symbol] = tick.time;
      return tick;
    }
    return null;
  } catch {
    return null;
  }
}

// =============================================================================
// BINANCE WEBSOCKET - cripto em tempo real
// =============================================================================
export function subscribeBinanceCandles(
  binanceSymbol: string,
  interval: string,
  onCandle: (c: Candle) => void
): () => void {
  const sym = binanceSymbol.toLowerCase();
  const url = `wss://stream.binance.com:9443/ws/${sym}@kline_${interval}`;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function connect() {
    if (stopped) return;
    ws = new WebSocket(url);
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string);
        const k = msg?.k;
        if (!k) return;
        const candle: Candle = {
          open:   parseFloat(k.o),
          high:   parseFloat(k.h),
          low:    parseFloat(k.l),
          close:  parseFloat(k.c),
          volume: parseFloat(k.v),
          time:   k.t,
        };
        onCandle(candle);
      } catch { /* ignore */ }
    };
    ws.onerror = () => {
      ws?.close();
    };
    ws.onclose = () => {
      if (!stopped) {
        reconnectTimer = setTimeout(connect, 3000);
      }
    };
  }

  connect();
  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
  };
}

// =============================================================================
// MT4 via Supabase - candles para forex/commodity
// =============================================================================
export function subscribeMT4Candles(
  pair: Pair,
  interval: string,
  onCandle: (c: Candle) => void
): () => void {
  if (!pair.mt4) return () => {};
  const mt4Symbol = pair.mt4.toLowerCase();
  let stopped = false;
  let lastOhlcClose = 0;

  // Converte intervalo Binance para MT4
  const tfMap: Record<string, string> = {
    "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h",
  };
  const tf = tfMap[interval] ?? "5m";

  // Polling OHLC a cada 4s
  async function fetchOhlc() {
    if (stopped) return;
    try {
      const url = `${SUPABASE_URL}/rest/v1/ohlc?symbol=eq.${pair.mt4}&timeframe=eq.${tf}&select=open,high,low,close,volume,time&order=time.desc&limit=1`;
      const res = await fetch(url, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          const d = data[0];
          lastOhlcClose = d.close;
        }
      }
    } catch { /* ignore */ }
    if (!stopped) setTimeout(fetchOhlc, 4000);
  }

  // Polling tick a cada 150ms para preço atual
  async function fetchTick() {
    if (stopped) return;
    const tick = await fetchSupabaseTick(pair.mt4!);
    if (tick) {
      const candle: Candle = {
        open:   lastOhlcClose || tick.bid,
        high:   tick.ask,
        low:    tick.bid,
        close:  tick.bid,
        volume: 0,
        time:   tick.time * 1000,
      };
      onCandle(candle);
    }
    if (!stopped) setTimeout(fetchTick, 150);
  }

  fetchOhlc();
  fetchTick();

  return () => { stopped = true; };
}

// =============================================================================
// Preço spot atual (para MarketTicker)
// =============================================================================
export async function fetchBinanceTicker(pairs: Pair[]): Promise<Record<string, { price: number; change: number }>> {
  const symbols = pairs
    .filter(p => p.category === "crypto" && p.binance)
    .map(p => p.binance!);
  if (!symbols.length) return {};
  const symbolsJson = JSON.stringify(symbols);
  try {
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbolsJson)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return {};
    const data = await res.json();
    const result: Record<string, { price: number; change: number }> = {};
    for (const pair of pairs.filter(p => p.category === "crypto" && p.binance)) {
      const item = (data as Array<{ symbol: string; lastPrice: string; priceChangePercent: string }>)
        .find(d => d.symbol === pair.binance);
      if (item) {
        result[pair.symbol] = {
          price: parseFloat(item.lastPrice),
          change: parseFloat(item.priceChangePercent),
        };
      }
    }
    return result;
  } catch {
    return {};
  }
}

export async function fetchMT4Tickers(pairs: Pair[]): Promise<Record<string, { price: number; change: number }>> {
  const forexPairs = pairs.filter(p => (p.category === "forex" || p.category === "commodity") && p.mt4);
  const result: Record<string, { price: number; change: number }> = {};
  await Promise.all(
    forexPairs.map(async (pair) => {
      const tick = await fetchSupabaseTick(pair.mt4!);
      if (tick) {
        result[pair.symbol] = {
          price: tick.bid,
          change: 0,
        };
      }
    })
  );
  return result;
}

export async function fetchCandles(pair: Pair, interval: string): Promise<import("./indicators").Candle[]> {
  if (pair.category === "crypto" && pair.binance) {
    try {
      const tfMap: Record<string, string> = {
        "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h",
      };
      const tf = tfMap[interval] ?? "5m";
      const url = `https://api.binance.com/api/v3/klines?symbol=${pair.binance}&interval=${tf}&limit=200`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return [];
      const data = await res.json();
      return (data as Array<Array<string | number>>).map((k) => ({
        open:   parseFloat(k[1] as string),
        high:   parseFloat(k[2] as string),
        low:    parseFloat(k[3] as string),
        close:  parseFloat(k[4] as string),
        volume: parseFloat(k[5] as string),
        time:   k[0] as number,
      }));
    } catch {
      return [];
    }
  }
  if (pair.mt4) {
    try {
      const SUPABASE_URL = "https://quepacntuujfycvrkftq.supabase.co";
      const SUPABASE_KEY = "sb_publishable_ECo0I3aO8uHepfPKWLSlkg_wyM2m5X2";
      const tfMap: Record<string, string> = {
        "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h",
      };
      const tf = tfMap[interval] ?? "5m";
      const url = `${SUPABASE_URL}/rest/v1/ohlc?symbol=eq.${pair.mt4}&timeframe=eq.${tf}&select=open,high,low,close,volume,time&order=time.asc&limit=200`;
      const res = await fetch(url, {
        cache: "no-store",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
        },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data as Array<{open:number;high:number;low:number;close:number;volume:number;time:number}>).map((k) => ({
        open: k.open, high: k.high, low: k.low, close: k.close,
        volume: k.volume ?? 0, time: k.time * 1000,
      }));
    } catch {
      return [];
    }
  }
  return [];
}

export function subscribeCandles(
  pair: Pair,
  interval: string,
  onCandle: (c: import("./indicators").Candle) => void
): () => void {
  if (pair.category === "crypto" && pair.binance) {
    return subscribeBinanceCandles(pair.binance, interval, onCandle);
  }
  if (pair.mt4) {
    return subscribeMT4Candles(pair, interval, onCandle);
  }
  return () => {};
}
