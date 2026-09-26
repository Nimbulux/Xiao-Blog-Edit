/* ============================================================
   functions/api/article.js - 文章内容 API
   路由：GET /api/article?id=xxx[&sub=yyy][&sub2=zzz]
   返回：{ ok, markdown, lastModified, date, path }
   - markdown：正文（已剥离 frontmatter）
   - date：frontmatter 里的 date 字段（如有），用于 SEO/排序
   - lastModified：ASSETS 返回的 Last-Modified 头（可能为空）
   Cache-Control: 5 分钟边缘缓存
   ============================================================ */

const SITE = "https://xiao-blog.top";
const DOCS = "/docs/";

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300"
    }
  });
}

/* 解析 frontmatter，仅提取 date 字段，正文去掉 frontmatter 块 */
function parseFrontmatter(md) {
  var m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  if (!m) return { date: null, body: md };
  var fm = m[1];
  var body = md.slice(m[0].length).replace(/^\r?\n/, "");
  var date = null;
  var dm = /^date:\s*(.+)$/m.exec(fm);
  if (dm) date = dm[1].trim().replace(/^["']|["']$/g, "");
  return { date: date, body: body };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const sub = url.searchParams.get("sub");
  const sub2 = url.searchParams.get("sub2");

  if (!id) return json({ ok: false, error: "缺少 id 参数" }, 400);

  var parts = [id];
  if (sub) parts.push(sub);
  if (sub2) parts.push(sub2);

  /* 防御：每段只允许字母数字-_，避免路径穿越 */
  for (var i = 0; i < parts.length; i++) {
    if (!/^[A-Za-z0-9_\-]+$/.test(parts[i])) {
      return json({ ok: false, error: "非法 id 路径" }, 400);
    }
  }

  var mdPath = DOCS + parts.map(encodeURIComponent).join("/") + "/index.md";

  if (!env || !env.ASSETS) return json({ ok: false, error: "ASSETS 未绑定" }, 500);

  try {
    var resp = await env.ASSETS.fetch(new Request(SITE + mdPath));
    if (!resp.ok) return json({ ok: false, error: "文章不存在" }, 404);

    var md = await resp.text();
    var lastModified = resp.headers.get("last-modified") || "";
    var fm = parseFrontmatter(md);

    return json({
      ok: true,
      markdown: fm.body,
      lastModified: lastModified,
      date: fm.date,
      path: parts
    });
  }
  catch (e) {
    console.error("[article] 获取失败：", e);
    return json({ ok: false, error: "获取文章失败" }, 500);
  }
}