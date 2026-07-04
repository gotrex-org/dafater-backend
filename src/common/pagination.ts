export interface PageMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export interface PageQuery {
  page?: number;
  pageSize?: number;
  all?: string;
}

export function pageParams(q: PageQuery) {
  const all = q.all === 'true';
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 20));
  return { all, page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function buildPage<T>(data: T[], total: number, page: number, pageSize: number): Paginated<T> {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    data,
    meta: {
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Paginate any Prisma model delegate. `args` are the usual findMany args
 * (where / orderBy / include / select). `?all=true` returns the full list.
 */
export async function paginate<T>(
  model: { findMany: (args: any) => Promise<T[]>; count: (args: any) => Promise<number> },
  q: PageQuery,
  args: any = {},
): Promise<Paginated<T>> {
  const { all, page, pageSize, skip, take } = pageParams(q);
  if (all) {
    const data = await model.findMany(args);
    return buildPage(data, data.length, 1, Math.max(1, data.length));
  }
  const [data, total] = await Promise.all([
    model.findMany({ ...args, skip, take }),
    model.count({ where: args.where }),
  ]);
  return buildPage(data, total, page, pageSize);
}
