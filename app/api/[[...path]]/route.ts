import { dispatch } from '../../../lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type Ctx = { params: Promise<{ path?: string[] }> };
const handle = async (req: Request, ctx: Ctx) => dispatch(req, (await ctx.params).path);

export const GET = handle;
export const POST = handle;
