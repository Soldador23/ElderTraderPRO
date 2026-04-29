import { TIMEFRAMES, TimeframeValue } from "@/lib/markets";
import { cn } from "@/lib/utils";

interface Props {
  value: TimeframeValue;
  onChange: (v: TimeframeValue) => void;
}

export const TimeframeSelector = ({ value, onChange }: Props) => (
  <div className="inline-flex border border-border rounded-sm overflow-hidden">
    {TIMEFRAMES.map((tf, i) => (
      <button
        key={tf.value}
        onClick={() => onChange(tf.value)}
        className={cn(
          "px-3 py-1.5 text-[11px] font-mono font-bold tracking-wider transition-all relative",
          i > 0 && "border-l border-border",
          value === tf.value
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
        )}
      >
        {tf.label}
      </button>
    ))}
  </div>
);
