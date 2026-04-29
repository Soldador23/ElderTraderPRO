import { Pair, PAIRS } from "@/lib/markets";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Search, Check, ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  selectedPairs: Pair[];
  onToggle: (p: Pair) => void;
  prices?: Record<string, number>;
}

const CAT_LABEL: Record<string, string> = {
  crypto: "Criptomoedas",
  forex: "Forex",
  commodity: "Metais",
};

export const PairSelector = ({ selectedPairs, onToggle, prices = {} }: Props) => {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    crypto: false,
    forex: false,
    commodity: false,
  });

  const toggleCollapse = (cat: string) => {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const filtered = PAIRS.filter(p =>
    p.symbol.toLowerCase().includes(query.toLowerCase())
  );

  const grouped = {
    crypto: filtered.filter(p => p.category === "crypto"),
    forex: filtered.filter(p => p.category === "forex"),
    commodity: filtered.filter(p => p.category === "commodity"),
  };

  const isSelected = (p: Pair) => selectedPairs.some(item => item.td === p.td);

  return (
    <div className="premium-card rounded-lg overflow-hidden border border-border/40 shadow-xl">
      <div className="px-4 py-4 border-b border-border/40 flex items-center justify-between bg-secondary/20">
        <div>
          <div className="label-mono opacity-50">Ativos Disponíveis</div>
          <div className="font-display text-lg font-black mt-0.5 tracking-tight">Mercados</div>
        </div>
        <span className="text-[10px] font-mono text-primary font-bold tabular bg-primary/10 px-2 py-0.5 rounded">
          {selectedPairs.length}/{PAIRS.length} ATIVOS
        </span>
      </div>

      <div className="px-4 py-3 border-b border-border/40">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar mercados..."
            className="w-full pl-8 pr-3 py-2 bg-background border border-border/40 rounded-sm text-xs font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
          />
        </div>
      </div>

      <div className="max-h-[600px] overflow-y-auto scrollbar-thin">
        {(Object.keys(grouped) as (keyof typeof grouped)[]).map(cat => {
          if (grouped[cat].length === 0) return null;
          const isCollapsed = collapsed[cat];
          return (
            <div key={cat} className="border-b border-border/20 last:border-0">
              <button 
                onClick={() => toggleCollapse(cat)}
                className="w-full px-4 py-2.5 bg-secondary/40 border-y border-border/20 flex items-center justify-between hover:bg-secondary/60 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-primary" /> : <ChevronDown className="w-3.5 h-3.5 text-primary" />}
                  <span className="label-mono font-bold text-foreground">{CAT_LABEL[cat]}</span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground tabular bg-background/50 px-1.5 py-0.5 rounded">
                  {grouped[cat].length}
                </span>
              </button>
              
              {!isCollapsed && grouped[cat].map(p => {
                const active = isSelected(p);
                const [base, quote] = p.symbol.split("/");
                const currentPrice = prices[p.td];
                
                return (
                  <button
                    key={p.td}
                    onClick={() => onToggle(p)}
                    className={cn(
                      "w-full text-left px-4 py-3.5 transition-all border-b border-border/10 last:border-0 group relative flex items-center justify-between",
                      active
                        ? "bg-primary/[0.03]"
                        : "hover:bg-secondary/20"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-4 h-4 rounded-sm border flex items-center justify-center transition-all duration-300",
                        active ? "bg-primary border-primary shadow-[0_0_8px_hsl(var(--primary)/0.4)]" : "border-border/60 bg-background"
                      )}>
                        {active && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={4} />}
                      </div>
                      <div className="font-mono text-[13px] leading-none">
                        <span className={cn("font-bold tracking-wider", active ? "text-primary" : "text-foreground")}>
                          {base}
                        </span>
                        <span className="text-muted-foreground/40 font-medium ml-0.5">/ {quote}</span>
                      </div>
                    </div>

                    {currentPrice !== undefined && (
                      <div className="text-right">
                        <div className="font-mono font-bold text-[11px] tabular tracking-tighter text-foreground/80">
                          {(() => { const digits = currentPrice < 10 ? 5 : currentPrice < 100 ? 4 : currentPrice < 1000 ? 3 : 2; return currentPrice.toFixed(digits); })()}
                        </div>
                        <div className="text-[8px] font-mono text-bull opacity-60 uppercase font-black tracking-widest mt-0.5">Live</div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="p-8 text-center text-xs font-mono text-muted-foreground/40 italic">
            Nenhum ativo encontrado na busca
          </div>
        )}
      </div>
    </div>
  );
};