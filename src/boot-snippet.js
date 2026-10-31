// 页面脚本标签：JS 正常时隐藏 SSR 降级列表；JS 挂了则隐藏骨架、露出降级内容
export const ssrBoot = `<style>#root{display:none}</style><script type="module" src="/app.js" onerror="document.querySelectorAll('.ssr-only').forEach(e=>e.style.display='block')"></script>`;
