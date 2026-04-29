// Edge function que faz proxy seguro para a API do TwelveData.
// A chave fica protegida em TWELVEDATA_API_KEY (server-side) e nunca chega ao browser.
// Endpoints suportados:
//   GET ?action=time_series&symbol=EUR/USD&interval=1min&outputsize=200
//   GET ?action=quote&symbol=EUR/USD
//   GET ?action=price&symbol=EUR/USD,GBP/USD,...

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TD_BASE = "https://api.twelvedata.com";

const ALLOWED_ACTIONS = new Set([
  "time_series",
  "quote",
  "price",
]);

const ALLOWED_INTERVALS = new Set([
  "1min", "5min", "15min", "30min", "45min",
  "1h", "2h", "4h", "8h",
  "1day", "1week", "1month",
]);

// Validação simples de símbolo (letras, dígitos, /, -, vírgula para múltiplos).
const SYMBOL_RE = /^[A-Za-z0-9/\-,]{1,200}$/;

// ---------------------------------------------------------------------------
// Cache em memória (por instância da edge function).
// Evita gastar créditos do TwelveData quando vários clientes (ou o mesmo
// cliente fazendo polling) pedem o mesmo dado em curto intervalo.
// ---------------------------------------------------------------------------
interface CacheEntry {
  body: string;
  status: number;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();

function cacheTtlMs(action: string, interval: string): number {
  if (action === "quote") return 30_000;       // cota: 1 req a cada 30s por símbolo
  if (action === "price") return 10_000;
  if (action === "time_series") {
    // Vela M1 fecha a cada 60s — refrescar a cada 20s é mais que suficiente.
    if (interval === "1min") return 20_000;
    if (interval === "5min") return 60_000;
    if (interval === "15min") return 120_000;
    return 300_000;
  }
  return 15_000;
}

function getCache(key: string): CacheEntry | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    cache.delete(key);
    return null;
  }
  return e;
}

function setCache(key: string, body: string, status: number, ttl: number) {
  cache.set(key, { body, status, expiresAt: Date.now() + ttl });
  // Garbage collection simples para não vazar memória.
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache) if (v.expiresAt < now) cache.delete(k);
  }
}

// ---------------------------------------------------------------------------
// Rate limiter por janela deslizante de 60s. O tier grátis do TwelveData
// permite 8 req/min — mantemos margem de segurança em 7.
// ---------------------------------------------------------------------------
const MAX_REQ_PER_MIN = 7;
const requestTimestamps: number[] = [];

async function waitForSlot() {
  while (true) {
    const now = Date.now();
    while (requestTimestamps.length && now - requestTimestamps[0] > 60_000) {
      requestTimestamps.shift();
    }
    if (requestTimestamps.length < MAX_REQ_PER_MIN) {
      requestTimestamps.push(now);
      return;
    }
    // Espera até o slot mais antigo sair da janela (+50ms de folga).
    const wait = 60_000 - (now - requestTimestamps[0]) + 50;
    await new Promise(r => setTimeout(r, Math.max(wait, 250)));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("TWELVEDATA_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "TWELVEDATA_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "";
    const symbol = url.searchParams.get("symbol") ?? "";
    const interval = url.searchParams.get("interval") ?? "";
    const outputsize = url.searchParams.get("outputsize") ?? "200";

    if (!ALLOWED_ACTIONS.has(action)) {
      return new Response(
        JSON.stringify({ error: "invalid action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!SYMBOL_RE.test(symbol)) {
      return new Response(
        JSON.stringify({ error: "invalid symbol" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const target = new URL(`${TD_BASE}/${action}`);
    target.searchParams.set("symbol", symbol);
    target.searchParams.set("apikey", apiKey);
    target.searchParams.set("format", "JSON");

    if (action === "time_series") {
      if (!ALLOWED_INTERVALS.has(interval)) {
        return new Response(
          JSON.stringify({ error: "invalid interval" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      target.searchParams.set("interval", interval);
      const size = Math.min(Math.max(parseInt(outputsize) || 200, 1), 5000);
      target.searchParams.set("outputsize", String(size));
      target.searchParams.set("order", "ASC");
    }

    // ---- Cache hit? ----
    const cacheKey = `${action}|${symbol}|${interval}|${outputsize}`;
    const hit = getCache(cacheKey);
    if (hit) {
      return new Response(hit.body, {
        status: hit.status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-Cache": "HIT",
        },
      });
    }

    // ---- Respeita o rate limit do tier grátis (7 req/min) ----
    await waitForSlot();

    const upstream = await fetch(target.toString());
    const body = await upstream.text();

    // Só cacheia respostas válidas (status 200 e sem campo "code" de erro).
    let isError = upstream.status !== 200;
    if (!isError) {
      try {
        const parsed = JSON.parse(body);
        if (parsed && (parsed.status === "error" || parsed.code === 429)) {
          isError = true;
        }
      } catch { /* ignore */ }
    }
    if (!isError) {
      setCache(cacheKey, body, upstream.status, cacheTtlMs(action, interval));
    }

    return new Response(body, {
      status: upstream.status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-Cache": "MISS",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});