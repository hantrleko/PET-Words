# PET Kids · 40天单词挑战

一款面向 8–12 岁英语学习者的**儿童友好型 PET (B1) 单词学习 Web App**。围绕「**40 天学完全部 PET 词汇**」核心目标，融合间隔重复、多模态练习、错题重练、综合测试与游戏化奖励，适合儿童独立操作。

---

## 🎯 项目目标与主要功能

- **40 天完整学习闭环**：前 35 天引入新词，后 5 天全面复习与毕业总测。
- **儿童独立使用**：大按钮、即时反馈、无需登录、进度自动保存（localStorage）。
- **多模态练习**：单词卡片学习 + 拼写输入 + 选择题 + 例句填空。
- **间隔重复算法**：Leitner 简化版，自动管理到期复习词与错题池。
- **游戏化激励**：星星累计、徽章解锁、连续打卡 streak、毕业证书。
- **完整词库**：内置约 2300 个 PET 核心词，覆盖 10 大主题（服装、食物、通用、自然、场所、交通、教育、科技、运动、音乐），A–Z 全段完成，可直接使用。

---

## ✅ 已完成功能

| 模块 | 功能说明 |
|------|----------|
| **首页 / Dashboard** | 今日概览、Hero「开始今日学习」、2×2 统计卡片（streak/掌握/今日星/累计星）、40天总进度条、快速复习错词入口 |
| **今日学习 / Learn** | 新词卡片轮播（单词+音标+主题emoji+中英释义+例句）、TTS 发音、听音/下一个/已掌握操作栏、进度条 |
| **练习中心 / Practice** | 三大 Tab：拼写输入（字母级即时反馈+3次机会+confetti）、选择题（4选项+干扰项）、例句填空 |
| **复习专区 / Review** | 到期复习 / 错题本入口、主题筛选、搜索浏览全部词汇（带掌握度五点指示与发音） |
| **综合测试 / Test** | 每日小测(10题)/阶段测试(20题)/毕业总测(40题)，随机拼写+选择混合，计时，满分证书 |
| **我的进度 / Progress** | 40天日历网格（完成/部分/今日高亮，可点击查看详情）、掌握率环形图、主题掌握率柱状图（Chart.js） |
| **奖励中心 / Rewards** | 星星总览、10 个徽章墙（解锁/未解锁状态）、成长记录 |
| **学习计划 / Plan** | 40 天详细计划表（阶段/新词数/活动/状态），可点击跳转对应天 |
| **辅助功能** | 设置（减少动画开关）、3 步新手教程、Mascot 帮助提示、进度导出 JSON、词库导入、重置进度 |

---

## 🗂 功能入口与 URI 说明

本应用为单页应用（SPA），所有功能通过页面路由切换，无独立 URI 参数。打开 `index.html` 即进入首页。

**页面路由**（底部导航栏 + 内部跳转）：

| 页面 | 路由 key | 主要入口 |
|------|----------|----------|
| 首页 | `home` | 底部导航「首页」、返回按钮 |
| 今日学习 | `learn` | 底部导航「学习」、首页 Hero 按钮 |
| 练习中心 | `practice` | 底部导航「练习」 |
| 复习专区 | `review` | 底部导航「复习」 |
| 综合测试 | `test` | 底部导航「测试」 |
| 我的进度 | `progress` | 底部导航「进度」 |
| 奖励中心 | `rewards` | 底部导航「奖励」 |
| 学习计划 | `plan` | 底部导航「计划」 |

**数据相关操作**（均在「我的进度」页）：

- **导出进度备份**：下载 `pet-progress-YYYY-MM-DD.json`（含 state + 词库）
- **导入词库**：上传 JSON 文件替换 `PET_VOCAB`，自动重建 40 天计划
- **重置所有进度**：清空 localStorage，回到初始状态

---

## 🧠 数据模型与复习算法

### 词库结构（`js/vocab-data.js`，`PET_VOCAB` 数组）

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

**必备字段**：`id`, `word`, `pos`, `definition_cn`, `definition_en`, `example_en`, `example_cn`
**可选字段**：`phonetic`, `topic`, `frequency`（用于主题筛选与分类统计）

### 进度数据模型（localStorage `pet_progress_v1`）

| 字段 | 类型 | 说明 |
|------|------|------|
| `currentDay` | number | 当前学习天数（1–40） |
| `streak` | number | 连续打卡天数 |
| `lastActiveDate` | string | 上次活跃日期 YYYY-MM-DD |
| `totalStars` | number | 累计星星 |
| `badges` | string[] | 已解锁徽章 id |
| `wordMastery` | object | `{ wordId: { level(0-5), lastReviewed, correctStreak, wrongCount } }` |
| `dailyRecords` | object | `{ day: { newLearned[], practiceCorrect, stars, completed } }` |
| `wrongWords` | number[] | 错题池 wordId |
| `stats` | object | `spellingCorrect`, `testPerfectCount` |
| `reducedMotion` | bool | 无障碍：减少动画 |

### 复习算法（Leitner 简化版，`js/app.js` `dueReviewIds()`）

1. **到期计算**：`lastReviewed + (level × 2) ≤ currentDay` 则到期
2. **新词**：首次学习 level=1，加入今日队列
3. **答对**：level+1（上限5），从错题池移除
4. **答错**：level-1（下限0），加入错题池
5. **每日复习上限**：18 个词（避免疲劳）
6. **毕业总测**：覆盖所有 level<4 的词 + 随机抽样

---

## 🎨 设计与技术

- **技术栈**：单文件 HTML + Tailwind CSS (CDN) + Vanilla JS（方案第9节组件化拆分）
- **配色**：天蓝 `#4FC3F7` / 草绿 `#81C784` / 阳光黄 `#FFD54F` / 珊瑚 `#FF8A65`（方案第5节儿童化视觉）
- **字体**：Google Fonts `Baloo 2`（圆润儿童字体）+ `Inter`
- **图标**：Font Awesome 6
- **图表**：Chart.js（掌握率环形图、主题柱状图）
- **动画**：canvas-confetti（答对撒花、满分礼炮）
- **发音**：Web Speech API `speechSynthesis`（TTS，无需额外资源）
- **Mascot**：🦊 小狐狸 emoji 角色动画，鼓励式反馈，无惩罚性语言
- **无障碍**：≥48px 按钮、键盘可达、减少动画开关、ARIA labels

### 文件结构

```
index.html              主页面（8 个 section + 导航 + Modal）
css/
  └── style.css         自定义样式（配色/mascot/卡片/confetti/日历）
js/
  ├── vocab-data.js     PET 词库数据（约 1175 词，覆盖 10 大主题，规范化去重）
  └── app.js            核心应用逻辑（路由/状态/计划/学习/练习/复习/测试/进度/奖励）
README.md
```

---

## 🔄 如何替换为完整词库（导入词库）

1. 准备 JSON 文件，内容为词库对象数组（结构同上「词库结构」）。
2. 打开应用 → 底部导航「进度」→ 点击「**导入词库**」。
3. 选择 JSON 文件 → 「确认导入」。
4. 系统自动重建 40 天学习计划，保留已有进度（自动清理不存在的旧词记录）。

> 当前内置约 2300 词（来源于您提供的 PET 词汇 PDF 提取整理 + Cambridge English B1 Preliminary 官方公开词表补全），覆盖 10 大主题：Clothing · Food · General · Nature · Places · Transport · Education · Technology · Sport · Music。已执行规范化去重（以 词头+词性+义项+用法 为准合并，纯重复项已替换为新词，跨主题同形词保留双入口并加注释）。词库已覆盖 A–Z 全段词汇，字母扩展已全部完成。

---

## 🚀 部署

要将网站上线，请前往 **Publish 标签页**一键发布，系统将自动处理部署并返回线上 URL。

---

## 🔮 待完善功能 / 推荐后续开发

- [x] 扩充词库至约 2300 词（当前已内置 2300 词 / 10 大主题，ID 1–2300，已覆盖 A–Z 全段，字母扩展全部完成 ✅）
- [ ] 为单词添加卡通图片（可后续用 AI 配图，字段预留 `image_url`）
- [ ] 添加语音输入（Web Speech Recognition）辅助拼写
- [ ] 家长后台：查看孩子学习报告、设定每日时长上限
- [ ] 繁体中文切换（i18n）
- [ ] 拆分为 React + Vite 组件化工程（当前原型可平滑迁移）
- [ ] 学习提醒（Notification API 推送）

---

## 📜 版权与致谢

- 词库内容整理自 Cambridge English PET B1 Vocabulary List 及用户提供的备考资料。
- 仅作学习用途。Mascot 🦊 仅为示意。
