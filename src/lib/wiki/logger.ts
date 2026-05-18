import fs from 'fs';
import path from 'path';

/**
 * Operations that can be logged to the wiki operation log.
 */
export type LogOperation = 'ingest' | 'query' | 'lint' | 'create' | 'update' | 'delete' | 'migrate' | 'validate' | 'lock' | 'reject';

/**
 * A single entry in the wiki operation log.
 */
export interface LogEntry {
  date: string;
  operation: LogOperation;
  title: string;
  details?: string;
}

/**
 * Append a log entry to wikiRoot/log.md.
 * Creates log.md with a header if it does not yet exist.
 * The log is append-only — entries are never modified or deleted.
 */
export function appendLog(wikiRoot: string, operation: LogOperation, title: string, details?: string): void {
  const logPath = path.join(wikiRoot, 'log.md');
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const entry = `## [${date}] ${operation} | ${title}\n\n${details ? details + '\n\n' : ''}`;

  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, `# Wiki Operation Log\n\n<!-- Append-only log. Format: ## [YYYY-MM-DD] operation | Title -->\n\n`, 'utf-8');
  }

  fs.appendFileSync(logPath, entry, 'utf-8');
}

/**
 * Return the most recent `count` log entries (most recent first).
 */
export function getRecentLogs(wikiRoot: string, count: number = 5): LogEntry[] {
  const all = parseLog(wikiRoot);
  return all.slice(0, count);
}

/**
 * Parse all entries from wikiRoot/log.md.
 * Entries are returned in reverse chronological order (most recent first).
 */
export function parseLog(wikiRoot: string): LogEntry[] {
  const logPath = path.join(wikiRoot, 'log.md');
  if (!fs.existsSync(logPath)) return [];

  const content = fs.readFileSync(logPath, 'utf-8');
  const entries: LogEntry[] = [];

  // Parse entries matching: ## [YYYY-MM-DD] operation | Title
  const regex = /^## \[(\d{4}-\d{2}-\d{2})\] (\w+) \| (.+)$/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    entries.push({
      date: match[1],
      operation: match[2] as LogOperation,
      title: match[3].trim(),
    });
  }

  return entries;
}
