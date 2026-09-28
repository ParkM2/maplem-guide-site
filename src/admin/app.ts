// 글쓰기 화면: 로그인, 글 목록, 편집기, 분류 관리
import { Editor, Extension, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, FontSize, Color, BackgroundColor } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import { TableKit, TableCell, TableHeader } from '@tiptap/extension-table';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import { Placeholder } from '@tiptap/extensions';
import { openImageEditor } from './image-editor';
import { loadStats } from './stats';

// 예전에 마크다운으로 쓴 글은 HTML로 바꿔서 편집기에 넣습니다 (사이트와 같은 모양).
function toHtml(body: string) {
  const t = (body || '').trim();
  if (!t || t.startsWith('<')) return t;
  return micromark(t, { allowDangerousHtml: true, extensions: [gfm()], htmlExtensions: [gfmHtml()] });
}

// 표 칸 배경색: style로 저장해서 사이트에서도 그대로 보이게 합니다.
const cellBg = {
  backgroundColor: {
    default: null,
    parseHTML: (el: HTMLElement) => el.style.backgroundColor || null,
    renderHTML: (attrs: Record<string, any>) => (attrs.backgroundColor ? { style: `background-color: ${attrs.backgroundColor}` } : {}),
  },
};
const ColorCell = TableCell.extend({ addAttributes() { return { ...this.parent?.(), ...cellBg }; } });
const ColorHeader = TableHeader.extend({ addAttributes() { return { ...this.parent?.(), ...cellBg }; } });
const CELL_BGS = ['', 'rgba(250, 82, 82, 0.22)', 'rgba(253, 126, 20, 0.22)', 'rgba(250, 176, 5, 0.25)', 'rgba(64, 192, 87, 0.22)', 'rgba(34, 139, 230, 0.22)', 'rgba(121, 80, 242, 0.22)', 'rgba(134, 142, 150, 0.25)'];

// 사진: 크기(%)와 정렬을 style로 저장해서 사이트에서도 그대로 보이게 합니다.
const SizedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => (el.style.width?.endsWith('%') ? el.style.width : null),
        renderHTML: () => ({}),
      },
      align: { default: null, parseHTML: (el) => el.getAttribute('data-align'), renderHTML: () => ({}) },
    };
  },
  renderHTML({ node, HTMLAttributes }) {
    const { width, align } = node.attrs;
    let style = width ? `width: ${width};` : '';
    if (align === 'center') style += ' margin-left: auto; margin-right: auto;';
    if (align === 'right') style += ' margin-left: auto; margin-right: 0;';
    return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { style: style.trim() || null, 'data-align': align })];
  },
});

// 줄 간격, 문단 간격(문단 아래), 글자 간격
const Spacing = Extension.create({
  name: 'spacing',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el) => el.style.lineHeight || null,
            renderHTML: (a) => (a.lineHeight ? { style: `line-height: ${a.lineHeight}` } : {}),
          },
          spaceAfter: {
            default: null,
            parseHTML: (el) => el.style.marginBottom || null,
            renderHTML: (a) => (a.spaceAfter ? { style: `margin-bottom: ${a.spaceAfter}` } : {}),
          },
        },
      },
      {
        types: ['textStyle'],
        attributes: {
          letterSpacing: {
            default: null,
            parseHTML: (el) => el.style.letterSpacing || null,
            renderHTML: (a) => (a.letterSpacing ? { style: `letter-spacing: ${a.letterSpacing}` } : {}),
          },
        },
      },
    ];
  },
});

type Category = { file?: string; name: string; slug: string; description?: string; order?: number };
type PostMeta = { file: string; data: Record<string, any> };

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const views = ['loading', 'login', 'setup', 'list', 'categories', 'stats', 'editor'] as const;
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

let categories: Category[] = [];
let posts: PostMeta[] = [];
let editor: Editor | null = null;
let current: { file: string | null; about?: boolean } = { file: null };
let dirty = false;

// ---------- 공통 ----------
function show(view: (typeof views)[number]) {
  for (const v of views) $(`#view-${v}`).hidden = v !== view;
  $('#wr-nav').hidden = view === 'login' || view === 'setup';
}

let toastTimer = 0;
function toast(msg: string, error = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('error', error);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.hidden = true), error ? 6000 : 3500);
}

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(path, {
    ...init,
    headers: init.body ? { 'content-type': 'application/json' } : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    show('login');
    throw new Error(data.error || '다시 로그인해 주세요.');
  }
  if (!res.ok) throw new Error(data.error || `오류가 났어요 (${res.status})`);
  return data;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// ---------- 로그인 ----------
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ password: $<HTMLInputElement>('#password').value }) });
    $<HTMLInputElement>('#password').value = '';
    // 2단계: Google 로그인 화면으로
    if (r.next) return void (location.href = r.next);
    await loadAll();
    route();
  } catch (err) {
    toast((err as Error).message, true);
  }
});

$('#logout').addEventListener('click', async () => {
  await fetch('/api/login', { method: 'DELETE' });
  show('login');
});

// ---------- 목록 ----------
async function loadAll() {
  const data = await api('/api/posts');
  posts = data.posts;
  categories = (data.categories as Category[]).sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

const catName = (slug: string) => categories.find((c) => c.slug === slug)?.name ?? `(없는 분류: ${slug})`;

function renderList() {
  const sel = $<HTMLSelectElement>('#filter-cat');
  const keep = sel.value;
  sel.innerHTML = `<option value="">전체 분류</option>` + categories.map((c) => `<option value="${esc(c.slug)}">${esc(c.name)}</option>`).join('');
  sel.value = keep;
  const shown = posts
    .filter((p) => !sel.value || p.data.category === sel.value)
    .sort((a, b) => String(b.data.updated ?? '').localeCompare(String(a.data.updated ?? '')));
  $('#post-list').innerHTML = shown.length
    ? shown
        .map(
          (p) => `<li><a href="#edit/${encodeURIComponent(p.file)}">
            <span><b>${esc(p.data.title)}</b>${p.data.draft ? '<span class="badge">임시 저장</span>' : ''}</span>
            <span class="meta">${esc(catName(p.data.category))} · ${esc(p.data.updated)}</span></a></li>`,
        )
        .join('')
    : `<li class="hint" style="padding:16px 4px">아직 글이 없어요. 새 글 쓰기를 눌러 시작하세요.</li>`;
}
$('#filter-cat').addEventListener('change', renderList);

// ---------- 분류 관리 ----------
let catDraft: Category[] = [];
function renderCats() {
  const count = (slug: string) => posts.filter((p) => p.data.category === slug).length;
  $('#cat-rows').innerHTML = catDraft
    .map(
      (c, i) => `<div class="cat-row" data-i="${i}">
        <input aria-label="분류 이름" data-k="name" value="${esc(c.name)}" placeholder="이름 (예: 내실)" />
        <input aria-label="주소" data-k="slug" value="${esc(c.slug)}" placeholder="주소 (예: naesil)" ${c.file ? 'readonly title="글이 연결돼 있어서 주소는 바꿀 수 없어요"' : ''} />
        <input aria-label="설명" class="desc" data-k="description" value="${esc(c.description)}" placeholder="설명 (선택)" />
        <div class="ops">
          <button type="button" data-op="up" title="위로" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" data-op="down" title="아래로" ${i === catDraft.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" data-op="del" class="danger" title="삭제">삭제${c.slug && count(c.slug) ? ` (글 ${count(c.slug)})` : ''}</button>
        </div></div>`,
    )
    .join('');
}
$('#cat-rows').addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  const i = Number(el.closest<HTMLElement>('.cat-row')!.dataset.i);
  (catDraft[i] as any)[el.dataset.k!] = el.value;
});
$('#cat-rows').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-op]');
  if (!btn) return;
  const i = Number(btn.closest<HTMLElement>('.cat-row')!.dataset.i);
  const op = btn.dataset.op;
  if (op === 'up') [catDraft[i - 1], catDraft[i]] = [catDraft[i], catDraft[i - 1]];
  if (op === 'down') [catDraft[i + 1], catDraft[i]] = [catDraft[i], catDraft[i + 1]];
  if (op === 'del') {
    const n = posts.filter((p) => p.data.category === catDraft[i].slug).length;
    if (n && btn.dataset.confirm !== '1') {
      btn.dataset.confirm = '1';
      btn.textContent = `글 ${n}개가 안 보이게 돼요. 한 번 더 누르면 삭제`;
      return;
    }
    catDraft.splice(i, 1);
  }
  renderCats();
});
$('#cat-add').addEventListener('click', () => {
  catDraft.push({ name: '', slug: '', description: '' });
  renderCats();
  ($('#cat-rows').lastElementChild?.querySelector('input') as HTMLInputElement | null)?.focus();
});
$('#cat-save').addEventListener('click', async () => {
  const btn = $<HTMLButtonElement>('#cat-save');
  btn.disabled = true;
  try {
    await api('/api/categories', { method: 'POST', body: JSON.stringify({ categories: catDraft }) });
    toast('분류를 저장했어요. 1~2분 뒤 사이트 메뉴에 반영돼요.');
    await loadAll();
    catDraft = categories.map((c) => ({ ...c }));
    renderCats();
  } catch (err) {
    toast((err as Error).message, true);
  } finally {
    btn.disabled = false;
  }
});

// ---------- 편집기 ----------
const COLORS = ['#000000', '#495057', '#868e96', '#c92a2a', '#e8590c', '#f08c00', '#2b8a3e', '#1971c2', '#5f3dc4', '#c2255c', '#0c8599', '#ffffff'];
const BGS = ['#fff3bf', '#ffe8cc', '#ffe3e3', '#d3f9d8', '#d0ebff', '#e5dbff', '#f1f3f5', '#ffec99', '#c3fae8', '#fcc2d7', '#dee2e6', '#212529'];

function buildPalette(id: string, colors: string[], apply: (c: string | null) => void) {
  const panel = $(`#pop-${id}`);
  panel.innerHTML =
    colors.map((c) => `<button type="button" class="sw" data-c="${c}" style="background:${c}" title="${c}"></button>`).join('') +
    `<label class="custom">직접 고르기 <input type="color" value="#1971c2" /></label>` +
    `<button type="button" class="none" data-c="">${id === 'color' ? '기본 색으로' : '배경 없애기'}</button>`;
  panel.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-c]');
    if (!b) return;
    apply(b.dataset.c || null);
    panel.hidden = true;
  });
  panel.querySelector('input')!.addEventListener('change', (e) => {
    apply((e.target as HTMLInputElement).value);
    panel.hidden = true;
  });
}

function makeEditor() {
  editor = new Editor({
    element: $('#editor'),
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true } }),
      TextStyle,
      FontSize,
      Color,
      BackgroundColor,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      SizedImage.configure({ allowBase64: true }),
      Spacing,
      TableKit.configure({ table: { resizable: true, cellMinWidth: 48 }, tableCell: false, tableHeader: false }),
      ColorCell,
      ColorHeader,
      Placeholder.configure({ placeholder: '본문을 입력하세요. 사진은 끌어다 놓거나 붙여넣어도 돼요.' }),
    ],
    editorProps: {
      handleDrop: (_view, event) => {
        const files = [...(event.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault();
        insertImages(files);
        return true;
      },
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        insertImages(files);
        return true;
      },
    },
    onUpdate: () => {
      dirty = true;
      updateToc();
    },
    onTransaction: updateToolbar,
  });

  buildPalette('color', COLORS, (c) => (c ? editor!.chain().focus().setColor(c).run() : editor!.chain().focus().unsetColor().run()));
  const cellRow = $('#cell-bgs');
  for (const c of CELL_BGS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sw' + (c ? '' : ' none');
    b.title = c ? '칸 색' : '색 없음';
    if (c) b.style.background = c;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => editor!.chain().focus().setCellAttribute('backgroundColor', c || null).run());
    cellRow.append(b);
  }
  buildPalette('bg', BGS, (c) =>
    c ? editor!.chain().focus().setBackgroundColor(c).run() : editor!.chain().focus().unsetBackgroundColor().run(),
  );
}

const commands: Record<string, () => void> = {
  image: () => $<HTMLInputElement>('#image-input').click(),
  quote: () => editor!.chain().focus().toggleBlockquote().run(),
  hr: () => editor!.chain().focus().setHorizontalRule().run(),
  table: () => editor!.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  link: () => {
    if (editor!.state.selection.empty && !editor!.isActive('link')) return toast('링크를 걸 글자를 먼저 드래그해서 골라 주세요.', true);
    const prev = editor!.getAttributes('link').href ?? '';
    const input = window.prompt ? window.prompt('링크 주소 (웹 주소, 이메일, 전화번호 가능 · 비우면 링크 해제)', prev) : null;
    if (input === null) return;
    if (!input) editor!.chain().focus().unsetLink().run();
    else editor!.chain().focus().extendMarkRange('link').setLink({ href: linkHref(input) }).run();
  },
  bold: () => editor!.chain().focus().toggleBold().run(),
  italic: () => editor!.chain().focus().toggleItalic().run(),
  underline: () => editor!.chain().focus().toggleUnderline().run(),
  strike: () => editor!.chain().focus().toggleStrike().run(),
  'align-left': () => editor!.chain().focus().setTextAlign('left').run(),
  'align-center': () => editor!.chain().focus().setTextAlign('center').run(),
  'align-right': () => editor!.chain().focus().setTextAlign('right').run(),
  'align-justify': () => editor!.chain().focus().setTextAlign('justify').run(),
  bullet: () => editor!.chain().focus().toggleBulletList().run(),
  ordered: () => editor!.chain().focus().toggleOrderedList().run(),
  undo: () => editor!.chain().focus().undo().run(),
  redo: () => editor!.chain().focus().redo().run(),
  clear: () => editor!.chain().focus().unsetAllMarks().unsetTextAlign().run(),
  'row-add': () => editor!.chain().focus().addRowAfter().run(),
  'col-add': () => editor!.chain().focus().addColumnAfter().run(),
  'row-del': () => editor!.chain().focus().deleteRow().run(),
  'col-del': () => editor!.chain().focus().deleteColumn().run(),
  'row-add-above': () => editor!.chain().focus().addRowBefore().run(),
  'col-add-left': () => editor!.chain().focus().addColumnBefore().run(),
  'cell-merge': () => editor!.chain().focus().mergeOrSplit().run(),
  'head-row': () => editor!.chain().focus().toggleHeaderRow().run(),
  'table-del': () => editor!.chain().focus().deleteTable().run(),
  'img-w25': () => setImage({ width: '25%' }),
  'img-w50': () => setImage({ width: '50%' }),
  'img-w75': () => setImage({ width: '75%' }),
  'img-w100': () => setImage({ width: null }),
  'img-left': () => setImage({ align: null }),
  'img-center': () => setImage({ align: 'center' }),
  'img-right': () => setImage({ align: 'right' }),
  'img-alt': () => {
    const alt = window.prompt('사진 설명 (사진이 안 보일 때와 검색에 쓰여요)', editor!.getAttributes('image').alt ?? '');
    if (alt !== null) setImage({ alt: alt.trim() || null });
  },
  'img-del': () => editor!.chain().focus().deleteSelection().run(),
  'img-edit': async () => {
    const { src } = editor!.getAttributes('image');
    if (!src) return;
    const pos = editor!.state.selection.from;
    try {
      const edited = await openImageEditor(src);
      if (edited) editor!.chain().focus().setNodeSelection(pos).updateAttributes('image', { src: edited }).run();
    } catch (err) {
      toast((err as Error).message, true);
    }
  },
};

function setImage(attrs: Record<string, unknown>) {
  editor!.chain().focus().updateAttributes('image', attrs).run();
}

// 줄 간격과 문단 간격은 고른 문단 전체에, 글자 간격은 고른 글자에 적용합니다.
function setBlock(attrs: Record<string, unknown>) {
  editor!.chain().focus().updateAttributes('paragraph', attrs).updateAttributes('heading', attrs).run();
}
$<HTMLSelectElement>('#sp-line').addEventListener('change', (e) => setBlock({ lineHeight: (e.target as HTMLSelectElement).value || null }));
$<HTMLSelectElement>('#sp-para').addEventListener('change', (e) => setBlock({ spaceAfter: (e.target as HTMLSelectElement).value || null }));
$<HTMLSelectElement>('#sp-letter').addEventListener('change', (e) => {
  const v = (e.target as HTMLSelectElement).value || null;
  editor!.chain().focus().setMark('textStyle', { letterSpacing: v }).removeEmptyTextStyle().run();
});
$<HTMLInputElement>('#img-range').addEventListener('input', (e) => {
  const v = Number((e.target as HTMLInputElement).value);
  setImage({ width: v >= 100 ? null : `${v}%` });
});

// 도구 버튼을 눌러도 본문 선택 영역이 풀리지 않게 합니다.
document.querySelector('.ed-toolbar')!.addEventListener('mousedown', (e) => {
  const el = e.target as HTMLElement;
  if (el.closest('button') && !el.closest('.pop-panel .custom')) e.preventDefault();
});
document.querySelector('.ed-toolbar')!.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!btn || !editor) return;
  if (btn.dataset.cmd) commands[btn.dataset.cmd]?.();
  if (btn.dataset.pop) {
    const panel = $(`#pop-${btn.dataset.pop}`);
    const open = panel.hidden;
    document.querySelectorAll<HTMLElement>('.pop-panel').forEach((p) => (p.hidden = true));
    panel.hidden = !open;
  }
});
document.addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('.pop')) document.querySelectorAll<HTMLElement>('.pop-panel').forEach((p) => (p.hidden = true));
});

// 사이트처럼 소제목(제목 2, 제목 3)으로 목차를 미리 보여 줍니다. 소제목이 2개 이상일 때만 사이트에 나와요.
function updateToc() {
  const box = $('#ed-toc');
  const heads = [...document.querySelectorAll<HTMLElement>('#editor .ProseMirror > h2, #editor .ProseMirror > h3')].filter((h) => h.textContent!.trim());
  box.hidden = heads.length < 2;
  const ol = box.querySelector('ol')!;
  ol.replaceChildren(
    ...heads.map((h) => {
      const li = document.createElement('li');
      li.className = h.tagName === 'H3' ? 'd3' : 'd2';
      const a = document.createElement('a');
      a.href = '#';
      a.textContent = h.textContent!.trim();
      a.addEventListener('click', (e) => {
        e.preventDefault();
        h.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      li.append(a);
      return li;
    }),
  );
}

$<HTMLSelectElement>('#tb-block').addEventListener('change', (e) => {
  const v = (e.target as HTMLSelectElement).value;
  if (v === 'p') editor!.chain().focus().setParagraph().run();
  else editor!.chain().focus().setHeading({ level: v === 'h2' ? 2 : 3 }).run();
});
$<HTMLSelectElement>('#tb-size').addEventListener('change', (e) => {
  const v = (e.target as HTMLSelectElement).value;
  if (v) editor!.chain().focus().setFontSize(`${v}px`).run();
  else editor!.chain().focus().unsetFontSize().run();
});

function updateToolbar() {
  if (!editor) return;
  const on = (cmd: string, active: boolean) => document.querySelector(`[data-cmd="${cmd}"]`)?.classList.toggle('on', active);
  on('bold', editor.isActive('bold'));
  on('italic', editor.isActive('italic'));
  on('underline', editor.isActive('underline'));
  on('strike', editor.isActive('strike'));
  on('quote', editor.isActive('blockquote'));
  on('bullet', editor.isActive('bulletList'));
  on('ordered', editor.isActive('orderedList'));
  on('link', editor.isActive('link'));
  for (const a of ['left', 'center', 'right', 'justify']) on(`align-${a}`, editor.isActive({ textAlign: a }));
  $<HTMLSelectElement>('#tb-block').value = editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'p';
  const size = String(editor.getAttributes('textStyle').fontSize ?? '').replace('px', '');
  $<HTMLSelectElement>('#tb-size').value = [...$<HTMLSelectElement>('#tb-size').options].some((o) => o.value === size) ? size : '';
  $('#color-mark').style.setProperty('--sw', editor.getAttributes('textStyle').color || '#e03131');
  $('#bg-mark').style.setProperty('--sw', editor.getAttributes('textStyle').backgroundColor || '#fff3bf');
  $('#tb-table').hidden = !editor.isActive('table');
  const isImg = editor.isActive('image');
  $('#tb-image').hidden = !isImg;
  if (isImg) {
    const { width, align } = editor.getAttributes('image');
    const w = width ? parseInt(width, 10) : 100;
    $<HTMLInputElement>('#img-range').value = String(w);
    $('#img-size').textContent = `${w}%`;
    for (const n of [25, 50, 75, 100]) on(`img-w${n}`, w === n);
    on('img-left', !align);
    on('img-center', align === 'center');
    on('img-right', align === 'right');
  }
  const block = editor.isActive('heading') ? editor.getAttributes('heading') : editor.getAttributes('paragraph');
  const pick = (id: string, v: unknown) => {
    const sel = $<HTMLSelectElement>(id);
    sel.value = [...sel.options].some((o) => o.value === v) ? String(v) : '';
  };
  pick('#sp-line', block.lineHeight ?? '');
  pick('#sp-para', block.spaceAfter ?? '');
  pick('#sp-letter', editor.getAttributes('textStyle').letterSpacing ?? '');
}

// 사진: 가로 1600px 이하 WebP로 줄여서 넣습니다. 저장할 때 서버로 올립니다.
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / img.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const webp = canvas.toDataURL('image/webp', 0.85);
      resolve(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('사진을 열 수 없어요.'));
    img.src = url;
  });
}

async function insertImages(files: File[]) {
  for (const f of files) {
    try {
      const src = await shrink(f);
      // 사진 다음에 빈 줄을 두어 이어서 글을 쓰거나 다른 것을 넣어도 사진이 지워지지 않게 합니다.
      editor!.chain().focus().insertContent([
        { type: 'image', attrs: { src, alt: f.name.replace(/\.[^.]+$/, '') } },
        { type: 'paragraph' },
      ]).run();
    } catch (err) {
      toast((err as Error).message, true);
    }
  }
}
$<HTMLInputElement>('#image-input').addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  insertImages([...(input.files ?? [])]);
  input.value = '';
});

function fillCategorySelect(selected?: string) {
  $('#m-category').innerHTML = categories.map((c) => `<option value="${esc(c.slug)}">${esc(c.name)}</option>`).join('');
  if (selected) $<HTMLSelectElement>('#m-category').value = selected;
}

async function openEditor(file: string | null) {
  if (!editor) makeEditor();
  show('editor');
  current = { file };
  fillCategorySelect();
  const set = (id: string, v: unknown) => ($<HTMLInputElement>(id).value = v == null ? '' : String(v));
  $('#ed-delete').hidden = !file;
  $('#ed-meta').hidden = false;
  if (!file) {
    const stamp = today().replace(/-/g, '');
    set('#ed-title', '');
    set('#m-slug', `post-${stamp}-${Math.random().toString(36).slice(2, 5)}`);
    set('#m-summary', '');
    set('#m-patch', '');
    set('#m-updated', today());
    set('#m-tags', '');
    set('#m-order', 100);
    $<HTMLInputElement>('#m-draft').checked = false;
    ($('#ed-meta') as HTMLDetailsElement).open = true;
    editor!.commands.setContent('');
    $('#ed-state').textContent = '새 글';
  } else {
    $('#ed-state').textContent = '불러오는 중…';
    editor!.commands.setContent('');
    try {
      const { data, body } = await api(`/api/posts?file=${encodeURIComponent(file)}`);
      set('#ed-title', data.title);
      set('#m-slug', data.slug);
      fillCategorySelect(data.category);
      set('#m-summary', data.summary);
      set('#m-patch', data.patch);
      set('#m-updated', data.updated);
      set('#m-tags', (data.tags ?? []).join(', '));
      set('#m-order', data.order ?? 100);
      $<HTMLInputElement>('#m-draft').checked = Boolean(data.draft);
      ($('#ed-meta') as HTMLDetailsElement).open = false;
      editor!.commands.setContent(toHtml(body));
      $('#ed-state').textContent = '';
    } catch (err) {
      toast((err as Error).message, true);
    }
  }
  dirty = false;
  updateToc();
  $<HTMLInputElement>('#ed-title').focus();
}

// 사이트 소개: 글과 같은 편집기를 쓰고, 글 정보와 삭제 버튼만 숨깁니다.
async function openAbout() {
  if (!editor) makeEditor();
  show('editor');
  current = { file: null, about: true };
  $('#ed-delete').hidden = true;
  $('#ed-meta').hidden = true;
  $('#ed-state').textContent = '불러오는 중…';
  editor!.commands.setContent('');
  try {
    const { data, body } = await api('/api/about');
    $<HTMLInputElement>('#ed-title').value = data.title ?? '사이트 소개';
    editor!.commands.setContent(toHtml(body));
    $('#ed-state').textContent = '사이트 소개';
  } catch (err) {
    $('#ed-state').textContent = '';
    toast((err as Error).message, true);
  }
  dirty = false;
  updateToc();
}

$('#ed-title').addEventListener('input', () => (dirty = true));
$('#ed-meta').addEventListener('input', () => (dirty = true));

$('#ed-save').addEventListener('click', async () => {
  if (!editor) return;
  const btn = $<HTMLButtonElement>('#ed-save');
  const val = (id: string) => $<HTMLInputElement>(id).value.trim();
  const about = Boolean(current.about);
  const slug = about ? 'about' : val('#m-slug');
  if (!val('#ed-title')) return toast('제목을 적어 주세요.', true);
  if (!about && !/^[a-z0-9-]+$/.test(slug)) {
    ($('#ed-meta') as HTMLDetailsElement).open = true;
    $<HTMLInputElement>('#m-slug').focus();
    return toast('주소는 영문 소문자, 숫자, 하이픈(-)만 쓸 수 있어요.', true);
  }
  btn.disabled = true;
  try {
    // 본문 속 새 사진을 먼저 올리고, 주소를 /media/... 로 바꿉니다.
    const doc = new DOMParser().parseFromString(`<body>${editor.getHTML()}</body>`, 'text/html');
    const images: { name: string; sha: string }[] = [];
    const pending = [...doc.querySelectorAll('img')].filter((i) => i.src.startsWith('data:'));
    let n = 0;
    for (const img of pending) {
      $('#ed-state').textContent = `사진 올리는 중 ${++n}/${pending.length}`;
      const { sha, ext } = await api('/api/upload', { method: 'POST', body: JSON.stringify({ data: img.getAttribute('src') }) });
      const name = `${slug}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      images.push({ name, sha });
      img.setAttribute('src', `/media/${name}`);
    }
    $('#ed-state').textContent = '저장하는 중…';
    const body = doc.body.innerHTML;
    if (about) {
      await api('/api/about', { method: 'POST', body: JSON.stringify({ title: val('#ed-title'), body, images }) });
      dirty = false;
      $('#ed-state').textContent = '';
      toast('사이트 소개를 저장했어요. 1~2분 뒤 사이트에 반영돼요.');
      location.hash = returnTo;
      return;
    }
    const res = await api('/api/posts', {
      method: 'POST',
      body: JSON.stringify({
        originalFile: current.file,
        images,
        body,
        data: {
          title: val('#ed-title'),
          slug,
          category: $<HTMLSelectElement>('#m-category').value,
          summary: val('#m-summary'),
          patch: val('#m-patch'),
          updated: val('#m-updated') || today(),
          tags: val('#m-tags').split(',').map((t) => t.trim()).filter(Boolean),
          order: Number(val('#m-order') || 100),
          draft: $<HTMLInputElement>('#m-draft').checked,
        },
      }),
    });
    current.file = res.file;
    dirty = false;
    $('#ed-state').textContent = '목록 새로 고치는 중…';
    await loadAll().catch(() => {});
    $('#ed-state').textContent = '';
    toast('저장했어요. 1~2분 뒤 사이트에 반영돼요.');
    // 저장하면 편집기에 들어오기 전 화면으로 돌아갑니다.
    location.hash = returnTo;
  } catch (err) {
    $('#ed-state').textContent = '';
    toast((err as Error).message, true);
  } finally {
    btn.disabled = false;
  }
});

$('#ed-delete').addEventListener('click', async () => {
  const btn = $<HTMLButtonElement>('#ed-delete');
  if (!current.file) return;
  if (btn.dataset.confirm !== '1') {
    btn.dataset.confirm = '1';
    btn.textContent = '정말 삭제할까요? 한 번 더 누르세요';
    setTimeout(() => {
      btn.dataset.confirm = '';
      btn.textContent = '삭제';
    }, 4000);
    return;
  }
  btn.disabled = true;
  try {
    await api(`/api/posts?file=${encodeURIComponent(current.file)}`, { method: 'DELETE' });
    toast('글을 삭제했어요.');
    dirty = false;
    await loadAll();
    location.hash = '#list';
  } catch (err) {
    toast((err as Error).message, true);
  } finally {
    btn.disabled = false;
    btn.dataset.confirm = '';
    btn.textContent = '삭제';
  }
});

window.addEventListener('beforeunload', (e) => {
  if (dirty) e.preventDefault();
});

// 링크 주소 정리: 이메일은 mailto:, 전화번호는 tel:, 도메인만 적으면 https:// 를 붙입니다.
function linkHref(raw: string) {
  const v = raw.trim();
  if (/^(https?:|mailto:|tel:|sms:|\/|#)/i.test(v)) return v;
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(v)) return `mailto:${v}`;
  if (/^\+?[\d\s-]{7,}$/.test(v)) return `tel:${v.replace(/[\s-]/g, '')}`;
  return `https://${v}`;
}

// ---------- 화면 이동 ----------
// 편집기에 들어오기 전 화면 (저장 후 돌아갈 곳)
let returnTo = '#list';
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h !== 'new' && h !== 'about' && !h.startsWith('edit/')) returnTo = `#${h || 'list'}`;
  if (h === 'new') return openEditor(null);
  if (h.startsWith('edit/')) return openEditor(h.slice(5));
  if (h === 'about') return openAbout();
  if (h === 'stats') {
    show('stats');
    return loadStats(api);
  }
  if (h === 'categories') {
    catDraft = categories.map((c) => ({ ...c }));
    renderCats();
    return show('categories');
  }
  renderList();
  show('list');
}
window.addEventListener('hashchange', () => {
  if (dirty && !$('#view-editor').hidden && !location.hash.startsWith('#edit/') && location.hash !== '#about') {
    // 저장하지 않은 글이 있으면 알려 줍니다 (내용은 그대로 남아 있음)
    toast('저장하지 않은 내용이 있어요. 글쓰기 화면으로 돌아가 저장해 주세요.', true);
  }
  route();
});

(window as any).__adminReady = true;
(async function boot() {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    const s = await (await fetch('/api/login', { signal: ctl.signal, cache: 'no-store' })).json();
    clearTimeout(timer);
    const g = new URLSearchParams(location.search).get('g');
    if (g) {
      history.replaceState(null, '', location.pathname + location.hash);
      const msg: Record<string, string> = {
        denied: '허용한 Google 계정이 아니에요. 관리자 계정으로 다시 로그인해 주세요.',
        expired: '로그인 시간이 지났어요. 비밀번호부터 다시 입력해 주세요.',
        cancel: 'Google 로그인을 취소했어요.',
        fail: 'Google 로그인에 실패했어요. 잠시 뒤 다시 해 주세요.',
        badid: 'Vercel의 GOOGLE_CLIENT_ID 값이 클라이언트 ID 모양(….apps.googleusercontent.com)이 아니에요. 값을 다시 확인해 주세요.',
      };
      toast(msg[g] ?? msg.fail, true);
    }
    $('#twostep-off').hidden = s.twoStep !== false;
    if (!s.configured) return show('setup');
    if (!s.loggedIn) return show('login');
    await loadAll();
    route();
  } catch {
    show('login');
    toast('서버 연결이 느려요. 잠시 뒤 새로고침해 주세요.', true);
  }
})();
