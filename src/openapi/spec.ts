import { authOpenApiPaths } from '../routes/auth.js';
import { webhooksOpenApiPaths } from '../routes/webhooks.js';

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Webhooks API',
    version: '1.0.0',
  },
  servers: [{ url: 'http://localhost:4000', description: 'Local' }],
  paths: {
    ...authOpenApiPaths,
    ...webhooksOpenApiPaths,
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http' as const,
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
};
