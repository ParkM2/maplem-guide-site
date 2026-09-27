// 글쓰기 화면: 로그인, 글 목록, 편집기, 분류 관리
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, FontSize, Color, BackgroundColor } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';

type Category = { file?: string; name: string; slug: string; description?: string; order?: number };
type PostMeta = { file: string; data: Record<string, any> };

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const views = ['loading', 'login', 'setup', 'list', 'categories', 'editor'] as const;
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

let categories: Category[] = [];
let posts: PostMeta[] = [];
let editor: Editor | null = null;
let current: { file: string | null } = { file: null };
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
    await api('/api/login', { method: 'POST', body: JSON.stringify({ password: $<HTMLInputElement>('#password').value }) });
    $<HTMLInputElement>('#password').value = '';
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
      Image.configure({ allowBase64: true }),
      TableKit.configure({ table: { resizable: false } }),
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
    onUpdate: () => (dirty = true),
    onTransaction: updateToolbar,
  });

  buildPalette('color', COLORS, (c) => (c ? editor!.chain().focus().setColor(c).run() : editor!.chain().focus().unsetColor().run()));
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
    const prev = editor!.getAttributes('link').href ?? '';
    const input = window.prompt ? window.prompt('링크 주소 (비우면 링크 해제)', prev) : null;
    if (input === null) return;
    if (!input) editor!.chain().focus().unsetLink().run();
    else editor!.chain().focus().extendMarkRange('link').setLink({ href: /^https?:\/\//.test(input) ? input : `https://${input}` }).run();
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
  'table-del': () => editor!.chain().focus().deleteTable().run(),
};

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
      editor!.commands.setContent(body || '');
      $('#ed-state').textContent = '';
    } catch (err) {
      toast((err as Error).message, true);
    }
  }
  dirty = false;
  $<HTMLInputElement>('#ed-title').focus();
}

$('#ed-title').addEventListener('input', () => (dirty = true));
$('#ed-meta').addEventListener('input', () => (dirty = true));

$('#ed-save').addEventListener('click', async () => {
  if (!editor) return;
  const btn = $<HTMLButtonElement>('#ed-save');
  const val = (id: string) => $<HTMLInputElement>(id).value.trim();
  const slug = val('#m-slug');
  if (!val('#ed-title')) return toast('제목을 적어 주세요.', true);
  if (!/^[a-z0-9-]+$/.test(slug)) {
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
    // 올린 사진 주소로 편집기 내용을 맞춰 둡니다.
    editor.commands.setContent(body);
    current.file = res.file;
    dirty = false;
    $('#ed-delete').hidden = false;
    $('#ed-state').textContent = '저장됨';
    history.replaceState(null, '', `#edit/${encodeURIComponent(res.file)}`);
    toast('저장했어요. 1~2분 뒤 사이트에 반영돼요.');
    loadAll().catch(() => {});
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

// ---------- 화면 이동 ----------
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h === 'new') return openEditor(null);
  if (h.startsWith('edit/')) return openEditor(h.slice(5));
  if (h === 'categories') {
    catDraft = categories.map((c) => ({ ...c }));
    renderCats();
    return show('categories');
  }
  renderList();
  show('list');
}
window.addEventListener('hashchange', () => {
  if (dirty && !$('#view-editor').hidden && !location.hash.startsWith('#edit/')) {
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
    if (!s.configured) return show('setup');
    if (!s.loggedIn) return show('login');
    await loadAll();
    route();
  } catch {
    show('login');
    toast('서버 연결이 느려요. 잠시 뒤 새로고침해 주세요.', true);
  }
})();
