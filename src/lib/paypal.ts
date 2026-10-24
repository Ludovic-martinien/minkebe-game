// © ONOKO-CRÉATIONS — Tous droits réservés.
// Client minimal de l'API REST PayPal (Orders v2) : creation et capture de commande.
// Variables : PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV ("sandbox" | "live", defaut sandbox)

export function paypalEnabled(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

export function paypalBaseUrl(): string {
  if (process.env.PAYPAL_API_BASE) return process.env.PAYPAL_API_BASE.replace(/\/$/, "");
  return process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

export function paypalClientId(): string | null {
  return process.env.PAYPAL_CLIENT_ID ?? null;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PayPal auth ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

export interface PayPalOrder {
  id: string;
  status: string;
  links?: { href: string; rel: string; method: string }[];
  purchase_units?: { payments?: { captures?: { id: string; status: string; amount: { value: string; currency_code: string } }[] } }[];
}

export async function createPayPalOrder(params: {
  amountCents: number;
  currency: string;
  description: string;
  customId: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<PayPalOrder> {
  const token = await accessToken();
  const res = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": params.customId },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: params.customId,
          description: params.description,
          amount: { currency_code: params.currency.toUpperCase(), value: (params.amountCents / 100).toFixed(2) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "ONOKO-CRÉATIONS — Minkébé",
            locale: "fr-FR",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            return_url: params.returnUrl,
            cancel_url: params.cancelUrl,
          },
        },
      },
    }),
    cache: "no-store",
  });
  const data = (await res.json()) as PayPalOrder & { message?: string };
  if (!res.ok) throw new Error(data.message ?? `PayPal order ${res.status}`);
  return data;
}

export async function capturePayPalOrder(orderId: string): Promise<PayPalOrder> {
  const token = await accessToken();
  const res = await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  const data = (await res.json()) as PayPalOrder & { message?: string; details?: { issue?: string }[] };
  // Deja capturee : on relit la commande
  if (res.status === 422 && data.details?.some((d) => d.issue === "ORDER_ALREADY_CAPTURED")) {
    return getPayPalOrder(orderId);
  }
  if (!res.ok) throw new Error(data.message ?? `PayPal capture ${res.status}`);
  return data;
}

export async function getPayPalOrder(orderId: string): Promise<PayPalOrder> {
  const token = await accessToken();
  const res = await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PayPal order read ${res.status}`);
  return (await res.json()) as PayPalOrder;
}

export function isOrderPaid(order: PayPalOrder): boolean {
  if (order.status === "COMPLETED") return true;
  return Boolean(order.purchase_units?.some((u) => u.payments?.captures?.some((c) => c.status === "COMPLETED")));
}
