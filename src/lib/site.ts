import { getCollection } from 'astro:content';

export const SITE_NAME = '메이플스토리M 공략노트';
export const SITE_DESC = '메이플스토리M 내실, 장비, 보스, 메소, 직업 공략을 간단하게 정리한 비공식 팬 사이트';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
export const url = (path = '/') => base + (path.startsWith('/') ? path : '/' + path);

export async function getCategories() {
  const list = await getCollection('categories');
  return list.map((c) => c.data).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ko'));
}

export async function getPosts() {
  const list = await getCollection('posts', (p) => !p.data.draft);
  return list.sort((a, b) => a.data.order - b.data.order || b.data.updated.valueOf() - a.data.updated.valueOf());
}

export const postUrl = (p: { data: { category: string; slug: string } }) => url(`/${p.data.category}/${p.data.slug}/`);

export const fmtDate = (d: Date) =>
  `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
