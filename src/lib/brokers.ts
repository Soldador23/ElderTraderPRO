// Broker integration helpers — open broker platforms in new tab or floating popup.
// We CAN'T read data from inside the broker (browser security), but we CAN deep-link
// to the broker so the trader executes faster.

export type BrokerId = "exnova" | "bullex";

export interface Broker {
  id: BrokerId;
  name: string;
  url: string;
  color: string; // tailwind text color
}

export const BROKERS: Broker[] = [
  { id: "exnova", name: "Exnova",  url: "https://trade.exnova.com/traderoom",  color: "text-primary" },
  { id: "bullex", name: "Bullex",  url: "https://trade.bullex.com/traderoom",  color: "text-bull" },
];

const STORAGE_KEY = "elder.broker";

export const getStoredBroker = (): BrokerId => {
  if (typeof window === "undefined") return "exnova";
  const v = window.localStorage.getItem(STORAGE_KEY) as BrokerId | null;
  return v === "bullex" || v === "exnova" ? v : "exnova";
};

export const setStoredBroker = (id: BrokerId) => {
  try { window.localStorage.setItem(STORAGE_KEY, id); } catch {}
};

export const openBroker = (id: BrokerId) => {
  const broker = BROKERS.find(b => b.id === id);
  if (!broker) return;
  window.open(broker.url, `broker_${id}`, "noopener,noreferrer");
};

// Open the Elder Trader app itself in a small always-on-top-ish floating window
// so the user can keep the broker fullscreen and drag the signal panel over it.
export const openFloatingTerminal = () => {
  const w = 460;
  const h = 720;
  const left = window.screen.availWidth - w - 20;
  const top = 40;
  window.open(
    window.location.href,
    "elder_floating",
    `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`
  );
};
