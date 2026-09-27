import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// 분류: 웹 편집기의 "분류" 메뉴에서 추가, 삭제, 순서 변경
const categories = defineCollection({
  loader: glob({ base: './src/content/categories', pattern: '**/*.md' }),
  schema: z.object({
    name: z.string(),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    order: z.number().default(100),
    description: z.string().default(''),
  }),
});

// 공략 글
const posts = defineCollection({
  loader: glob({ base: './src/content/posts', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    category: z.string(),
    summary: z.string().default(''),
    patch: z.string().default(''),
    updated: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    order: z.number().default(100),
    draft: z.boolean().default(false),
  }),
});

// 고정 페이지 (사이트 소개 등): 웹 편집기의 "사이트 소개" 메뉴에서 수정
const pages = defineCollection({
  loader: glob({ base: './src/content/pages', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
  }),
});

export const collections = { categories, posts, pages };
