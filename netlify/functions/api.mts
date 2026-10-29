import { purgeCache, type Config, type Context } from '@netlify/functions';
import { handleApi } from '../../server/api.ts';

export default async (req: Request, context: Context) =>
  handleApi(req, {
    ip: context.ip,
    purgeCatalog: () => purgeCache({ tags: ['catalog'] }),
  });

export const config: Config = {
  path: '/api/*',
};
