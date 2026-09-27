import postgres from 'postgres';

// 방문 통계 저장소: Vercel에서 연결한 Postgres(Neon)의 주소를 씁니다.
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

export const dbConfigured = () => Boolean(DB_URL);

let client: postgres.Sql | null = null;
let ready: Promise<unknown> | null = null;

export function sql() {
  if (!client) {
    client = postgres(DB_URL, { max: 1, idle_timeout: 20, connect_timeout: 10, prepare: false, onnotice: () => {} });
  }
  return client;
}

// 처음 쓸 때 표를 만듭니다.
export function ensureSchema() {
  ready ??= (async () => {
    const db = sql();
    await db`
      create table if not exists visits (
        id bigserial primary key,
        ts timestamptz not null default now(),
        pid text,
        path text not null,
        vid text not null,
        sid text not null,
        new_visitor boolean not null default false,
        new_session boolean not null default false,
        source text,
        ref_host text,
        keyword text,
        device text,
        browser text,
        os text,
        country text,
        dur integer
      )`;
    await db`create index if not exists visits_ts on visits (ts)`;
    await db`create index if not exists visits_pid on visits (pid)`;
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}
