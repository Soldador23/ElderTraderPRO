import { useEffect, useRef, useState } from "react";
import { SignalResult, Direction } from "@/lib/signal";
import { ArrowUp, ArrowDown, Minus, Clock, Sparkles, BellRing } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  signal: SignalResult | null;
  pair: string;
  timeframeLabel: string;
  timeframeMinutes: number;
  livePrice?: number;
}

// Web Audio beep for entry alerts
const playAlert = (type: "SIGNAL" | "ENTRY" | "PRE") => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type === "ENTRY" ? "square" : "sine";
    const startFreq = type === "ENTRY" ? 1200 : type === "PRE" ? 1000 : 880;
    const endFreq = type === "ENTRY" ? 400 : type === "PRE" ? 600 : 440;
    osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);

    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {}
};

const BRT_OFFSET_MS = -3 * 60 * 60_000;
const currentCandleStart = (tfMin: number, timestampMs = Date.now()) => {
  const tfMs = tfMin * 60_000;
  const brasiliaMs = timestampMs + BRT_OFFSET_MS;
  return Math.floor(brasiliaMs / tfMs) * tfMs - BRT_OFFSET_MS;
};

// HH:MM:SS no fuso de Brasília
const formatTime = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
};

interface LockedSignal {
  direction: Direction;
  confidence: number;
  reasons: string[];
  pattern: string;
  trend: SignalResult["trend"];
  rsi: number;
  price: number;
  candleStart: number; // ms
  candleEnd: number;   // ms
  entryTime: string;   // HH:MM:SS — início da próxima vela (momento da entrada)
}

export const SignalPanel = ({ signal: rawSignal, pair, timeframeLabel, timeframeMinutes, livePrice }: Props) => {
  const [showPopup, setShowPopup] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [locked, setLocked] = useState<LockedSignal | null>(null);
  const lastEntryFiredFor = useRef<number>(0);
  const pre60FiredFor = useRef<number>(0);
  const pre30FiredFor = useRef<number>(0);
  const pre10FiredFor = useRef<number>(0);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!rawSignal) return;

    const tfMs = timeframeMinutes * 60_000;
    const candleStart = currentCandleStart(timeframeMinutes);
    const candleEnd = candleStart + tfMs;

    if (!locked || locked.candleStart !== candleStart) {
      const isStrong = rawSignal.direction !== "WAIT" && rawSignal.confidence >= 60;
      setLocked({
        direction: isStrong ? rawSignal.direction : "WAIT",
        confidence: isStrong ? rawSignal.confidence : 0,
        reasons: rawSignal.reasons,
        pattern: rawSignal.pattern,
        trend: rawSignal.trend,
        rsi: rawSignal.rsi,
        price: rawSignal.price,
        candleStart,
        candleEnd,
        entryTime: formatTime(candleEnd),
      });
    }
  }, [rawSignal, timeframeMinutes, locked]);

  useEffect(() => {
    if (!locked || locked.direction === "WAIT") {
      setShowPopup(false);
      return;
    }

    const msUntilEntry = locked.candleEnd - now;

    const sendBackgroundNotif = (title: string, body: string, tag: string) => {
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "SHOW_NOTIFICATION",
          payload: { title, body, tag },
        });
      } else if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body, icon: "/favicon.ico" });
      }
    };

    // Aviso 60s antes
    if (msUntilEntry <= 60_000 && msUntilEntry > 30_000) {
      if (pre60FiredFor.current !== locked.candleEnd) {
        pre60FiredFor.current = locked.candleEnd;
        playAlert("PRE");
        setShowPopup(true);
        const title = locked.direction === "BUY" ? "PREPARE COMPRA · 1min" : "PREPARE VENDA · 1min";
        toast(title, { description: `${pair} · entrada às ${locked.entryTime}`, duration: 5000 });
        sendBackgroundNotif(title, `${pair} · ${timeframeLabel} · entrada às ${locked.entryTime}`, `pre60-${pair}-${locked.candleEnd}`);
      }
    }

    // Aviso 30s antes
    if (msUntilEntry <= 30_000 && msUntilEntry > 10_000) {
      if (pre30FiredFor.current !== locked.candleEnd) {
        pre30FiredFor.current = locked.candleEnd;
        playAlert("PRE");
        setShowPopup(true);
        const title = locked.direction === "BUY" ? "PREPARE COMPRA · 30s" : "PREPARE VENDA · 30s";
        toast(title, { description: `${pair} · entrada às ${locked.entryTime}`, duration: 5000 });
        sendBackgroundNotif(title, `${pair} · ${timeframeLabel} · entrada às ${locked.entryTime}`, `pre30-${pair}-${locked.candleEnd}`);
      }
    }

    // Aviso 10s antes (intensificação visual)
    if (msUntilEntry <= 10_000 && msUntilEntry > 0) {
      if (pre10FiredFor.current !== locked.candleEnd) {
        pre10FiredFor.current = locked.candleEnd;
        playAlert("PRE");
        setShowPopup(true);
      }
    }

    // Momento da entrada
    if (msUntilEntry <= 0 && msUntilEntry > -3_000) {
      if (lastEntryFiredFor.current !== locked.candleEnd) {
        lastEntryFiredFor.current = locked.candleEnd;
        playAlert("ENTRY");
        setShowPopup(true);
        const title = locked.direction === "BUY" ? "COMPRE AGORA!" : "VENDA AGORA!";
        const body = `Entrada confirmada · ${pair} · ${timeframeLabel}`;
        toast(title, { description: body, duration: 8000 });
        sendBackgroundNotif(title, body, `signal-${pair}-${locked.candleEnd}`);
      }
    }

    if (msUntilEntry < -4_000) {
      setShowPopup(false);
    }
  }, [now, locked, pair, timeframeLabel]);

  const signal = locked;

  if (!signal) {
    return (
      <div className="premium-card rounded-lg p-10 text-center min-h-[420px] flex flex-col items-center justify-center gap-4 border border-border/40 shadow-xl bg-secondary/5">
        <div className="relative">
          <Sparkles className="w-10 h-10 text-primary animate-pulse" />
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" />
        </div>
        <div className="label-mono text-primary font-black uppercase tracking-[0.3em]">Scanner Ativo</div>
        <div className="text-[11px] font-mono text-muted-foreground/60 max-w-[240px] font-bold uppercase tracking-wider">
          Processando volumes institucionais em {pair}...
        </div>
      </div>
    );
  }

  const isBuy = signal.direction === "BUY";
  const isSell = signal.direction === "SELL";
  const isWait = signal.direction === "WAIT";

  const Icon = isBuy ? ArrowUp : isSell ? ArrowDown : Minus;
  const dirLabel = isBuy ? "COMPRA" : isSell ? "VENDA" : "AGUARDE";
  const dirSubLabel = isBuy ? "CALL · ALTA" : isSell ? "PUT · BAIXA" : "NEUTRO";
  const glow = isBuy ? "signal-glow-bull" : isSell ? "signal-glow-bear" : "";

  const msLeft = Math.max(0, signal.candleEnd - now);
  const secLeft = Math.max(0, Math.ceil(msLeft / 1000));
  const mm = Math.floor(secLeft / 60).toString().padStart(2, "0");
  const ss = (secLeft % 60).toString().padStart(2, "0");
  const brasiliaNow = formatTime(now);
  const entryClock = formatTime(signal.candleEnd);
  const isPreAlert = msLeft <= 60_000 && msLeft > 10_000 && !isWait; // 60s..10s aviso suave
  const isPreEntry = msLeft <= 10_000 && msLeft > 0 && !isWait;       // últimos 10s — piscar forte
  const isEntryMoment = msLeft <= 0 && msLeft > -3_000 && !isWait;

  return (
    <div className={cn(
      "premium-card rounded-lg overflow-hidden transition-all duration-700 relative border border-border/40 shadow-2xl",
      glow,
      isPreEntry && isBuy && "ring-2 ring-bull/50",
      isPreEntry && isSell && "ring-2 ring-bear/50",
      isEntryMoment && isBuy && "entry-flash-bull ring-4 ring-bull ring-inset shadow-[0_0_40px_hsl(var(--bull)/0.4)]",
      isEntryMoment && isSell && "entry-flash-bear ring-4 ring-bear ring-inset shadow-[0_0_40px_hsl(var(--bear)/0.4)]",
    )}>
      {isEntryMoment && (
        <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center bg-black/5">
          <div className="text-5xl font-black tracking-tighter uppercase opacity-10 animate-pulse rotate-12 scale-150">
            {isBuy ? "EXECUTE CALL" : "EXECUTE PUT"}
          </div>
        </div>
      )}

      <div className="relative px-6 pt-6 pb-7 border-b border-border/40 bg-secondary/10">
        {/* Nome do ativo em destaque no topo do card */}
        <div className={cn(
          "absolute -top-3 left-4 px-3 py-1 rounded-md font-display font-black text-sm tracking-widest shadow-lg border-2",
          isBuy ? "bg-bull text-white border-bull" :
          isSell ? "bg-bear text-white border-bear" :
          "bg-primary text-primary-foreground border-primary"
        )}>
          {pair}
        </div>
        <div className="flex items-center justify-between mb-5 mt-2">
          <div className="flex flex-col">
            <div className="label-mono font-black text-primary tracking-widest uppercase">Gatilho de Alta Precisão</div>
            <div className="text-[10px] font-mono text-muted-foreground/60 tracking-wider uppercase mt-1 font-bold">
              Monitoramento em Tempo Real
            </div>
          </div>
          <div className="text-[11px] font-mono font-black text-foreground bg-foreground/5 px-2 py-0.5 rounded tracking-widest">
            {timeframeLabel}
          </div>
        </div>

        <div className="flex items-end justify-between gap-4">
          <div className="flex-1">
            <div className={cn(
              "inline-flex items-center gap-2 px-3 py-1 rounded-sm border mb-4 shadow-sm",
              isBuy && "bg-bull/10 border-bull/30 text-bull",
              isSell && "bg-bear/10 border-bear/30 text-bear",
              isWait && "bg-neutral/10 border-neutral/30 text-neutral",
            )}>
              <Icon className="w-3.5 h-3.5" strokeWidth={3} />
              <span className="text-[11px] font-mono font-black tracking-widest">{dirSubLabel}</span>
            </div>
            <div className={cn(
              "font-display text-6xl font-black tracking-tighter leading-none italic",
              isBuy && "text-bull drop-shadow-[0_2px_12px_hsl(var(--bull)/0.3)]",
              isSell && "text-bear drop-shadow-[0_2px_12px_hsl(var(--bear)/0.3)]",
              isWait && "text-neutral",
            )}>
              {dirLabel}
            </div>
          </div>

          <div className="text-right">
            <div className="label-mono opacity-50 font-bold uppercase tracking-widest">Assertividade</div>
            <div className={cn(
              "font-display text-5xl font-black tabular tracking-tighter mt-1 leading-none",
              signal.confidence >= 70 ? (isBuy ? "text-bull" : isSell ? "text-bear" : "text-foreground") : "text-foreground"
            )}>
              {signal.confidence.toFixed(0)}
              <span className="text-2xl font-light text-muted-foreground opacity-40">%</span>
            </div>
            <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest mt-1 opacity-50">Score Institucional</div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className={cn(
          "flex flex-col gap-3 p-5 rounded-xl border transition-all duration-500 shadow-inner bg-gradient-to-br from-secondary/10 to-background/70",
          isEntryMoment ? (isBuy ? "bg-bull border-bull" : "bg-bear border-bear") :
          isPreEntry ? (isBuy ? "bg-bull/15 border-bull animate-blink-fast" : "bg-bear/15 border-bear animate-blink-fast") :
          (isBuy ? "bg-bull/[0.03] border-bull/20" : isSell ? "bg-bear/[0.03] border-bear/20" : "bg-primary/[0.03] border-primary/20")
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Clock className={cn("w-4 h-4", isEntryMoment ? "text-white" : "text-primary")} />
              <span className={cn("label-mono font-black uppercase tracking-widest", isEntryMoment ? "text-white" : "text-foreground")}>Entrada em</span>
            </div>
            <span className={cn(
              "font-mono font-black text-3xl tabular tracking-tighter",
              isEntryMoment ? "text-white animate-blink-fast" :
              isPreEntry ? (isBuy ? "text-bull" : "text-bear") :
              (isBuy ? "text-bull" : isSell ? "text-bear" : "text-primary")
            )}>
              {mm}:{ss}
            </span>
          </div>
          <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3 border-t pt-3 mt-1", isEntryMoment ? "border-white/20" : "border-border/40")}>
            <div className="space-y-1">
              <span className={cn("text-[11px] font-mono uppercase font-black tracking-widest", isEntryMoment ? "text-white/80" : "text-muted-foreground")}>Brasília Agora</span>
              <span className={cn("font-mono font-black text-base tabular tracking-tight", isEntryMoment ? "text-white" : "text-foreground")}>
                {brasiliaNow}
              </span>
            </div>
            <div className="space-y-1 sm:text-right">
              <span className={cn("text-[11px] font-mono uppercase font-black tracking-widest", isEntryMoment ? "text-white/80" : "text-muted-foreground")}>Entrada Brasília</span>
              <span className={cn("font-mono font-black text-base tabular tracking-tight", isEntryMoment ? "text-white" : "text-foreground")}>
                {entryClock}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-border/40 border border-border/40 rounded-lg overflow-hidden shadow-sm">
          <Stat label="RSI" value={signal.rsi.toFixed(1)} tone={signal.rsi > 70 ? "bear" : signal.rsi < 30 ? "bull" : "neutral"} />
          <Stat label="Tendência" value={signal.trend === "UP" ? "Alta" : signal.trend === "DOWN" ? "Baixa" : "Lateral"} tone={signal.trend === "UP" ? "bull" : signal.trend === "DOWN" ? "bear" : "neutral"} />
          <Stat label="Preço" value={(() => { const p = livePrice ?? signal.price; if (!p) return "—"; const digits = p < 10 ? 5 : p < 100 ? 4 : p < 1000 ? 3 : 2; return p.toFixed(digits); })()} isLive={!!livePrice} />
          <Stat label="Liquidez" value={isWait ? "Baixa" : "ALTA"} tone={isWait ? "neutral" : (isBuy ? "bull" : "bear")} />
          <Stat label="Padrão" value={signal.pattern} />
          <div className="p-4 bg-secondary/5" /> {/* Spacer */}
        </div>
      </div>

      {showPopup && !isWait && (
        <div className={cn(
          "fixed top-12 left-1/2 -translate-x-1/2 z-[100] px-6 sm:px-10 py-5 sm:py-6 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] flex items-center gap-4 sm:gap-6 border-4 max-w-[95vw]",
          isBuy ? "bg-bull border-white text-white" : "bg-bear border-white text-white",
          isPreEntry && "animate-blink-fast"
        )}>
          <div className="bg-white/25 p-2.5 sm:p-3 rounded-xl shadow-inner shrink-0">
            <BellRing className="w-8 h-8 sm:w-10 sm:h-10 animate-bounce" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <span className="text-2xl sm:text-4xl font-black tracking-tighter uppercase italic">
                {isEntryMoment
                  ? (isBuy ? "COMPRE AGORA" : "VENDA AGORA")
                  : (isBuy ? `PREPARE COMPRA · ${secLeft}s` : `PREPARE VENDA · ${secLeft}s`)}
              </span>
              <span className="bg-white/30 px-2.5 py-1 rounded-md text-xs font-black tracking-widest">{timeframeLabel}</span>
            </div>
            <span className="text-xs sm:text-sm font-mono font-black opacity-90 uppercase tracking-[0.2em] mt-1">
              ATIVO: {pair} · ENTRADA {signal.entryTime}
            </span>

          </div>
        </div>
      )}
    </div>
  );
};

const Stat = ({ label, value, tone, isLive }: { label: string; value: string; tone?: "bull" | "bear" | "neutral"; isLive?: boolean }) => {
  const [flash, setFlash] = useState(false);
  const prevValue = useRef(value);
  useEffect(() => {
    if (isLive && value !== prevValue.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 400);
      prevValue.current = value;
      return () => clearTimeout(t);
    }
    prevValue.current = value;
  }, [value, isLive]);
  return (
    <div className="p-4 bg-secondary/5 hover:bg-secondary/10 transition-colors relative overflow-hidden">
      <div className="label-mono text-[10px] opacity-40 font-black uppercase tracking-widest flex items-center gap-1.5">
        {label}
        {isLive && <span className="live-dot scale-75" />}
      </div>
      <div className={cn(
        "font-mono font-black tabular text-sm mt-1.5 tracking-tight transition-colors duration-300",
        tone === "bull" && "text-bull",
        tone === "bear" && "text-bear",
        tone === "neutral" && "text-neutral",
        !tone && "text-foreground",
        flash && "text-primary"
      )}>{value}</div>
    </div>
  );
};