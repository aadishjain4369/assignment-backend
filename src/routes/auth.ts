import { Router } from 'express';

import * as auth from '../controllers/auth.js';

export const authRouter = Router();

authRouter.post('/register', auth.register);
authRouter.post('/login', auth.login);
