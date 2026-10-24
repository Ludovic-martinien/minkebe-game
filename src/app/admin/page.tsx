"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { GAME_VERSION, STUDIO_NAME } from "@/lib/version";
import { levelFromXp, levelInfo } from "@/game/levels";

interface PurchaseRow {
  id: number;
  playerName: string;
  provider: string;
  amountCents: number;
  currency: string;
  status: string;
  licenseKey: string;
  payerPhone: string | null;
  txRef: string | null;
  createdAt: string;
  paidAt: string | null;
}

interface SaveRow {
  id: number;
  slotName: string;
  character: string;
  health: number;
  hunger: number;
  thirst: number;
  kills: number;
  whimstars: number;
  styleScore: number;
  timeSurvived: number;
  hasShelter: boolean;
  hasSpear: boolean;
  xp?: number;
  updatedAt: string;
}

interface ExpeditionRow {
  id: number;
  playerName: string;
  character: string;
  timeSurvived: number;
  resourcesCollected: number;
  kills: number;
  causeOfDeath: string;
  createdAt: string;
}

interface RoomPlayerItem {
  id: number;
  playerId: string;
  name: string;
  character: string;
  lastSeen: string;
  health: number;
  dead: boolean;
}

interface RoomRow {
  id: number;
  code: string;
  worldSeed: number;
  huntingEnabled: boolean;
  updatedAt: string;
  players: RoomPlayerItem[];
}

interface AdminStats {
  purchasesTotal: number;
  purchasesPaid: number;
  revenueEur: number;
  revenueXaf: number;
  savesTotal: number;
  expeditionsTotal: number;
  activeRooms: number;
  onlinePlayers: number;
}

type AdminTab = "purchases" | "rooms" | "saves" | "expeditions";

function formatDuration(sec: number): string {
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>("purchases");
  const [adminKey, setAdminKey] = useState("");
  const [needsKey, setNeedsKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [saves, setSaves] = useState<SaveRow[]>([]);
  const [expeditions, setExpeditions] = useState<ExpeditionRow[]>([]);
  const [rooms, setRooms] = useState<RoomRow[]>([]);

  const [grantName, setGrantName] = useState("");
  const [grantProvider, setGrantProvider] = useState<"admin" | "airtel" | "moov" | "paypal">("admin");
  const [grantPhone, setGrantPhone] = useState("");
  const [grantRef, setGrantRef] = useState("");

  const loadDashboard = useCallback(
    async (keyOverride?: string) => {
      setLoading(true);
      try {
        const keyToSend = keyOverride ?? adminKey;
        const res = await fetch("/api/admin", {
          cache: "no-store",
          headers: keyToSend ? { "x-admin-key": keyToSend } : undefined,
        });
        if (res.status === 401) {
          setNeedsKey(true);
          setLoading(false);
          return;
        }
        const data = (await res.json()) as {
          ok?: boolean;
          stats?: AdminStats;
          purchases?: PurchaseRow[];
          saves?: SaveRow[];
          expeditions?: ExpeditionRow[];
          rooms?: RoomRow[];
          error?: string;
        };
        if (!res.ok || !data.ok) {
          setFeedback(data.error ?? "Impossible de charger le tableau de bord.");
          setLoading(false);
          return;
        }
        setNeedsKey(false);
        setStats(data.stats ?? null);
        setPurchases(data.purchases ?? []);
        setSaves(data.saves ?? []);
        setExpeditions(data.expeditions ?? []);
        setRooms(data.rooms ?? []);
      } catch {
        setFeedback("Erreur réseau lors du chargement de l'administration.");
      } finally {
        setLoading(false);
      }
    },
    [adminKey]
  );

  useEffect(() => {
    const saved = window.sessionStorage.getItem("minkebe.adminKey") ?? "";
    if (saved) setAdminKey(saved);
    void loadDashboard(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAction = async (payload: Record<string, unknown>, successText: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(adminKey ? { "x-admin-key": adminKey } : {}),
        },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok?: boolean; purchase?: PurchaseRow; error?: string };
      if (!res.ok || !data.ok) {
        setFeedback(data.error ?? "Action refusée.");
        return;
      }
      if (data.purchase?.licenseKey) {
        setFeedback(`${successText} — Clé générée : ${data.purchase.licenseKey}`);
      } else {
        setFeedback(successText);
      }
      await loadDashboard();
    } catch {
      setFeedback("Erreur réseau.");
    } finally {
      setBusy(false);
    }
  };

  const handleGrantPass = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAction(
      {
        action: "grant_pass",
        playerName: grantName.trim() || "Explorateur VIP",
        provider: grantProvider,
        payerPhone: grantPhone.trim() || null,
        txRef: grantRef.trim() || null,
      },
      "Licence Pass Explorateur créée"
    );
    setGrantName("");
    setGrantPhone("");
    setGrantRef("");
  };

  return (
    <div className="h-dvh w-full overflow-y-auto bg-[#06130b] text-emerald-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        {/* En-tête */}
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-emerald-200/20 bg-emerald-950/50 p-6 shadow-2xl backdrop-blur-xl">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-lime-300">{STUDIO_NAME} · Administration</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">Console Administrateur — Minkébé</h1>
            <p className="mt-1 text-xs text-emerald-100/70">
              Version {GAME_VERSION} · Gestion des paiements (PayPal, Airtel Money 077022306, Moov Money 062641120), clés Pass, salons en ligne et sauvegardes
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadDashboard()}
              disabled={loading || busy}
              className="rounded-xl border border-emerald-300/30 bg-emerald-900/40 px-4 py-2.5 text-xs font-bold text-emerald-100 transition hover:bg-emerald-800/50 disabled:opacity-50"
            >
              ↻ Actualiser
            </button>
            <Link
              href="/"
              className="rounded-xl bg-lime-400 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-emerald-950 transition hover:bg-lime-300"
            >
              ← Retour au jeu
            </Link>
          </div>
        </header>

        {needsKey && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              window.sessionStorage.setItem("minkebe.adminKey", adminKey);
              void loadDashboard(adminKey);
            }}
            className="mt-6 rounded-2xl border border-amber-300/30 bg-black/40 p-5"
          >
            <p className="text-sm font-bold text-amber-200">🔒 Code administrateur requis</p>
            <div className="mt-3 flex gap-2">
              <input
                type="password"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder="Clé ADMIN_ACCESS_KEY"
                className="flex-1 rounded-xl border border-emerald-200/20 bg-black/40 px-4 py-2 text-sm text-white outline-none focus:border-lime-400"
              />
              <button type="submit" className="rounded-xl bg-amber-400 px-5 py-2 text-sm font-black text-amber-950">
                Déverrouiller
              </button>
            </div>
          </form>
        )}

        {feedback && (
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-lime-300/30 bg-emerald-900/50 px-4 py-3 text-sm text-lime-100">
            <span>{feedback}</span>
            <button type="button" onClick={() => setFeedback(null)} className="text-xs text-emerald-200/70 hover:text-white">
              ✕
            </button>
          </div>
        )}

        {/* Cartes statistiques */}
        {stats && (
          <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-amber-300/25 bg-gradient-to-br from-amber-500/15 to-emerald-950/40 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-200/80">Pass Explorateur payés</p>
              <p className="mt-2 text-3xl font-black text-white">
                {stats.purchasesPaid} <span className="text-sm font-normal text-emerald-100/60">/ {stats.purchasesTotal}</span>
              </p>
              <p className="mt-1 text-xs text-amber-100/80">
                {stats.revenueEur.toFixed(2)} € · {stats.revenueXaf.toLocaleString("fr-FR")} F CFA
              </p>
            </div>
            <div className="rounded-2xl border border-sky-300/25 bg-gradient-to-br from-sky-500/15 to-emerald-950/40 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-sky-200/80">Salons multijoueurs</p>
              <p className="mt-2 text-3xl font-black text-white">{stats.activeRooms}</p>
              <p className="mt-1 text-xs text-sky-100/80">{stats.onlinePlayers} joueur(s) synchronisé(s)</p>
            </div>
            <div className="rounded-2xl border border-emerald-300/25 bg-gradient-to-br from-emerald-500/15 to-emerald-950/40 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-200/80">Sauvegardes cloud</p>
              <p className="mt-2 text-3xl font-black text-white">{stats.savesTotal}</p>
              <p className="mt-1 text-xs text-emerald-100/75">Base PostgreSQL active</p>
            </div>
            <div className="rounded-2xl border border-pink-300/25 bg-gradient-to-br from-pink-500/15 to-emerald-950/40 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-pink-200/80">Expéditions classées</p>
              <p className="mt-2 text-3xl font-black text-white">{stats.expeditionsTotal}</p>
              <p className="mt-1 text-xs text-pink-100/80">Historique de survie</p>
            </div>
          </section>
        )}

        {/* Générateur de licence Pass Explorateur */}
        <section className="mt-6 rounded-3xl border border-amber-300/25 bg-emerald-950/45 p-5 backdrop-blur-md">
          <h2 className="text-base font-black text-amber-200">★ Générer / Valider manuellement une clé Pass Explorateur</h2>
          <p className="mt-1 text-xs text-emerald-100/70">
            Utile après réception d&apos;un paiement Airtel Money (077 02 23 06) ou Moov Money (062 64 11 20), ou pour offrir un accès VIP.
          </p>
          <form onSubmit={(e) => void handleGrantPass(e)} className="mt-3 grid gap-2 sm:grid-cols-5">
            <input
              value={grantName}
              onChange={(e) => setGrantName(e.target.value.slice(0, 40))}
              placeholder="Nom du joueur"
              className="rounded-xl border border-emerald-200/20 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-amber-300"
            />
            <select
              value={grantProvider}
              onChange={(e) => setGrantProvider(e.target.value as "admin" | "airtel" | "moov" | "paypal")}
              className="rounded-xl border border-emerald-200/20 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-amber-300"
            >
              <option value="admin">Offert (Admin)</option>
              <option value="airtel">Airtel Money (2 000 F CFA)</option>
              <option value="moov">Moov Money (2 000 F CFA)</option>
              <option value="paypal">PayPal (2,99 €)</option>
            </select>
            <input
              value={grantPhone}
              onChange={(e) => setGrantPhone(e.target.value.slice(0, 20))}
              placeholder="Tél. payeur (optionnel)"
              className="rounded-xl border border-emerald-200/20 bg-black/35 px-3 py-2 font-mono text-sm text-white outline-none focus:border-amber-300"
            />
            <input
              value={grantRef}
              onChange={(e) => setGrantRef(e.target.value.slice(0, 40))}
              placeholder="Réf. SMS / note"
              className="rounded-xl border border-emerald-200/20 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-amber-300"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-black text-amber-950 transition hover:bg-amber-300 disabled:opacity-50"
            >
              + Créer la clé Pass
            </button>
          </form>
        </section>

        {/* Onglets de gestion */}
        <div className="mt-6 flex flex-wrap gap-2">
          {(
            [
              ["purchases", `💳 Paiements & Licences (${purchases.length})`],
              ["rooms", `🌐 Salons en ligne (${rooms.length})`],
              ["saves", `💾 Sauvegardes (${saves.length})`],
              ["expeditions", `🏆 Classement (${expeditions.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition ${
                tab === key ? "bg-emerald-400 text-emerald-950" : "border border-white/15 bg-black/30 text-emerald-100/80 hover:bg-white/10"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Contenu de l'onglet actif */}
        <section className="mt-4 rounded-3xl border border-white/15 bg-emerald-950/40 p-5 shadow-2xl backdrop-blur-xl">
          {loading ? (
            <p className="py-8 text-center text-sm text-emerald-100/70">Chargement des données…</p>
          ) : tab === "purchases" ? (
            purchases.length === 0 ? (
              <p className="py-8 text-center text-sm text-emerald-100/60">Aucun paiement enregistré pour le moment.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-emerald-200/60">
                    <tr>
                      <th className="pb-2">Joueur</th>
                      <th className="pb-2">Moyen</th>
                      <th className="pb-2">Montant</th>
                      <th className="pb-2">Statut</th>
                      <th className="pb-2">Clé Licence</th>
                      <th className="pb-2">Téléphone / Réf.</th>
                      <th className="pb-2">Date</th>
                      <th className="pb-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((p) => (
                      <tr key={p.id} className="border-t border-white/10">
                        <td className="py-2.5 font-bold">{p.playerName}</td>
                        <td className="py-2.5 uppercase text-xs font-semibold text-sky-200">{p.provider}</td>
                        <td className="py-2.5 font-mono text-xs">
                          {p.currency === "xaf" ? "2 000 F CFA" : `${(p.amountCents / 100).toFixed(2)} €`}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                              p.status === "paid"
                                ? "bg-emerald-400/25 text-emerald-200"
                                : p.status === "pending"
                                  ? "bg-amber-400/25 text-amber-200"
                                  : "bg-rose-400/25 text-rose-200"
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="py-2.5 font-mono text-xs text-amber-200">{p.licenseKey}</td>
                        <td className="py-2.5 text-xs text-emerald-100/70">
                          {p.payerPhone ? <span className="font-mono">{p.payerPhone}</span> : "—"}
                          {p.txRef ? <span className="ml-1 text-emerald-200/60">({p.txRef})</span> : null}
                        </td>
                        <td className="py-2.5 text-xs text-emerald-100/60">{new Date(p.createdAt).toLocaleString("fr-FR")}</td>
                        <td className="py-2.5 text-right">
                          <div className="inline-flex gap-1.5">
                            {p.status !== "paid" ? (
                              <button
                                type="button"
                                onClick={() => void runAction({ action: "set_purchase_status", id: p.id, status: "paid" }, "Paiement validé")}
                                className="rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-bold text-emerald-950"
                              >
                                Valider
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void runAction({ action: "set_purchase_status", id: p.id, status: "pending" }, "Paiement remis en attente")}
                                className="rounded-lg border border-amber-300/30 px-2.5 py-1 text-xs text-amber-200"
                              >
                                Suspendre
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void runAction({ action: "delete_purchase", id: p.id }, "Paiement supprimé")}
                              className="rounded-lg border border-rose-300/30 px-2.5 py-1 text-xs text-rose-200 hover:bg-rose-500/20"
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : tab === "rooms" ? (
            rooms.length === 0 ? (
              <p className="py-8 text-center text-sm text-emerald-100/60">Aucun salon multijoueur actif.</p>
            ) : (
              <div className="space-y-3">
                {rooms.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 p-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-lg font-black tracking-widest text-lime-300">{r.code}</span>
                        <span className="rounded-full bg-sky-500/20 px-2.5 py-0.5 text-xs text-sky-200">
                          {r.players.length} joueur(s)
                        </span>
                        <span className="text-xs text-emerald-100/60">
                          Graine {r.worldSeed} · {r.huntingEnabled ? "Chasse active" : "Mode pacifique"}
                        </span>
                      </div>
                      {r.players.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-emerald-100/80">
                          {r.players.map((pl) => (
                            <span key={pl.id} className="rounded-lg bg-white/10 px-2 py-0.5">
                              {pl.name} ({pl.character}) · ❤ {Math.round(pl.health)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void runAction({ action: "close_room", id: r.id }, `Salon ${r.code} fermé`)}
                      className="rounded-xl border border-rose-300/30 px-3 py-1.5 text-xs font-bold text-rose-200 hover:bg-rose-500/20"
                    >
                      Fermer le salon
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : tab === "saves" ? (
            saves.length === 0 ? (
              <p className="py-8 text-center text-sm text-emerald-100/60">Aucune sauvegarde enregistrée.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-emerald-200/60">
                    <tr>
                      <th className="pb-2">Slot / Joueur</th>
                      <th className="pb-2">Niveau / Évolution</th>
                      <th className="pb-2">Personnage</th>
                      <th className="pb-2">Santé</th>
                      <th className="pb-2">Survie</th>
                      <th className="pb-2">Étoiles / Style</th>
                      <th className="pb-2">Équipement</th>
                      <th className="pb-2">Mise à jour</th>
                      <th className="pb-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saves.map((s) => (
                      <tr key={s.id} className="border-t border-white/10">
                        <td className="py-2.5 font-bold">{s.slotName}</td>
                        <td className="py-2.5 text-xs font-semibold text-amber-300">
                          Niv. {levelFromXp(s.xp ?? 0)} · {levelInfo(levelFromXp(s.xp ?? 0)).name} ({s.xp ?? 0} XP)
                        </td>
                        <td className="py-2.5 text-xs">{s.character}</td>
                        <td className="py-2.5 text-xs">❤ {Math.round(s.health)}</td>
                        <td className="py-2.5 font-mono text-xs">{formatDuration(s.timeSurvived)}</td>
                        <td className="py-2.5 text-xs">⭐ {s.whimstars} · ✨ {s.styleScore}</td>
                        <td className="py-2.5 text-xs">
                          {s.hasSpear ? "🗡 Lance " : ""}
                          {s.hasShelter ? "🛖 Abri" : ""}
                        </td>
                        <td className="py-2.5 text-xs text-emerald-100/60">{new Date(s.updatedAt).toLocaleString("fr-FR")}</td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => void runAction({ action: "delete_save", id: s.id }, `Sauvegarde ${s.slotName} supprimée`)}
                            className="rounded-lg border border-rose-300/30 px-2.5 py-1 text-xs text-rose-200 hover:bg-rose-500/20"
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : expeditions.length === 0 ? (
            <p className="py-8 text-center text-sm text-emerald-100/60">Aucune expédition dans le classement.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-emerald-200/60">
                  <tr>
                    <th className="pb-2">#</th>
                    <th className="pb-2">Explorateur</th>
                    <th className="pb-2">Personnage</th>
                    <th className="pb-2">Temps survécu</th>
                    <th className="pb-2">Ressources</th>
                    <th className="pb-2">Proies</th>
                    <th className="pb-2">Cause de fin</th>
                    <th className="pb-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {expeditions.map((ex, idx) => (
                    <tr key={ex.id} className="border-t border-white/10">
                      <td className="py-2.5 font-bold text-lime-300">{idx + 1}</td>
                      <td className="py-2.5 font-bold">{ex.playerName}</td>
                      <td className="py-2.5 text-xs">{ex.character}</td>
                      <td className="py-2.5 font-mono text-xs">{formatDuration(ex.timeSurvived)}</td>
                      <td className="py-2.5 font-mono text-xs">{ex.resourcesCollected}</td>
                      <td className="py-2.5 font-mono text-xs">{ex.kills}</td>
                      <td className="py-2.5 text-xs text-emerald-100/70">{ex.causeOfDeath}</td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => void runAction({ action: "delete_expedition", id: ex.id }, "Entrée du classement supprimée")}
                          className="rounded-lg border border-rose-300/30 px-2.5 py-1 text-xs text-rose-200 hover:bg-rose-500/20"
                        >
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
