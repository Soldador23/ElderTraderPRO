import { useEffect, useState } from "react";
import { BROKERS, BrokerId, getStoredBroker, setStoredBroker, openBroker, openFloatingTerminal } from "@/lib/brokers";
import { ExternalLink, PictureInPicture2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  pairSymbol: string;
}

export const BrokerLauncher = ({ pairSymbol }: Props) => {
  const [broker, setBroker] = useState<BrokerId>("exnova");

  useEffect(() => { setBroker(getStoredBroker()); }, []);

  const handleSelect = (id: BrokerId) => {
    setBroker(id);
    setStoredBroker(id);
  };

  const active = BROKERS.find(b => b.id === broker)!;

  return (
    <div className="premium-card rounded-lg p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="label-mono text-primary font-bold">Trading Real</div>
          <div className="font-display text-sm font-black mt-0.5 tracking-tight">Executar em Conta Real</div>
        </div>
        <span className="text-[9px] font-mono tracking-widest text-muted-foreground uppercase">
          {pairSymbol}
        </span>
      </div>

      {/* Broker toggle */}
      <div className="grid grid-cols-2 gap-px bg-border border border-border rounded-sm overflow-hidden">
        {BROKERS.map(b => (
          <button
            key={b.id}
            onClick={() => handleSelect(b.id)}
            className={cn(
              "py-2.5 text-[11px] font-mono font-bold tracking-widest uppercase transition-colors",
              broker === b.id
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            {b.name}
          </button>
        ))}
      </div>

      {/* Action buttons */}
      <div className="space-y-2">
        <button
          onClick={() => openBroker(broker)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-sm bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-mono font-bold text-xs tracking-widest uppercase hover:opacity-90 transition-opacity"
        >
          <Zap className="w-3.5 h-3.5" strokeWidth={2.5} />
          Entrar na Operação · {active.name}
        </button>

        <button
          onClick={openFloatingTerminal}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-sm border border-border bg-secondary/40 text-foreground font-mono font-bold text-[11px] tracking-widest uppercase hover:bg-secondary transition-colors"
        >
          <PictureInPicture2 className="w-3.5 h-3.5" />
          Modo Janela Flutuante
        </button>
      </div>

      {/* Help */}
      <div className="text-[10px] font-mono text-muted-foreground leading-relaxed border-t border-border pt-3">
        <p className="flex items-start gap-1.5">
          <ExternalLink className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            Abra a corretora ao lado e use os sinais para executar CALL/PUT manualmente.
            O modo flutuante mantém o terminal por cima da corretora.
          </span>
        </p>
      </div>
    </div>
  );
};
