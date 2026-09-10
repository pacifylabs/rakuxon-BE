/** Stops the throwaway Postgres from global-setup.ts; `persistent: false` deletes its data. */
export default async function globalTeardown(): Promise<void> {
  const postgres = (globalThis as typeof globalThis & { __rakuxonPostgres?: { stop(): Promise<void> } })
    .__rakuxonPostgres;
  await postgres?.stop();
}
