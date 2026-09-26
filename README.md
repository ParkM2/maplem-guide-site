# 메이플스토리M 공략노트

메이플스토리M 공략을 모아 보여 주는 정적 사이트입니다. [Astro](https://astro.build)로 만들고 [Vercel](https://vercel.com)에 배포합니다.

- 사이트: https://maplem-guide-site.vercel.app (Vercel 프로젝트 이름에 따라 바뀔 수 있음)
- 웹 편집기: https://app.pagescms.org (GitHub 계정으로 로그인 후 이 저장소 선택)

## 글 쓰는 방법

1. 웹 편집기에서 **공략 글 → Add an entry**를 누릅니다.
2. 제목, 주소, 분류, 수정일을 채우고 본문을 씁니다. 스크린샷은 본문에 끌어다 놓으면 됩니다.
3. **Save**를 누르면 1~2분 뒤 사이트에 반영됩니다.

분류는 웹 편집기의 **분류** 메뉴에서 추가하거나 지울 수 있습니다.

## 스크린샷

올린 이미지는 `public/media`에 저장되고, 배포할 때 가로 1600px 이하로 줄이고 다시 압축합니다(`scripts/optimize-media.mjs`).

## 직접 실행하기

```sh
npm install
npm run dev
```

## 배포

- Vercel: `main`에 올라가면 자동으로 배포됩니다. 설정은 Vercel이 Astro로 자동 인식합니다.
- 개인 도메인: Vercel 프로젝트의 Domains에서 연결하고, 환경 변수 `SITE_URL`에 새 주소를 넣습니다.
- `.github/workflows/deploy.yml`은 GitHub Pages 예비 배포입니다. Vercel이 자리를 잡으면 지워도 됩니다.
