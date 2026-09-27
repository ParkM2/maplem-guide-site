// 본문 이미지 처리
// - 웹 편집기가 넣는 /media/... 주소 앞에 사이트 base를 붙임
// - 지연 로딩을 켜고, 이미지를 누르면 원본 크기로 열리게 링크로 감쌈
// - 표는 좁은 화면에서 옆으로 밀어 볼 수 있게 감쌈
export default function rehypeMedia({ base = '' } = {}) {
  const prefix = base.replace(/\/$/, '');
  const fix = (src) =>
    typeof src === 'string' && src.startsWith('/') && !src.startsWith(prefix + '/') ? prefix + src : src;

  const walk = (node, parent) => {
    if (node.type === 'element' && node.tagName === 'img') {
      node.properties.src = fix(node.properties.src);
      node.properties.loading = 'lazy';
      node.properties.decoding = 'async';
      if (parent && !(parent.type === 'element' && parent.tagName === 'a')) {
        const img = { ...node };
        node.tagName = 'a';
        node.properties = { href: img.properties.src, className: ['zoom'], target: '_blank', rel: 'noopener' };
        node.children = [img];
        return;
      }
    }
    if (node.type === 'element' && node.tagName === 'table' && parent) {
      const table = { ...node };
      node.tagName = 'div';
      node.properties = { className: ['tbl-scroll'] };
      node.children = [table];
      for (const child of table.children || []) walk(child, table);
      return;
    }
    if (node.type === 'element' && node.tagName === 'a' && typeof node.properties.href === 'string') {
      node.properties.href = fix(node.properties.href);
    }
    for (const child of node.children || []) walk(child, node);
  };

  return (tree) => walk(tree, null);
}
