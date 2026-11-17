/** Replaces the values of sensitive query params and strips the hash. */
export function redactUrl(raw: string, params: readonly string[], base?: string): string {
  try {
    const url = new URL(raw, base ?? (typeof location !== 'undefined' ? location.href : undefined));
    const sensitive = new Set(params.map((p) => p.toLowerCase()));
    for (const name of Array.from(url.searchParams.keys())) {
      if (sensitive.has(name.toLowerCase())) url.searchParams.set(name, 'REDACTED');
    }
    url.hash = '';
    return url.toString();
  } catch {
    return '[unparseable-url]';
  }
}

export function isRouteExcluded(route: string, excluded: readonly string[]): boolean {
  return excluded.some((ex) => route === ex || route.startsWith(ex.endsWith('/') ? ex : `${ex}/`));
}
