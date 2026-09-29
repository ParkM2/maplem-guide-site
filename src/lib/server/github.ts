// GitHub 저장소에 글과 사진을 직접 저장합니다. 저장하면 Vercel이 사이트를 다시 만듭니다.
export const REPO = { owner: 'ParkM2', repo: 'maplem-guide-site', branch: process.env.GITHUB_BRANCH || 'main' };
export const POSTS_DIR = 'src/content/posts';
export const CATEGORIES_DIR = 'src/content/categories';
export const MEDIA_DIR = 'public/media';
export const ABOUT_FILE = 'src/content/pages/about.md';
export const KEYWORDS_FILE = 'src/data/keywords.json';

const API = `${process.env.GITHUB_API || 'https://api.github.com'}/repos/${REPO.owner}/${REPO.repo}`;

async function gh<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'maplem-guide-site-admin',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const decode = (b64: string) => Buffer.from(b64, 'base64').toString('utf8');

async function headCommit() {
  const ref = await gh(`/git/ref/heads/${REPO.branch}`);
  const commit = await gh(`/git/commits/${ref.object.sha}`);
  return { sha: ref.object.sha as string, tree: commit.tree.sha as string };
}

// 폴더 안의 .md 파일을 모두 읽습니다 (파일 수만큼 요청하지 않도록 트리를 한 번에 읽음).
export async function readDir(dir: string) {
  const head = await headCommit();
  const tree = await gh(`/git/trees/${head.tree}?recursive=1`);
  const entries = (tree.tree as any[]).filter(
    (e) => e.type === 'blob' && e.path.startsWith(dir + '/') && e.path.endsWith('.md') && !e.path.slice(dir.length + 1).includes('/'),
  );
  return Promise.all(
    entries.map(async (e) => {
      const blob = await gh(`/git/blobs/${e.sha}`);
      return { path: e.path as string, name: e.path.slice(dir.length + 1) as string, text: decode(blob.content) };
    }),
  );
}

export async function readFile(path: string) {
  const file = await gh(`/contents/${encodeURI(path)}?ref=${REPO.branch}`);
  return decode(file.content);
}

// 사진은 먼저 blob으로 올려 두고, 글을 저장할 때 한 번에 커밋합니다 (요청 크기 제한 때문).
export async function createBlob(base64: string) {
  const blob = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: base64, encoding: 'base64' }) });
  return blob.sha as string;
}

type Change =
  | { path: string; text: string }
  | { path: string; blobSha: string }
  | { path: string; delete: true };

export async function commit(message: string, changes: Change[]) {
  const head = await headCommit();
  const tree = await gh('/git/trees', {
    method: 'POST',
    body: JSON.stringify({
      base_tree: head.tree,
      tree: changes.map((c) =>
        'delete' in c
          ? { path: c.path, mode: '100644', type: 'blob', sha: null }
          : 'blobSha' in c
            ? { path: c.path, mode: '100644', type: 'blob', sha: c.blobSha }
            : { path: c.path, mode: '100644', type: 'blob', content: c.text },
      ),
    }),
  });
  const next = await gh('/git/commits', {
    method: 'POST',
    body: JSON.stringify({ message, tree: tree.sha, parents: [head.sha] }),
  });
  await gh(`/git/refs/heads/${REPO.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: next.sha }) });
  return next.sha as string;
}
