# 部署指南

## GitHub Pages（推荐）

本项目已配置 GitHub Actions 自动部署，每次推送到 `main` 分支后自动发布。

```bash
git push origin main
# GitHub Actions 约 2-5 分钟后完成部署
# 访问：https://<your-username>.github.io/PET-Words/
```

### 首次配置

1. 进入 GitHub 仓库 → Settings → Pages
2. Source 选择 **GitHub Actions**
3. 确认 `.github/workflows/pages.yml` 已存在

---

## 其他静态托管平台

本项目无构建步骤，直接部署整个仓库目录即可。

| 平台 | 说明 |
|---|---|
| Cloudflare Pages | 连接 GitHub 仓库，Build command 留空，Output directory 为 `/` |
| Netlify | 连接 GitHub 仓库，Build command 留空，Publish directory 为 `.` |
| Vercel | 连接 GitHub 仓库，Framework 选 Other，Root directory 为 `.` |

---

## Supabase 配置（必须）

部署后需在 Supabase Dashboard 配置 Auth Redirect URL：

1. 进入 [Supabase Dashboard](https://supabase.com/dashboard) → 选择项目
2. Authentication → URL Configuration
3. **Site URL** 填入你的部署地址，例如 `https://yourusername.github.io/PET-Words/`
4. **Redirect URLs** 同上
5. Authentication → Providers → Email → 关闭「Confirm email」（推荐，方便用户直接注册）

---

## 可部署文件清单

```
index.html          # 必须（主入口）
js/                 # 必须（应用逻辑 + 同步模块）
css/                # 可选（补充样式，主样式已内联）
manifest.json       # 可选（PWA 支持）
sw.js               # 可选（PWA 离线缓存）
icons/              # 可选（PWA 图标）
.nojekyll           # 必须（GitHub Pages 禁用 Jekyll 处理）
```
