type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: any;
}

class Logger {
  private level: LogLevel;
  private format: "json" | "pretty";

  constructor() {
    this.level = (process.env.LOG_LEVEL as LogLevel) || "info";
    this.format = process.env.LOG_FORMAT === "pretty" ? "pretty" : "json";
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    const currentLevelIndex = levels.indexOf(this.level);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    context?: LogContext,
  ): string {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...context,
    };

    if (this.format === "json") {
      return JSON.stringify(logEntry);
    }

    // Pretty format for development
    const levelColors = {
      debug: "\x1b[36m", // Cyan
      info: "\x1b[32m", // Green
      warn: "\x1b[33m", // Yellow
      error: "\x1b[31m", // Red
    };
    const reset = "\x1b[0m";
    const color = levelColors[level];

    let prettyLog = `${color}[${timestamp}] ${level.toUpperCase()}${reset}: ${message}`;
    if (context && Object.keys(context).length > 0) {
      prettyLog += `\n${JSON.stringify(context, null, 2)}`;
    }
    return prettyLog;
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) return;

    const formatted = this.formatMessage(level, message, context);
    const output = level === "error" ? console.error : console.log;
    output(formatted);
  }

  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log("warn", message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log("error", message, context);
  }

  // Helper to mask sensitive data
  maskSensitive(data: any): any {
    if (typeof data !== "object" || !data) return data;

    const sensitiveKeys = ["token", "password", "secret", "private", "key"];
    const masked = { ...data };

    for (const [key, value] of Object.entries(masked)) {
      const lowerKey = key.toLowerCase();
      if (
        sensitiveKeys.some((k) => lowerKey.includes(k)) &&
        typeof value === "string"
      ) {
        masked[key] = value.substring(0, 4) + "****";
      } else if (typeof value === "object") {
        masked[key] = this.maskSensitive(value);
      }
    }

    return masked;
  }
}

export const logger = new Logger();
