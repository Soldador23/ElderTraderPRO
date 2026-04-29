// Technical indicators — pure JS implementations, no external libs

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  values.forEach((v, i) => {
    if (i === 0) out.push(v);
    else {
      const e = v * k + prev * (1 - k);
      out.push(e);
      prev = e;
    }
  });
  return out;
}

export function sma(values: number[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : NaN);
  }
  return out;
}

export function rsi(closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return out;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = 100 - 100 / (1 + (avgLoss === 0 ? 100 : avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = 100 - 100 / (1 + (avgLoss === 0 ? 100 : avgGain / avgLoss));
  }
  return out;
}

export function macd(closes: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const signalLine = ema(macdLine, signal);
  const hist = macdLine.map((v, i) => v - signalLine[i]);
  return { macdLine, signalLine, hist };
}

export function bollingerBands(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { upper.push(NaN); lower.push(NaN); continue; }
    const slice = closes.slice(i - period + 1, i + 1);
    const m = mid[i];
    const variance = slice.reduce((a, c) => a + (c - m) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    upper.push(m + mult * std);
    lower.push(m - mult * std);
  }
  return { upper, mid, lower };
}

// Candle pattern detection — last candle vs previous
export type Pattern =
  | "bullish_engulfing" | "bearish_engulfing"
  | "hammer" | "shooting_star"
  | "doji" | "morning_star" | "evening_star" | "none";

export function detectPattern(candles: Candle[]): Pattern {
  if (candles.length < 3) return "none";
  const c1 = candles[candles.length - 3];
  const c2 = candles[candles.length - 2];
  const c3 = candles[candles.length - 1];
  const body = (c: Candle) => Math.abs(c.close - c.open);
  const range = (c: Candle) => c.high - c.low || 0.0001;
  const isBull = (c: Candle) => c.close > c.open;
  const isBear = (c: Candle) => c.close < c.open;

  // Doji
  if (body(c3) / range(c3) < 0.1) return "doji";

  // Engulfing
  if (isBear(c2) && isBull(c3) && c3.open <= c2.close && c3.close >= c2.open)
    return "bullish_engulfing";
  if (isBull(c2) && isBear(c3) && c3.open >= c2.close && c3.close <= c2.open)
    return "bearish_engulfing";

  // Hammer (long lower wick, small body, near top)
  const lowerWick3 = Math.min(c3.open, c3.close) - c3.low;
  const upperWick3 = c3.high - Math.max(c3.open, c3.close);
  if (lowerWick3 > body(c3) * 2 && upperWick3 < body(c3) * 0.5) return "hammer";
  if (upperWick3 > body(c3) * 2 && lowerWick3 < body(c3) * 0.5) return "shooting_star";

  // Morning / Evening star
  if (isBear(c1) && body(c2) / range(c2) < 0.3 && isBull(c3) && c3.close > (c1.open + c1.close) / 2)
    return "morning_star";
  if (isBull(c1) && body(c2) / range(c2) < 0.3 && isBear(c3) && c3.close < (c1.open + c1.close) / 2)
    return "evening_star";

  return "none";
}

export function supportResistance(candles: Candle[], lookback = 50) {
  const slice = candles.slice(-lookback);
  const lows = slice.map(c => c.low).sort((a, b) => a - b);
  const highs = slice.map(c => c.high).sort((a, b) => b - a);
  
  // Use average of lowest 3 and highest 3 for more stability
  const support = lows.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const resistance = highs.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  
  return { support, resistance };
}

export function detectTrendLine(candles: Candle[], lookback = 30) {
  const slice = candles.slice(-lookback);
  const xMean = (lookback - 1) / 2;
  const yMean = slice.reduce((sum, c) => sum + c.close, 0) / lookback;
  
  let num = 0, den = 0;
  slice.forEach((c, i) => {
    num += (i - xMean) * (c.close - yMean);
    den += (i - xMean) ** 2;
  });
  
  const slope = num / den;
  return slope; // positive = uptrend, negative = downtrend
}

export function hasLongWick(candle: Candle, type: "upper" | "lower"): boolean {
  const body = Math.abs(candle.close - candle.open);
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  
  if (type === "upper") return upperWick > body * 2 && upperWick > (candle.high - candle.low) * 0.4;
  return lowerWick > body * 2 && lowerWick > (candle.high - candle.low) * 0.4;
}
