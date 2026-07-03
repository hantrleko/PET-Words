# 🦊 PET Kids · 40天单词挑战

> 一款专为 PET（B1 Preliminary）备考设计的儿童友好型单词学习 App，支持帐号登录与多端云端同步，可安装为 PWA 离线使用。

[![GitHub Pages](https://img.shields.io/badge/Demo-Live-brightgreen?logo=github)](https://hantrleko.github.io/PET-Words/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## ✨ 功能亮点

| 功能 | 说明 |
|---|---|
| 📅 40 天学习计划 | 前 35 天引入新词，后 5 天全面复习与总测 |
| 🧠 间隔复习算法 | 基于遗忘曲线（Leitner 简化版），自动安排到期复习 |
| ✍️ 三种练习模式 | 拼写输入、选择题、例句填空 |
| 📊 进度可视化 | 掌握率饼图、主题柱状图、40 天日历 |
| 🏆 徽章奖励系统 | 10 枚成就徽章，激励持续学习 |
| ☁️ 帐号登录 + 云端同步 | Email / Google 登录，进度自动备份至 Supabase，换设备不丢失 |
| 📱 PWA 支持 | 可安装到手机桌面，支持离线使用 |
| 🔊 TTS 语音朗读 | 浏览器原生 Web Speech API，单词卡片与练习均可发音 |
| ⌨️ 键盘快捷键 | 空格/Enter 翻页，数字键选择答案 |

---

## 🚀 快速开始

直接访问线上版本：**[https://hantrleko.github.io/PET-Words/](https://hantrleko.github.io/PET-Words/)**

或克隆后本地运行（无需构建步骤）：

```bash
git clone https://github.com/hantrleko/PET-Words.git
cd PET-Words
npx serve .   # 或任意静态文件服务器
# 访问 http://localhost:3000
```

---

## 🗂️ 项目结构

```
PET-Words/
├── index.html              # 主入口（含内联词库、样式、核心应用逻辑）
├── js/
│   ├── supabase-sync.js    # Supabase Auth + 云端同步模块
│   ├── app.js              # 核心应用逻辑（学习/练习/测试/奖励）
│   └── vocab-data.js       # 完整 PET 词库（约 1175 词，JSON 格式）
├── css/
│   └── style.css           # 补充样式
├── manifest.json           # PWA 清单文件
├── sw.js                   # Service Worker（离线缓存）
├── icons/                  # PWA 图标（192×192、512×512）
├── .github/
│   └── workflows/
│       └── pages.yml       # GitHub Actions 自动部署
├── README.md
└── DEPLOY.md
```

---

## ☁️ Supabase 配置

本项目使用 [Supabase](https://supabase.com) 提供帐号登录与云端同步服务（免费方案）。

### 数据库表结构

```sql
CREATE TABLE user_progress (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  current_day     int  DEFAULT 1,
  streak          int  DEFAULT 0,
  last_active_date text,
  total_stars     int  DEFAULT 0,
  badges          jsonb DEFAULT '[]',
  word_mastery    jsonb DEFAULT '{}',
  daily_records   jsonb DEFAULT '{}',
  wrong_words     jsonb DEFAULT '[]',
  stats           jsonb DEFAULT '{"spellingCorrect":0,"testPerfectCount":0}',
  reduced_motion  boolean DEFAULT false,
  updated_at      timestamptz DEFAULT now()
);
-- RLS: 每个用户只能读写自己的数据
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
```

### Auth 配置

在 Supabase Dashboard → Authentication → URL Configuration 中设置：

- **Site URL**：`https://hantrleko.github.io/PET-Words/`
- **Redirect URLs**：`https://hantrleko.github.io/PET-Words/`

---

## 🧠 数据模型

### 词库结构（`window.PET_VOCAB` 数组）

```json
{
  "id": 1,
  "word": "backpack",
  "pos": "n",
  "phonetic": "/ˈbækpæk/",
  "definition_cn": "背包",
  "definition_en": "A bag carried on the back.",
  "example_en": "She carried her books in a backpack.",
  "example_cn": "她用背包背着书。",
  "topic": "Clothing",
  "frequency": "high"
}
```

### 进度数据模型（localStorage `pet_progress_v1` + Supabase `user_progress`）

| 字段 | 类型 | 说明 |
|---|---|---|
| `currentDay` | number | 当前学习天数（1–40） |
| `streak` | number | 连续打卡天数 |
| `lastActiveDate` | string | 上次活跃日期 YYYY-MM-DD |
| `totalStars` | number | 累计星星 |
| `badges` | string[] | 已解锁徽章 id |
| `wordMastery` | object | `{ wordId: { level, lastReviewed, correctStreak, wrongCount } }` |
| `dailyRecords` | object | `{ day: { newLearned[], practiceCorrect, stars, completed } }` |
| `wrongWords` | number[] | 错题池 wordId |
| `stats` | object | `spellingCorrect`, `testPerfectCount` |

---

## 🎨 技术栈

- **前端**：单文件 HTML + Tailwind CSS (CDN) + Vanilla JS
- **后端**：Supabase（PostgreSQL + Auth + RLS）
- **图表**：Chart.js
- **动画**：canvas-confetti
- **语音**：Web Speech API（TTS）
- **部署**：GitHub Pages + GitHub Actions

---

## 📦 自定义词库

支持通过「进度」页面的「导入词库」按钮替换为自定义词库（JSON 数组格式，结构同上）。

---

## 📄 许可证

MIT License © 2025 hantrleko
