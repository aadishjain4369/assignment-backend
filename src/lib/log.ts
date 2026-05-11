type Fields = Record<string, unknown>;

function line(level: string, msg: string, fields: Fields): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...fields,
  };
  console.log(JSON.stringify(payload));
}

export function logInfo(msg: string, fields: Fields = {}): void {
  line('info', msg, fields);
}

export function logWarn(msg: string, fields: Fields = {}): void {
  line('warn', msg, fields);
}

export function logError(msg: string, fields: Fields = {}): void {
  line('error', msg, fields);
}
