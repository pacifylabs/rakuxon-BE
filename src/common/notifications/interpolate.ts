/**
 * Replaces every `{{token}}` in `template` with `context[token]`.
 *
 * A token missing from `context` is left as literal text — an admin who
 * typos `{{studnetName}}` gets a visibly broken preview instead of a
 * silently blank line, which is the failure mode that is actually easy to
 * spot and fix.
 */
export function interpolate(template: string, context: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, token: string) =>
    Object.prototype.hasOwnProperty.call(context, token) ? context[token] : match,
  );
}
