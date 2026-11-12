# 站点视觉与交互（v2）

这次改版没有动 PaperMod 主题子模块，全部以「项目覆盖层」实现。换主题版本或升级 PaperMod 都不会冲掉这些改动。

## 文件分工

| 路径 | 作用 |
|------|------|
| `assets/css/extended/custom-base.css` | 设计令牌（颜色/字体/圆角/阴影）、页面底色光晕与蓝图网格、通用按钮/标签/卡片、页脚、入场动画、可访问性 |
| `assets/css/extended/custom-header.css` | 吸顶磨砂导航、菜单悬停下划线、主题切换按钮、移动端导航 |
| `assets/css/extended/custom-home.css` | 首页 Hero、关键词跑马灯、笔记卡片流、交互实验卡、关于条、响应式 |
| `assets/css/extended/custom-article.css` | 文章页 / 列表页 / 标签 / 搜索 / 404 的排版与组件 |

> 注意：`resources.Match "css/extended/*.css"` 按文件名升序拼接，实际顺序是
> `custom-article` → `custom-base` → `custom-header` → `custom-home`。
> 文章页规则因此统一用 `.post-single` / `.main` 前缀提高优先级；基础、导航、首页
> 在其后加载，可直接覆盖基础样式。新增 CSS 文件时请沿用这个约定。
| `assets/js/custom/site.js` | 滚动进度、导航态、入场动画、数字滚动、卡片光斑、主题切换过渡、外链安全属性 |
| `assets/js/custom/hero-init.js` | 读取主题色并初始化 Hero 背景、跟随明暗主题重绘 |
| `assets/js/custom/hero-gl.js` | Hero 的 WebGL 场景（线框立方体 + 透视地面 + 浮尘），含降级与性能保护 |
| `layouts/index.html` | 自定义首页结构（替代主题的 home 列表） |
| `layouts/_partials/post_card.html` | 首页笔记卡片 |
| `layouts/baseof.html` | 仅加 body 类型类名、滚动进度条、跳到正文链接 |
| `layouts/_partials/extend_head.html` | js 标记、KaTeX（沿用）、theme-color |
| `layouts/_partials/extend_footer.html` | 交互脚本打包加载（Hero 脚本按文件存在与否条件加载） |

## 设计令牌

改颜色只需要动 `custom-base.css` 顶部的 `:root` 与 `:root[data-theme="dark"]`：

- 品牌主色 `--accent: #38bdf8`，亮色 `--accent-bright: #7dd3fc`，暗面 `--accent-deep: #0284c7`，辅助紫 `--accent-alt: #818cf8`
- 深色底 `--theme: #05080f`，浅色底 `#f4f8ff`
- 字体全部走本地系统字体：中文 `Microsoft YaHei / PingFang SC / Noto Sans SC`，英文与代码 `Cascadia Code / Consolas`
- 圆角 `--radius-lg: 20px`，卡片阴影 `--shadow-card / --shadow-lift`，光晕 `--glow / --glow-strong`

## 首页数据来源

- Hero 文案：`hugo.toml` → `[params.hero]`（kicker / kickerShort / lead / 两个按钮）
- 笔记卡片：`content/posts/` 的正式文章（draft 不出现），最新一篇自动作为跨两列的特稿
- 跑马灯：`[params.keywords]`
- 实验卡：`static/demo/gimbal-lock.html`、`static/demo/skinning.html`（新增演示时同步改 `layouts/index.html` 的 Lab 区）
- 数字统计：文章数、标签数由 Hugo 实时计算；Lab 数目前手写在 `layouts/index.html`

## 交互与性能

- WebGL 背景只在首页加载；`prefers-reduced-motion` 时只画一帧静态画面；页面不可见时自动暂停；DPR 上限 1.75；WebGL 不可用时静默降级为 CSS 光晕背景
- 所有动画在 `prefers-reduced-motion: reduce` 下关闭；无 JS 时内容默认可见（`.reveal` 只在 `html.js` 下隐藏）
- 卡片光斑、数字滚动均做 IntersectionObserver / rAF 节流
- 不引入任何外部字体、CDN、框架；新增体积只有 CSS 与两个自托管脚本

## 已知约定

- `disableFingerprinting = true` 不能关：历史原因，见 `hugo.toml` 中 SRI 注释
- 发布产物在 `docs/`，改完后用 `hugo --cleanDestinationDir` 重新构建
- 主题符号、配色源仍然以 `BRAND.md` 为准；`--accent*` 三个值要和品牌色保持一致
