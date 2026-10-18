// Server-side logging: one line per record to stdout, in the same shape as the backend
// (backend/app/core/log.py) so both services can be read and searched together.
// LOG_FORMAT=json (default, servers) or text (local); LOG_LEVEL=DEBUG/INFO/WARNING/ERROR.
// Secrets never go into logs: no passwords, tokens, Authorization headers or request bodies.

export type LogLevel = "DEBUG" | "INFO" | "WARNING" | "ERROR";
export type LogFields = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = { DEBUG: 10, INFO: 20, WARNING: 30, ERROR: 40 };

function configuredLevel(): number {
  const level = (process.env.LOG_LEVEL ?? "INFO").toUpperCase() as LogLevel;
  return LEVEL_ORDER[level] ?? LEVEL_ORDER.INFO;
}

function formatText(level: LogLevel, logger: string, message: string, fields: LogFields): string {
  const stamp = new Date().toTimeString().slice(0, 8);
  const { request_id: requestId, ...rest } = fields;
  const parts = [stamp, level.padEnd(7), logger];
  if (requestId) parts.push(`[${requestId}]`);
  let line = `${parts.join(" ")} ${message}`;
  const extra = Object.entries(rest).filter(([, value]) => value !== undefined);
  if (extra.length > 0) {
    line += " " + extra.map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`).join(" ");
  }
  return line;
}

function write(level: LogLevel, logger: string, message: string, fields: LogFields = {}): void {
  if (LEVEL_ORDER[level] < configuredLevel()) return;
  const line =
    process.env.LOG_FORMAT === "text"
      ? formatText(level, logger, message, fields)
      : JSON.stringify({ ts: new Date().toISOString(), level, logger, message, ...fields });
  if (level === "ERROR") console.error(line);
  else console.log(line);
}

export function getLogger(name: string) {
  return {
    debug: (message: string, fields?: LogFields) => write("DEBUG", name, message, fields),
    info: (message: string, fields?: LogFields) => write("INFO", name, message, fields),
    warning: (message: string, fields?: LogFields) => write("WARNING", name, message, fields),
    error: (message: string, fields?: LogFields) => write("ERROR", name, message, fields),
    log: (level: LogLevel, message: string, fields?: LogFields) => write(level, name, message, fields),
  };
}

export function errorFields(error: unknown): LogFields {
  if (!(error instanceof Error)) return { error: String(error) };
  const cause = error.cause instanceof Error ? error.cause.message : undefined;
  return { error: error.message, error_type: error.name, cause };
}
