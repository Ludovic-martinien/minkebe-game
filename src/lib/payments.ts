// © ONOKO-CRÉATIONS — Tous droits réservés.
import Stripe from "stripe";
import { randomBytes } from "crypto";

export const PASS_PRODUCT = {
  id: "pass_explorateur",
  name: "Minkébé — Pass Explorateur",
  description: "Soutien à ONOKO-CRÉATIONS : sauvegardes illimitées, badge doré au classement, machette dès le départ.",
  amountCents: 299,
  currency: "eur",
  amountXaf: 2000,
} as const;

export const MOBILE_MONEY = {
  airtel: {
    id: "airtel" as const,
    label: "Airtel Money Gabon",
    number: "077297069",
    display: "077 29 70 69",
    ussd: "*150#",
  },
  moov: {
    id: "moov" as const,
    label: "Moov Money Gabon",
    number: "062477789",
    display: "062 47 77 89",
    ussd: "*155#",
  },
} as const;

export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let client: Stripe | null = null;
export function getStripe(): Stripe | null {
  if (!stripeEnabled()) return null;
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY as string);
  return client;
}

/** Clé de licence lisible : MKB-XXXX-XXXX-XXXX */
export function makeLicenseKey(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if (i === 3 || i === 7) out += "-";
  }
  return `MKB-${out}`;
}

export function appUrl(request: Request): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}
