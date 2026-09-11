/**
 * The only hosts a destructive test helper may touch.
 *
 * One definition, used by both the truncate guard and global setup, so the two
 * can never disagree about what "local" means.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres', 'db']);

export function isLocalDatabaseUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}
