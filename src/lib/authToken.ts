import { HttpError } from './errors.js';
import * as authService from '../services/authService.js';

export function accessTokenForUser(userId: string): string {
  try {
    return authService.signAuthToken(userId);
  } catch {
    throw new HttpError(500, 'Auth is misconfigured (set JWT_SECRET in the environment)');
  }
}
