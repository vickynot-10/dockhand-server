export type LogLevel = "error" | "warn" | "info" | "debug";

const ALIASES: Record<string, LogLevel> = {
  error: "error",
  err: "error",
  fatal: "error",
  critical: "error",
  crit: "error",
  panic: "error",
  severe: "error",
  warn: "warn",
  warning: "warn",
  info: "info",
  notice: "info",
  debug: "debug",
  trace: "debug",
  verbose: "debug",
};

const PREFIX_PATTERN =
  /^\W{0,3}(?:\d{4}-\d{2}-\d{2}[T ][\d:.,]+Z?\s+)?[\[(<]?(error|err|fatal|critical|crit|panic|warn|warning|info|notice|debug|trace|verbose)[\])>:]?(?:\s|$)/i;
const LOGFMT_PATTERN = /\blevel=["']?(\w+)/i;
const CONTINUATION_PATTERN =
  /^(\s+at\s|\s+File\s"|\s{2,}\S|Traceback|Caused by:)/;
const ERROR_NAME_PATTERN = /^[\w.]*(Error|Exception)\b/;

function fromNumber(value: number): LogLevel | null {
  if (value >= 50) return "error";
  if (value >= 40) return "warn";
  if (value >= 30) return "info";
  if (value >= 10) return "debug";
  return null;
}

function fromJson(message: string): LogLevel | null {
  if (message[0] !== "{") return null;
  try {
    const parsed = JSON.parse(message);
    const raw = parsed.level ?? parsed.severity ?? parsed.lvl;
    if (typeof raw === "number") return fromNumber(raw);
    if (typeof raw === "string") return ALIASES[raw.toLowerCase()] ?? null;
  } catch {
    return null;
  }
  return null;
}

export function detectLevel(
  message: string,
  previous: LogLevel | null,
): LogLevel | null {
  const jsonLevel = fromJson(message);
  if (jsonLevel) return jsonLevel;

  const logfmt = message.match(LOGFMT_PATTERN);
  if (logfmt) {
    const level = ALIASES[logfmt[1].toLowerCase()];
    if (level) return level;
  }

  const prefix = message.match(PREFIX_PATTERN);
  if (prefix) return ALIASES[prefix[1].toLowerCase()] ?? null;

  if (CONTINUATION_PATTERN.test(message)) return previous;
  if (ERROR_NAME_PATTERN.test(message)) return "error";

  return null;
}
