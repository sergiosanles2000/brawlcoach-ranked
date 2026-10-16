export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'INFO' | 'CAPTURE' | 'API_REQ' | 'API_RES' | 'ERROR' | 'SUCCESS';
  title: string;
  details?: string;
  rawPayload?: any;
}

type LogListener = (logs: LogEntry[]) => void;

class AppLogger {
  private logs: LogEntry[] = [];
  private listeners: Set<LogListener> = new Set();
  private maxLogs = 100;

  private notify() {
    const copy = [...this.logs];
    this.listeners.forEach((listener) => listener(copy));
  }

  add(type: LogEntry['type'], title: string, details?: string, rawPayload?: any) {
    const entry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type,
      title,
      details,
      rawPayload,
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    console.log(`[${entry.type}] ${entry.title}`, details || '');
    this.notify();
  }

  log(title: string, details?: string, rawPayload?: any) {
    this.add('INFO', title, details, rawPayload);
  }

  info(title: string, details?: string, rawPayload?: any) {
    this.add('INFO', title, details, rawPayload);
  }

  error(title: string, details?: string, rawPayload?: any) {
    this.add('ERROR', title, details, rawPayload);
  }

  success(title: string, details?: string, rawPayload?: any) {
    this.add('SUCCESS', title, details, rawPayload);
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clear() {
    this.logs = [];
    this.notify();
  }

  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    listener([...this.logs]);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const logger = new AppLogger();
