import { parse, stringify } from 'yaml';

export function parseDoc(text: string) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {} as Record<string, any>, body: text };
  return { data: (parse(m[1]) ?? {}) as Record<string, any>, body: m[2].trim() };
}

export function writeDoc(data: Record<string, unknown>, body = '') {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  return `---\n${stringify(clean).trim()}\n---\n${body ? '\n' + body.trim() + '\n' : ''}`;
}
