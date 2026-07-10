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
| ✍️ 四种练习模式 | 拼写输入、选择题、例句填空、**听力拼写（听音辨词）** |
| ⭐ 收藏单词 | 词表内一键收藏生词，「只看收藏」筛选快速复习 |
| 👑 称号进阶系统 | 依据累计星星解锁 7 级称号（萌新探索者 → PET 传奇），首页与奖励中心均可查看进度 |
| 🔊 音效反馈 + Toast 轻提示 | WebAudio 音效（答对/答错/得星/解锁徽章），拼写/例句练习答对改为不打断的 Toast 提示 |
| 📊 进度可视化 | 掌握率饼图、主题柱状图、40 天日历 |
| 🏆 徽章奖励系统 | 13 枚成就徽章，激励持续学习（徽章解锁采用排队机制，避免多个弹窗重叠） |
| ☁️ 帐号登录 + 云端同步 | Email / Google 登录，进度自动备份至 Supabase，换设备不丢失 |
| 💾 备份与恢复 | 一键导出进度 JSON 备份，也可从备份文件完整恢复学习记录 |
| 📱 PWA 支持 | 可安装到手机桌面，支持离线使用 |
| 🔊 TTS 语音朗读 | 浏览器原生 Web Speech API，单词卡片与练习均可发音，支持美式/英式与语速调节 |
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

> ⚠️ **架构说明**：本项目采用**单文件架构**——`index.html` 内联了全部核心样式（`<style>`）与全部核心应用逻辑（`<script>`），是浏览器实际执行的唯一逻辑/样式来源。`js/app.js` 与 `css/style.css` 是早期开发阶段的独立草稿版本，**未被 `index.html` 加载，属于已弃用文件**，仅供历史参考；如需修改应用行为或样式，请直接编辑 `index.html`。真正被加载运行的 JS 文件只有 `js/supabase-sync.js`（云端同步）与 `js/vocab-data.js`（词库数据）。

```
PET-Words/
├── index.html              # 【主入口 / 唯一真实来源】内联词库回退副本 + 全部样式 <style> + 全部应用逻辑 <script>
├── js/
│   ├── supabase-sync.js    # 【已加载】Supabase Auth + 云端同步模块
│   ├── vocab-data.js       # 【已加载】完整 PET 词库（2300 词，JSON 格式）
│   └── app.js              # 【已弃用，未加载】早期独立逻辑草稿，仅供参考
├── css/
│   └── style.css           # 【已弃用，未加载】早期样式草稿，仅供参考
├── manifest.json           # PWA 清单文件
├── sw.js                   # Service Worker（离线缓存，CACHE_NAME 需在每次重大更新后递增）
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
| `stats` | object | `spellingCorrect`, `testPerfectCount`, `listenCorrect` |
| `favorites` | number[] | 收藏词 wordId 列表 |
| `soundEnabled` | boolean | 音效反馈开关（默认开启） |
| `dailyGoal` | number | 每日学习目标词数 |
| `ttsLang` / `ttsRate` | string / number | TTS 语音（美式/英式）与语速设定 |

> 注：`favorites`、`soundEnabled` 等新字段目前仅存于本地 `localStorage`，尚未加入 Supabase `user_progress` 表的云端同步字段，如需跨设备同步收藏/设置，需扩展数据库表结构与 `js/supabase-sync.js` 的推送/合并逻辑。

---

## 🎨 技术栈

- **前端**：单文件 HTML + Tailwind CSS (CDN) + Vanilla JS
- **后端**：Supabase（PostgreSQL + Auth + RLS）
- **图表**：Chart.js
- **动画**：canvas-confetti
- **语音**：Web Speech API（TTS）
- **部署**：GitHub Pages + GitHub Actions

---

## 📦 自定义词库与备份

- 支持通过「进度」页面的「导入词库」按钮替换为自定义词库（JSON 数组格式，结构同上）。
- 支持通过「进度」页面的「导出进度备份」将当前学习进度导出为 JSON 文件；也可通过「恢复进度备份」按钮选择备份文件，一键还原学习记录、星星、徽章与设置。

---

## 📄 许可证

MIT License © 2025 hantrleko
