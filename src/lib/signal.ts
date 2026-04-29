import { Candle, ema, rsi, macd, detectPattern, supportResistance, bollingerBands, detectTrendLine, hasLongWick } from "./indicators";

export type Direction = "BUY" | "SELL" | "WAIT";

export interface SignalResult {
  direction: Direction;
  confidence: number;
  reasons: string[];
  rsi: number;
  macdHist: number;
  trend: "UP" | "DOWN" | "FLAT";
  pattern: string;
  support: number;
  resistance: number;
  price: number;
  expiry: string;
}

const PATTERN_LABEL: Record<string, string> = {
  bullish_engulfing: "Engolfo de Alta",
  bearish_engulfing: "Engolfo de Baixa",
  hammer: "Martelo",
  shooting_star: "Estrela Cadente",
  doji: "Doji",
  morning_star: "Estrela da Manhã",
  evening_star: "Estrela da Tarde",
  none: "Sem padrão claro",
};

function trendOfWindow(candles: Candle[], window: number): "UP" | "DOWN" | "FLAT" {
  if (candles.length < window) return "FLAT";
  const slice = candles.slice(-window);
  const closes = slice.map(c => c.close);
  const e21 = ema(closes, Math.min(21, Math.floor(window / 3)));
  const e50 = ema(closes, Math.min(50, Math.floor(window / 2)));
  const last21 = e21[e21.length - 1];
  const last50 = e50[e50.length - 1];
  const slope = detectTrendLine(slice, Math.min(20, window));
  if (last21 > last50 && slope > 0) return "UP";
  if (last21 < last50 && slope < 0) return "DOWN";
  return "FLAT";
}

function hasStructuralChange(candles: Candle[], lastDir: Direction, lastPrice: number): boolean {
  if (lastDir === "WAIT") return true;
  const currentPrice = candles[candles.length - 1].close;
  const closes = candles.map(c => c.close);
  const rsiArr = rsi(closes, 14);
  const currentRsi = rsiArr[rsiArr.length - 1];
  const priceMove = Math.abs(currentPrice - lastPrice) / lastPrice;
  if (priceMove < 0.001) return false;
  if (lastDir === "BUY"  && currentRsi > 68) return false;
  if (lastDir === "SELL" && currentRsi < 32) return false;
  return true;
}

export function generateSignal(
  candles: Candle[],
  timeframeMin: number,
  lastSignalDirection: Direction = "WAIT",
  lastSignalPrice: number = 0,
  lastSignalCandleTime: number = 0
): SignalResult | null {
  if (candles.length < 60) return null;

  const closes = candles.map(c => c.close);
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const price = last.close;

  const barSec = timeframeMin * 60;
  const currentBarTime = Math.floor(Date.now() / 1000 / barSec) * barSec;
  const barsSinceLastSignal = lastSignalCandleTime > 0
    ? Math.floor((currentBarTime - lastSignalCandleTime) / barSec)
    : 999;

  const rsiArr = rsi(closes, 14);
  const lastRsi  = rsiArr[rsiArr.length - 1];
  const prevRsi  = rsiArr[rsiArr.length - 2];

  const { hist } = macd(closes);
  const lastHist = hist[hist.length - 1];
  const prevHist = hist[hist.length - 2];

  const ema9   = ema(closes, 9);
  const ema21  = ema(closes, 21);
  const ema50  = ema(closes, 50);
  const ema100 = ema(closes, Math.min(100, closes.length - 1));
  const lastEma9   = ema9[ema9.length - 1];
  const lastEma21  = ema21[ema21.length - 1];
  const lastEma50  = ema50[ema50.length - 1];
  const lastEma100 = ema100[ema100.length - 1];
  const prevEma9   = ema9[ema9.length - 2];
  const prevEma21  = ema21[ema21.length - 2];

  const trend: SignalResult["trend"] =
    lastEma21 > lastEma50 && lastEma50 > lastEma100 ? "UP" :
    lastEma21 < lastEma50 && lastEma50 < lastEma100 ? "DOWN" : "FLAT";

  const microTrend  = trendOfWindow(candles, 20);
  const mediumTrend = trendOfWindow(candles, 60);
  const macroTrend  = trendOfWindow(candles, Math.min(150, candles.length));

  const pattern = detectPattern(candles);
  const { support, resistance } = supportResistance(candles);
  const trendLineSlope = detectTrendLine(candles);
  const priceVsEma21 = (price - lastEma21) / price;
  const priceVsEma50 = (price - lastEma50) / price;
  const emaSpread    = Math.abs(lastEma21 - lastEma50) / price;

  const high  = Math.max(...candles.slice(-50).map(c => c.high));
  const low   = Math.min(...candles.slice(-50).map(c => c.low));
  const range = high - low || 0.0001;
  const fib618 = high - range * 0.618;
  const fib382 = high - range * 0.382;
  const fib500 = high - range * 0.500;
  const fib682 = high - range * 0.682;
  const fib328 = high - range * 0.328;

  const { upper, lower, mid } = bollingerBands(closes);
  const lastUpper = upper[upper.length - 1];
  const lastLower = lower[lower.length - 1];
  const lastMid   = mid[mid.length - 1];

  let bullScore = 0, bearScore = 0;
  const reasons: string[] = [];

  if (lastRsi < 30) { bullScore += 25; reasons.push(`RSI Sobrevenda (${lastRsi.toFixed(1)})`); }
  else if (lastRsi > 70) { bearScore += 25; reasons.push(`RSI Sobrecompra (${lastRsi.toFixed(1)})`); }
  if (prevRsi < 50 && lastRsi >= 50) { bullScore += 10; reasons.push("RSI cruzou 50 ↑"); }
  if (prevRsi > 50 && lastRsi <= 50) { bearScore += 10; reasons.push("RSI cruzou 50 ↓"); }

  if (prevHist < 0 && lastHist > 0) { bullScore += 18; reasons.push("MACD virou positivo"); }
  if (prevHist > 0 && lastHist < 0) { bearScore += 18; reasons.push("MACD virou negativo"); }
  if (lastHist > prevHist && lastHist > 0) bullScore += 8;
  if (lastHist < prevHist && lastHist < 0) bearScore += 8;

  if (prevEma9 <= prevEma21 && lastEma9 > lastEma21) { bullScore += 15; reasons.push("EMA 9 cruzou 21 ↑"); }
  if (prevEma9 >= prevEma21 && lastEma9 < lastEma21) { bearScore += 15; reasons.push("EMA 9 cruzou 21 ↓"); }

  const trendsUp   = [microTrend, mediumTrend, macroTrend].filter(t => t === "UP").length;
  const trendsDown = [microTrend, mediumTrend, macroTrend].filter(t => t === "DOWN").length;
  if (trendsUp   >= 2) { bullScore += 20; reasons.push(`Multi-TF Alinhado ↑ (${trendsUp}/3)`); }
  if (trendsDown >= 2) { bearScore += 20; reasons.push(`Multi-TF Alinhado ↓ (${trendsDown}/3)`); }
  if (trendsUp   === 3) { bullScore += 10; reasons.push("Convergência Total Alta"); }
  if (trendsDown === 3) { bearScore += 10; reasons.push("Convergência Total Baixa"); }
  if (trend === "UP"   && priceVsEma21 > 0 && priceVsEma50 > 0 && emaSpread > 0.0008) { bullScore += 12; reasons.push("Preço acima das médias-chave"); }
  if (trend === "DOWN" && priceVsEma21 < 0 && priceVsEma50 < 0 && emaSpread > 0.0008) { bearScore += 12; reasons.push("Preço abaixo das médias-chave"); }

  if (trendLineSlope > 0) bullScore += 8;
  if (trendLineSlope < 0) bearScore += 8;

  const fibTol = 0.003;
  const proximitySupport    = Math.abs(price - support)    / price < fibTol;
  const proximityResistance = Math.abs(price - resistance) / price < fibTol;

  if (proximitySupport) {
    bullScore += 18; reasons.push("Preço em Zona de Suporte");
    if (hasLongWick(last, "lower")) { bullScore += 28; reasons.push("✓ PAVIO em Suporte (Rejeição Forte)"); }
    if (hasLongWick(prev, "lower")) { bullScore += 12; reasons.push("Pavio anterior confirmou suporte"); }
  }
  if (proximityResistance) {
    bearScore += 18; reasons.push("Preço em Zona de Resistência");
    if (hasLongWick(last, "upper")) { bearScore += 28; reasons.push("✓ PAVIO em Resistência (Rejeição Forte)"); }
    if (hasLongWick(prev, "upper")) { bearScore += 12; reasons.push("Pavio anterior confirmou resistência"); }
  }

  const proximityTrendline = Math.abs(price - lastEma50) / price < fibTol;
  if (proximityTrendline) {
    if (trend === "UP"   && hasLongWick(last, "lower")) { bullScore += 20; reasons.push("Pavio na Linha de Tendência (Alta)"); }
    if (trend === "DOWN" && hasLongWick(last, "upper")) { bearScore += 20; reasons.push("Pavio na Linha de Tendência (Baixa)"); }
  }

  if (Math.abs(price - fib618) / price < fibTol) {
    if (trend === "UP" || microTrend === "UP") { bullScore += 22; reasons.push("Fib 61.8% — Retração de Alta"); }
    else { bearScore += 12; reasons.push("Fib 61.8% testado"); }
  }
  if (Math.abs(price - fib382) / price < fibTol) {
    if (trend === "DOWN" || microTrend === "DOWN") { bearScore += 22; reasons.push("Fib 38.2% — Retração de Baixa"); }
    else { bullScore += 12; reasons.push("Fib 38.2% testado"); }
  }
  if (Math.abs(price - fib500) / price < fibTol) {
    if (trend === "UP")   { bullScore += 10; reasons.push("Fib 50% — zona de equilíbrio"); }
    if (trend === "DOWN") { bearScore += 10; reasons.push("Fib 50% — zona de equilíbrio"); }
  }
  if (Math.abs(price - fib682) / price < fibTol) {
    if (trend === "UP" || trendsUp >= 2) { bullScore += 24; reasons.push("Fib 68.2% com defesa compradora"); }
    if (hasLongWick(last, "lower"))      { bullScore += 12; reasons.push("Pavio comprador na Fib 68.2%"); }
  }
  if (Math.abs(price - fib328) / price < fibTol) {
    if (trend === "DOWN" || trendsDown >= 2) { bearScore += 24; reasons.push("Fib 32.8% com defesa vendedora"); }
    if (hasLongWick(last, "upper"))          { bearScore += 12; reasons.push("Pavio vendedor na Fib 32.8%"); }
  }

  if (pattern !== "none") {
    const bullPatterns = ["bullish_engulfing", "hammer", "morning_star"];
    const bearPatterns = ["bearish_engulfing", "shooting_star", "evening_star"];
    if (bullPatterns.includes(pattern)) {
      const boost = (trend === "UP" || microTrend === "UP") ? 28 : 14;
      bullScore += boost; reasons.push(`Padrão: ${PATTERN_LABEL[pattern]}`);
    } else if (bearPatterns.includes(pattern)) {
      const boost = (trend === "DOWN" || microTrend === "DOWN") ? 28 : 14;
      bearScore += boost; reasons.push(`Padrão: ${PATTERN_LABEL[pattern]}`);
    } else if (pattern === "doji") {
      if (proximitySupport)    { bullScore += 10; reasons.push("Doji em Suporte"); }
      if (proximityResistance) { bearScore += 10; reasons.push("Doji em Resistência"); }
    }
  }

  if (price <= lastLower) { bullScore += 14; reasons.push("Bollinger Inferior (sobrevenda)"); }
  else if (price >= lastUpper) { bearScore += 14; reasons.push("Bollinger Superior (sobrecompra)"); }
  if (prev.close < lastMid && price > lastMid) bullScore += 6;
  if (prev.close > lastMid && price < lastMid) bearScore += 6;

  // ── DECISÃO — score 65 / gap 16 ──
  let direction: Direction = "WAIT";
  let confidence = 0;

  const MIN_SCORE = 65;
  const MIN_GAP   = 16;

  const hasBullContext = trendsUp >= 2 ||
    (trend === "UP" && (proximitySupport || proximityTrendline ||
      Math.abs(price - fib682) / price < fibTol ||
      Math.abs(price - fib618) / price < fibTol));

  const hasBearContext = trendsDown >= 2 ||
    (trend === "DOWN" && (proximityResistance || proximityTrendline ||
      Math.abs(price - fib328) / price < fibTol ||
      Math.abs(price - fib382) / price < fibTol));

  const rsiAllowsBuy  = lastRsi < 72;
  const rsiAllowsSell = lastRsi > 28;
  const macdAllowsBuy  = lastHist > prevHist || lastHist > 0;
  const macdAllowsSell = lastHist < prevHist || lastHist < 0;

  if (bullScore >= MIN_SCORE && bullScore > bearScore + MIN_GAP && hasBullContext && rsiAllowsBuy && macdAllowsBuy) {
    const cooldownOk = lastSignalDirection !== "BUY" ||
      (barsSinceLastSignal >= 2 && hasStructuralChange(candles, lastSignalDirection, lastSignalPrice));
    if (cooldownOk) {
      direction  = "BUY";
      confidence = Math.min(98, 62 + (bullScore - MIN_SCORE) * 0.55);
    } else {
      reasons.push("Aguardando cooldown após sinal anterior");
    }
  } else if (bearScore >= MIN_SCORE && bearScore > bullScore + MIN_GAP && hasBearContext && rsiAllowsSell && macdAllowsSell) {
    const cooldownOk = lastSignalDirection !== "SELL" ||
      (barsSinceLastSignal >= 2 && hasStructuralChange(candles, lastSignalDirection, lastSignalPrice));
    if (cooldownOk) {
      direction  = "SELL";
      confidence = Math.min(98, 62 + (bearScore - MIN_SCORE) * 0.55);
    } else {
      reasons.push("Aguardando cooldown após sinal anterior");
    }
  } else {
    reasons.push("Aguardando convergência institucional");
    confidence = 0;
  }

  return {
    direction,
    confidence,
    reasons,
    rsi: lastRsi,
    macdHist: lastHist,
    trend,
    pattern: PATTERN_LABEL[pattern],
    support,
    resistance,
    price,
    expiry: nextCandleTime(timeframeMin),
  };
}

function nextCandleTime(timeframeMin: number): string {
  const BRT_OFFSET_MS = -3 * 60 * 60_000;
  const ms   = Date.now();
  const tfMs = timeframeMin * 60_000;
  let nextStart: number;
  if (timeframeMin >= 60) {
    const localMs = ms + BRT_OFFSET_MS;
    const aligned = Math.floor(localMs / tfMs) * tfMs;
    nextStart = (aligned - BRT_OFFSET_MS) + tfMs;
  } else {
    nextStart = (Math.floor(ms / tfMs) * tfMs) + tfMs;
  }
  return new Date(nextStart).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}
