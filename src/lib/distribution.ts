// © ONOKO-CRÉATIONS — Tous droits réservés.
// Contenu des paquets téléchargeables (modèles de projets natifs + documentation).
// Les archives sont assemblées à la volée par /api/download/[platform].

export type Platform = "windows" | "macos" | "linux" | "android" | "ios" | "source";

export interface PlatformInfo {
  id: Platform;
  label: string;
  icon: string;
  description: string;
  format: string;
  requirements: string;
}

export const PLATFORMS: PlatformInfo[] = [
  { id: "windows", label: "Windows", icon: "🪟", description: "Application de bureau (Electron), installeur .exe", format: "ZIP → .exe", requirements: "Windows 10/11 64 bits · Node.js 20 pour construire" },
  { id: "macos", label: "macOS", icon: "🍎", description: "Application de bureau (Electron), image .dmg", format: "ZIP → .dmg", requirements: "macOS 12+ · Xcode CLT · Node.js 20" },
  { id: "linux", label: "Linux", icon: "🐧", description: "Application de bureau (Electron), AppImage et .deb", format: "ZIP → AppImage / .deb", requirements: "Ubuntu 20.04+ ou équivalent · Node.js 20" },
  { id: "android", label: "Android", icon: "🤖", description: "Projet Capacitor prêt pour Android Studio (.apk / .aab)", format: "ZIP → .apk / .aab", requirements: "Android Studio · Android 9+ · Node.js 20" },
  { id: "ios", label: "iOS / iPadOS", icon: "📱", description: "Projet Capacitor prêt pour Xcode (.ipa, App Store)", format: "ZIP → .ipa", requirements: "macOS + Xcode 15 · iOS 15+ · compte développeur Apple" },
  { id: "source", label: "Serveur (code source)", icon: "🗄️", description: "Code source complet Next.js + PostgreSQL : à héberger pour le multijoueur, les sauvegardes et les paiements", format: "ZIP", requirements: "Node.js 20 · PostgreSQL 14+" },
];

export const APP_ID = "com.onoko.minkebe";
export const APP_NAME = "Minkébé";

export function electronPackageJson(platform: "windows" | "macos" | "linux", version: string): string {
  const targets = platform === "windows" ? { win: { target: ["nsis", "portable"], icon: "build/icon.png" } } : platform === "macos" ? { mac: { target: ["dmg", "zip"], category: "public.app-category.games", icon: "build/icon.png" } } : { linux: { target: ["AppImage", "deb"], category: "Game", icon: "build/icon.png" } };
  const script = platform === "windows" ? "electron-builder --win" : platform === "macos" ? "electron-builder --mac" : "electron-builder --linux";
  return JSON.stringify(
    {
      name: "minkebe-desktop",
      productName: APP_NAME,
      version,
      description: "Minkébé — Aventure, style et survie dans la forêt équatoriale du Gabon. © ONOKO-CRÉATIONS",
      author: "ONOKO-CRÉATIONS",
      license: "SEE LICENSE IN LICENSE",
      main: "main.js",
      scripts: { start: "electron .", dist: script },
      devDependencies: { electron: "^33.0.0", "electron-builder": "^25.0.0" },
      build: {
        appId: APP_ID,
        productName: APP_NAME,
        copyright: "© ONOKO-CRÉATIONS — Tous droits réservés",
        directories: { output: "dist" },
        files: ["main.js", "preload.js", "config.json", "build/**/*"],
        ...targets,
        nsis: { oneClick: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: true },
      },
    },
    null,
    2
  );
}

export function electronMain(): string {
  return `// © ONOKO-CRÉATIONS — Tous droits réservés.
// Lanceur de bureau Minkébé : ouvre le jeu (serveur en ligne) dans une fenêtre native,
// plein écran, avec accès micro (chat vocal), pointer lock et accélération GPU.
const { app, BrowserWindow, session, shell, Menu, globalShortcut } = require("electron");
const path = require("path");
const config = require("./config.json");

app.commandLine.appendSwitch("enable-features", "VaapiVideoDecoder,CanvasOopRasterization");
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: "#061008",
    title: "Minkébé — ONOKO-CRÉATIONS",
    icon: path.join(__dirname, "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  Menu.setApplicationMenu(null);

  // Autorise micro (voix), pointer lock et plein écran pour le domaine du jeu
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(["media", "pointerLock", "fullscreen", "notifications"].includes(permission));
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadURL(config.gameUrl);
  win.once("ready-to-show", () => win.show());
  win.webContents.on("did-fail-load", () => {
    win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(
      "<body style='background:#061008;color:#dff;font-family:sans-serif;display:grid;place-items:center;height:100vh'><div style='text-align:center'><h1>Minkébé</h1><p>Impossible de joindre le serveur de jeu :<br><code>" + config.gameUrl + "</code></p><p>Vérifie ta connexion ou modifie <b>config.json</b>.</p><p style='opacity:.5'>© ONOKO-CRÉATIONS</p></div></body>"
    ));
  });

  globalShortcut.register("F11", () => win.setFullScreen(!win.isFullScreen()));
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => globalShortcut.unregisterAll());
`;
}

export function electronPreload(): string {
  return `// © ONOKO-CRÉATIONS — Tous droits réservés.
const { contextBridge } = require("electron");
contextBridge.exposeInMainWorld("minkebeDesktop", { platform: process.platform, version: process.versions.electron });
`;
}

export function capacitorConfig(gameUrl: string): string {
  return JSON.stringify(
    {
      appId: APP_ID,
      appName: APP_NAME,
      webDir: "www",
      server: { url: gameUrl, cleartext: false, allowNavigation: [new URL(gameUrl).host, "*.paypal.com", "*.stripe.com"] },
      backgroundColor: "#061008",
      android: { allowMixedContent: false, backgroundColor: "#061008" },
      ios: { contentInset: "never", backgroundColor: "#061008", preferredContentMode: "mobile" },
      plugins: {
        SplashScreen: { launchShowDuration: 1500, backgroundColor: "#061008", showSpinner: false },
        StatusBar: { style: "DARK", overlaysWebView: true },
      },
    },
    null,
    2
  );
}

export function capacitorPackageJson(platform: "android" | "ios", version: string): string {
  const platformPkg = platform === "android" ? { "@capacitor/android": "^6.0.0" } : { "@capacitor/ios": "^6.0.0" };
  const scripts =
    platform === "android"
      ? { setup: "npm install && npx cap add android && npx cap sync android", open: "npx cap open android", build: "cd android && ./gradlew assembleRelease" }
      : { setup: "npm install && npx cap add ios && npx cap sync ios", open: "npx cap open ios" };
  return JSON.stringify(
    {
      name: "minkebe-mobile",
      version,
      private: true,
      description: "Minkébé — application mobile (Capacitor). © ONOKO-CRÉATIONS",
      scripts,
      dependencies: { "@capacitor/core": "^6.0.0", "@capacitor/splash-screen": "^6.0.0", "@capacitor/status-bar": "^6.0.0", ...platformPkg },
      devDependencies: { "@capacitor/cli": "^6.0.0" },
    },
    null,
    2
  );
}

export function mobileIndexHtml(gameUrl: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no"><title>Minkébé</title>
<style>body{margin:0;background:#061008;color:#dff;font-family:sans-serif;display:grid;place-items:center;height:100vh;text-align:center}</style></head>
<body><div><h1>Minkébé</h1><p>Chargement du jeu…</p><p style="opacity:.5">© ONOKO-CRÉATIONS</p></div>
<script>location.replace(${JSON.stringify(gameUrl)});</script></body></html>`;
}

export function readme(platform: Platform, gameUrl: string, version: string): string {
  const header = `MINKÉBÉ — Aventure, style et survie dans la forêt équatoriale du Gabon
© ONOKO-CRÉATIONS — Tous droits réservés · Version ${version}
Serveur de jeu : ${gameUrl}
`;
  const desktop = (os: string, out: string, extra: string) => `${header}
=== ${os} — Application de bureau (Electron) ===

Pré-requis : Node.js 20+ (https://nodejs.org)${extra}

1) Ouvre un terminal dans ce dossier
2) npm install
3) npm start            → lance le jeu dans une fenêtre native (test)
4) npm run dist         → construit ${out} dans le dossier dist/

L'application charge le jeu depuis le serveur indiqué dans config.json ("gameUrl").
Pour pointer vers ton propre serveur (voir le paquet "Serveur"), modifie cette valeur.

Astuces : F11 plein écran · le micro est autorisé pour le chat vocal · 4K géré automatiquement.
`;
  switch (platform) {
    case "windows":
      return desktop("WINDOWS", "l'installeur .exe (NSIS) et une version portable", "");
    case "macos":
      return desktop("MACOS", "l'image .dmg et un .zip", "\nXcode Command Line Tools (xcode-select --install). Pour distribuer hors de ta machine : signature et notarisation Apple.");
    case "linux":
      return desktop("LINUX", "une AppImage et un paquet .deb", "");
    case "android":
      return `${header}
=== ANDROID — Projet Capacitor ===

Pré-requis : Node.js 20+, Android Studio (SDK 34), JDK 17.

1) npm run setup        → installe Capacitor et génère le dossier android/
2) npm run open         → ouvre le projet dans Android Studio
3) Dans Android Studio : Build → Generate Signed Bundle / APK (.aab pour le Play Store, .apk pour une installation directe)
   ou en ligne de commande : npm run build (APK release non signé dans android/app/build/outputs/)

L'application affiche le jeu depuis le serveur défini dans capacitor.config.json ("server.url").
Les commandes tactiles, le profil graphique "Mobile 1080p" et le micro (chat vocal) sont pris en charge.

Alternative sans compilation : ouvre ${gameUrl} dans Chrome Android → menu ⋮ → "Installer l'application" (PWA).
`;
    case "ios":
      return `${header}
=== iOS / iPadOS — Projet Capacitor ===

Pré-requis : un Mac avec Xcode 15+, CocoaPods (sudo gem install cocoapods), Node.js 20+, compte développeur Apple.

1) npm run setup        → installe Capacitor et génère le dossier ios/
2) npm run open         → ouvre App/App.xcworkspace dans Xcode
3) Sélectionne ton équipe de signature, puis Product → Archive → Distribute (TestFlight / App Store).

L'application affiche le jeu depuis le serveur défini dans capacitor.config.json ("server.url").
Dans Xcode, ajoute dans Info.plist : NSMicrophoneUsageDescription = "Chat vocal avec ton équipe".

Alternative sans compilation : ouvre ${gameUrl} dans Safari → Partager → "Sur l'écran d'accueil" (PWA).
`;
    case "source":
      return `${header}
=== SERVEUR — Code source complet (Next.js 16 + PostgreSQL) ===

Ce paquet contient le jeu complet : moteur 3D, interface, API, multijoueur, chat vocal, paiements.
Il faut l'héberger (Vercel, Railway, Render, VPS…) avec une base PostgreSQL (Neon, Supabase, locale…).

Installation :
  npm install
  cp .env.example .env     → renseigne DATABASE_URL
  npx drizzle-kit push     → crée les tables
  npm run build && npm start   → http://localhost:3000

Variables d'environnement (.env) :
  DATABASE_URL            postgresql://user:motdepasse@hote:5432/minkebe   (obligatoire)
  NEXT_PUBLIC_APP_URL     https://ton-domaine (retours de paiement)
  STRIPE_SECRET_KEY       paiement par carte (facultatif)
  STRIPE_WEBHOOK_SECRET   webhook Stripe (facultatif)
  PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET   paiement PayPal (facultatif)
  PAYPAL_ENV              sandbox | live
  PAYPAL_WEBHOOK_ID       vérification des webhooks PayPal (facultatif)

Important : servir en HTTPS (micro, WebRTC, PWA et pointer lock l'exigent).
Les paquets Windows/macOS/Linux/Android/iOS se connectent à ce serveur : indique son URL dans leur config.
`;
  }
}

export function envExample(): string {
  return `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/minkebe
NEXT_PUBLIC_APP_URL=https://minkebe.example.com
# STRIPE_SECRET_KEY=sk_live_...
# STRIPE_WEBHOOK_SECRET=whsec_...
# PAYPAL_CLIENT_ID=
# PAYPAL_CLIENT_SECRET=
# PAYPAL_ENV=sandbox
# PAYPAL_WEBHOOK_ID=
`;
}
