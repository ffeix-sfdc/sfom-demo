let logs = [];
let seq = 0;
const listeners = new Set();

export function addLog(entry) {
  const id = ++seq;
  const log = { id, ts: Date.now(), ...entry };
  if (entry.type === "preview") {
    logs = logs.filter((l) => l.type !== "preview");
  }
  logs = [...logs, log].slice(-300);
  listeners.forEach((fn) => fn(logs));
}

export function getLogs() {
  return logs;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearLogs() {
  logs = [];
  seq = 0;
  listeners.forEach((fn) => fn(logs));
}
