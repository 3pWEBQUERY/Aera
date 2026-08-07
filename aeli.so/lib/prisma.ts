import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/app/generated/prisma/client";
import type { Prisma } from "@/app/generated/prisma/client";

/**
 * Zwei Clients, zwei Rechtelagen.
 *
 * `prisma` — der Normalfall. Jede Abfrage laeuft in einer Transaktion, die
 *   zuerst `SET LOCAL ROLE aeli_app` ausfuehrt. Damit greifen die
 *   RLS-Policies der Migration 20260807120000_aeli_link_in_bio auch dann, wenn
 *   die physische Verbindung dem Tabelleneigentuemer gehoert (bei ihm wuerde
 *   RLS sonst schlicht uebersprungen).
 *
 *   Ist zusaetzlich ein Nutzer im Kontext, wird `aeli.user_id` gesetzt und die
 *   Abfrage sieht dessen Entwuerfe. Ohne Nutzer bleibt genau sichtbar, was
 *   veroeffentlicht ist — der oeffentliche Lesepfad der Bio-Seite braucht also
 *   keine einzige eigene `where`-Klausel, um sicher zu sein.
 *
 * `systemPrisma` — die privilegierte Verbindung. Genau zwei Aufgaben:
 *   Anmeldung/Registrierung (schreibt `User`, worauf `aeli_app` bewusst keinen
 *   Zugriff hat) und der Blick auf laufende Live-Sessions einer verknuepften
 *   Community. Alles andere gehoert nach oben.
 */

const connectionString = process.env.DATABASE_URL;

/**
 * Der Besitzerkontext wird AUFGESPANNT, nicht gesetzt.
 *
 * Das klingt nach Wortklauberei und ist der Kern: es gibt nur `withUserContext`
 * (intern `AsyncLocalStorage.run`) und keine Variante, die den Kontext
 * beilaeufig irgendwo hinterlaesst. Zwei naheliegende Abkuerzungen wurden hier
 * ausprobiert und sind beide gescheitert:
 *
 *   `als.enterWith(id)` in einer awaiteten Funktion — der Store ist beim
 *   Aufrufer danach wieder leer. Die Fortsetzung nach dem `await` laeuft in dem
 *   Kontext, der VOR dem Aufruf eingefangen wurde.
 *
 *   React `cache()` als anfrage-weite Ablage — funktioniert beim Rendern, aber
 *   in einer Server Action liefert derselbe Aufruf zwei verschiedene Objekte.
 *   Geschrieben wurde also in das eine, gelesen aus dem anderen.
 *
 * Beide Fehler sind heimtueckisch, weil RLS dann nicht etwa einen Fehler wirft,
 * sondern nur die veroeffentlichten Daten liefert: die Seite sieht richtig aus,
 * die Statistik steht auf null, und ein Speichern meldet „kein Datensatz
 * gefunden". Deshalb ist der Kontext jetzt an genau einer Stelle sichtbar — im
 * `withUserContext(...)`, das ihn umschliesst.
 */
const userALS = new AsyncLocalStorage<string>();

/**
 * Alles darin laeuft als dieser Nutzer. Aufrufer sind die Datenzugriffe in
 * lib/profile.ts, lib/analytics.ts und der `asOwner`-Helfer der Server Actions.
 */
export function withUserContext<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  // Innerhalb des Scopes awaiten: Prisma-Promises werden erst beim Await
  // ausgefuehrt und wuerden sonst ausserhalb des Kontexts landen.
  return userALS.run(userId, async () => await fn());
}

/** Leer heisst: oeffentlicher Lesepfad. Das ist ein gueltiger Zustand. */
export function currentUserContext(): string | undefined {
  return userALS.getStore();
}

function createBaseClient() {
  const adapter = new PrismaPg({ connectionString: connectionString! });
  return new PrismaClient({ adapter });
}

/**
 * `SET LOCAL` gilt bis zum Ende der Transaktion — beides muss deshalb in
 * dieselbe Transaktion wie die eigentliche Abfrage.
 */
async function enterAeliRole(tx: Prisma.TransactionClient, userId?: string): Promise<void> {
  await tx.$executeRawUnsafe("SET LOCAL ROLE aeli_app");
  if (userId) {
    await tx.$executeRaw`SELECT set_config('aeli.user_id', ${userId}, TRUE)`;
  }
}

function createClient(base: PrismaClient) {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const userId = currentUserContext();
          return base.$transaction(async (tx) => {
            await enterAeliRole(tx, userId);
            const delegateName = model.charAt(0).toLowerCase() + model.slice(1);
            const delegate = (
              tx as unknown as Record<string, Record<string, (value: unknown) => unknown>>
            )[delegateName];
            const method = delegate?.[operation];
            if (!method) {
              throw new Error(`Nicht unterstuetzte Prisma-Operation: ${model}.${operation}`);
            }
            return method.call(delegate, args);
          });
          // `query(args)` wird bewusst nie aufgerufen: es wuerde die Abfrage
          // ausserhalb der Transaktion und damit ausserhalb der Rolle
          // ausfuehren — genau die Luecke, die diese Erweiterung schliesst.
        },
      },
    },
  });
}

/** Mehrere Schreibvorgaenge atomar unter derselben Rolle und demselben GUC. */
export async function withAeliTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const userId = currentUserContext();
  return baseClient.$transaction(async (tx) => {
    await enterAeliRole(tx, userId);
    return fn(tx);
  });
}

/**
 * Rohes SQL unter der Aeli-Rolle. Die Client-Erweiterung greift nur bei
 * Modelloperationen; `$queryRaw` liefe sonst als Eigentuemer und damit an den
 * Policies vorbei. Die Analytics-Aggregation ist der einzige Aufrufer.
 */
export function queryAsAeliUser<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return withAeliTransaction(fn);
}

type ExtendedPrismaClient = ReturnType<typeof createClient>;

/**
 * Ueber `globalThis` laeuft ausschliesslich der BASIS-Client, also der
 * Verbindungspool. Der erweiterte Client wird bei jedem Modul-Laden neu
 * gebaut — und das ist wichtig, nicht nur billig:
 *
 * Die Erweiterung schliesst ueber `userALS`. Beim Hot Reload in der Entwicklung
 * bekommt das Modul ein neues `userALS`, ein zwischengespeicherter Client
 * haenge aber weiter am alten. Der Kontext wuerde dann in den einen Speicher
 * geschrieben und aus dem anderen gelesen — RLS liefert daraufhin nur die
 * oeffentliche Sicht, und jedes Speichern im Studio meldet „kein Datensatz
 * gefunden". Genau dieser Fehler hat hier einen Abend gekostet.
 */
const globalForPrisma = globalThis as unknown as { aeliPrismaBase?: PrismaClient };

const baseClient = globalForPrisma.aeliPrismaBase ?? createBaseClient();

export const systemPrisma = baseClient;
export const prisma: ExtendedPrismaClient = createClient(baseClient);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.aeliPrismaBase = baseClient;
}

export default prisma;
