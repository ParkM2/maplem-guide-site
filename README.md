# 메이플스토리M 공략노트

메이플스토리M 공략을 모아 보여 주는 사이트입니다. [Astro](https://astro.build)로 만들고 [Vercel](https://vercel.com)에 배포합니다.

- 사이트: https://maplem-guide-site.vercel.app
- 글쓰기: https://maplem-guide-site.vercel.app/admin/ (비밀번호로 로그인)

## 글 쓰는 방법

1. `/admin/`에서 로그인하고 **새 글 쓰기**를 누릅니다.
2. 제목과 글 정보(분류, 주소, 수정일)를 채우고 본문을 씁니다. 글자 크기, 색, 배경색, 정렬, 목록, 인용구, 구분선, 표, 링크, 사진을 도구 막대에서 넣을 수 있습니다. 사진은 끌어다 놓거나 붙여넣어도 됩니다.
3. **저장**을 누르면 GitHub에 바로 저장되고, 1~2분 뒤 사이트에 반영됩니다.

분류는 **분류 관리**에서 추가, 삭제, 순서 변경을 할 수 있습니다.

## 글쓰기 설정 (처음 한 번)

Vercel 프로젝트의 Settings → Environment Variables에 두 값을 넣고 다시 배포합니다.

- `ADMIN_PASSWORD`: 글쓰기 화면 비밀번호
- `GITHUB_TOKEN`: GitHub fine-grained token (이 저장소만, Contents: Read and write)

글은 `src/content/posts/*.md`(본문은 HTML)로, 사진은 `public/media`에 저장됩니다.

## 스크린샷

사진은 올릴 때 가로 1600px 이하 WebP로 줄여 `public/media`에 저장되고, 배포할 때 한 번 더 가로 1600px 이하로 줄이고 다시 압축합니다(`scripts/optimize-media.mjs`).

## 직접 실행하기

```sh
npm install
npm run dev
```

## 배포

- Vercel: `main`에 올라가면 자동으로 배포됩니다. 설정은 Vercel이 Astro로 자동 인식합니다.
- 개인 도메인: Vercel 프로젝트의 Domains에서 연결하고, 환경 변수 `SITE_URL`에 새 주소를 넣습니다.
