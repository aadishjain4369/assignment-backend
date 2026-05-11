export class HttpError extends Error {
  readonly status: number;
  readonly expose: boolean;

  constructor(status: number, message: string, expose = true) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.expose = expose;
  }
}

export function isHttpError(err: unknown): err is HttpError {
  return err instanceof HttpError;
}
