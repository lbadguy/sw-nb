# SW-NB Field Notes

一个部署在 Cloudflare Workers 上的个人数字路书，包含云端博客、SW-NB 15 Pro Max 实验发布会，以及懂车帝公开动态的每日档案。

## Architecture

- `worker.js`: 静态资源、安全响应头、只读健康检查，以及懂车帝公开资料的每日同步与 KV 快照接口。
- `public/`: 无构建步骤的 HTML、CSS、JavaScript 和本地视觉资产。
- `supabase/functions/blog-api/`: 管理员验证、文章写操作和阅读量计数 Edge Function。
- `supabase/migrations/`: RLS、文章 RPC 和按小时去重的阅读事件表。
- `tests/`: Node 原生回归测试。

Lucide 和页面图片均在 `public/` 中自托管。生产页面不依赖第三方脚本 CDN。

## Local Development

需要 Node.js 22 或更高版本。

```powershell
$ErrorActionPreference = 'Stop'
npm install
npm run vendor:lucide
npm test
npm run dev
```

默认开发地址由 Wrangler 输出，通常为 `http://localhost:8787`。

## Supabase Setup

1. 应用迁移：

```powershell
$ErrorActionPreference = 'Stop'
npx supabase db push
```

2. 为 Edge Function 设置 Secret：

- `SITE_ORIGIN`: 生产站点完整 Origin，例如 `https://example.com`。
- `ADMIN_PASSWORD_SHA256`: 管理员密码的 SHA-256 十六进制摘要。
- `VIEW_HASH_SECRET`: 至少 32 字节的随机值，用于生成不可逆阅读指纹。

可在本机生成随机阅读密钥：

```powershell
$ErrorActionPreference = 'Stop'
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
```

设置 Secret 后部署 Function：

```powershell
$ErrorActionPreference = 'Stop'
npx supabase functions deploy blog-api
```

不要把真实 Secret 写入仓库、`.dev.vars` 示例或命令历史。

## Cloudflare Deployment

```powershell
$ErrorActionPreference = 'Stop'
npm run deploy
```

懂车帝归档由 Worker 读取公开个人资料接口，并在每天 UTC `20:17` 写入 `DONGCHEDI_CACHE` KV。`/api/dongchedi-profile` 优先返回最近成功快照；超过 36 小时时会在后台刷新，源站短暂失败不会清空现有数据。

前端只展示规范化后的公开资料与动态，并保留每条内容的懂车帝原帖链接，不提供虚构点赞、评论或关注操作。

## Privacy

“本机活动记录”只保存在当前浏览器的 `localStorage`，不会上传，也不代表全站访客统计。站点不再调用第三方 IP 查询服务或保存访客公网 IP。

## Verification

```powershell
$ErrorActionPreference = 'Stop'
npm run check
npm test
npx wrangler deploy --dry-run
```
