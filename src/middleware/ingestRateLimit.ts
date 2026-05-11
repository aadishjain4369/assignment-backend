import rateLimit from 'express-rate-limit';

export const ingestRateLimit = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many webhook requests; try again later' },
});
