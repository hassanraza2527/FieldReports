import { LocalReport, ServerReport } from './types';

export type ListItem =
  | { source: 'server'; id: string; createdAt: number; report: ServerReport }
  | { source: 'local'; id: string; createdAt: number; report: LocalReport };

/** Server is the truth for what is uploaded. Local rows only show up while the server does not list them yet. */
export function mergeReports(local: LocalReport[], server: ServerReport[]): ListItem[] {
  const serverIds = new Set(server.map(s => s.id));
  const items: ListItem[] = [
    ...local
      .filter(l => !serverIds.has(l.id))
      .map(l => ({ source: 'local' as const, id: l.id, createdAt: l.createdAt, report: l })),
    ...server.map(s => ({ source: 'server' as const, id: s.id, createdAt: s.createdAt, report: s })),
  ];
  return items.sort((a, b) => b.createdAt - a.createdAt);
}
