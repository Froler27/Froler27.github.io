# 站点视觉与交互（v2）

这次改版没有动 PaperMod 主题子模块，全部以「项目覆盖层」实现。换主题版本或升级 PaperMod 都不会冲掉这些改动。

## 文件分工

| 路径 | 作用 |
|------|------|
| `assets/css/extended/custom-base.css` | 设计令牌（颜色/字体/圆角/阴影）、页面底色光晕与蓝图网格、通用按钮/标签/卡片、页脚、入场动画、可访问性 |
| `assets/css/extended/custom-header.css` | 吸顶磨砂导航、菜单悬停下划线、主题切换按钮、移动端导航 |
| `assets/css/extended/custom-home.css` | 首页 Hero、关键词跑马灯、笔记卡片流、交互实验卡、关于条、响应式 |
| `assets/css/extended/custom-article.css` | 文章页 / 列表页 / 标签 / 搜索 / 404 的排版与组件 |
| `assets/css/extended/custom-graph.css` | 知识图谱页：舞台、工具栏、悬浮卡、领域/文章索引 |
| `assets/js/custom/site.js` | 滚动进度、导航态、入场动画、数字滚动、卡片光斑、主题切换过渡、外链安全属性 |
| `assets/js/custom/hero-init.js` | 读取主题色并初始化 Hero 背景、跟随明暗主题重绘 |
| `assets/js/custom/hero-gl.js` | Hero 的 WebGL 场景（线框立方体 + 透视地面 + 浮尘），含降级与性能保护 |
| `assets/js/custom/knowledge-graph.js` | 知识图谱的力导向布局、缩放/平移/拖拽、悬停详情、筛选搜索、点击跳文章 |
| `layouts/index.html` | 自定义首页结构（替代主题的 home 列表） |
| `layouts/knowledge.html` | 知识图谱页：读取 `data/knowledge.yaml`，渲染画布数据 JSON + 无 JS 索引 |
| `layouts/_partials/post_card.html` | 首页笔记卡片 |
| `layouts/baseof.html` | 仅加 body 类型类名、滚动进度条、跳到正文链接 |
| `layouts/_partials/extend_head.html` | js 标记、KaTeX（沿用）、theme-color |
| `layouts/_partials/extend_footer.html` | 交互脚本打包加载（Hero / 图谱脚本按页面条件加载） |

> 注意：`resources.Match "css/extended/*.css"` 按文件名升序拼接，实际顺序是
> `custom-article` → `custom-base` → `custom-graph` → `custom-header` → `custom-home`。
> 文章页规则因此统一用 `.post-single` / `.main` 前缀提高优先级；基础、导航、首页
> 在其后加载，可直接覆盖基础样式。新增 CSS 文件时请沿用这个约定。

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

## 知识图谱

页面入口 `/knowledge/`（导航「图谱」），数据全部在 `data/knowledge.yaml`：

- `domains`：领域分组与颜色；`nodes`：名词节点，`article` 填 `content/posts/` 下的文件名（不带 `.md`）
- `edges`：节点之间的关系（写两个 id）；渲染时会自动解析成真实文章链接，找不到文章 / 草稿节点会被跳过
- 新增一篇笔记后：在 `nodes` 里加若干名词（同一个 `article` 可以挂多个概念），再按需要连 `edges` 即可
- 画布交互：工具栏 **3D / 2D 视图切换**（带过渡动画，选择记在 localStorage）
  - 3D：拖拽旋转视角、滚轮/双指缩放、环绕相机、透视地面与深度辅助线
  - 2D：拖拽平移、滚轮/双指缩放，回到平面视图
  - 两种视图都支持悬停看详情、点击节点打开文章
- 默认开启轻量动态：3D 相机缓慢环绕、鼠标视差、节点漂浮、连线能量流动、入场推镜；2D 下保留节点漂浮和能量流动。工具栏「动态」按钮可暂停（偏好会记在 localStorage）。`prefers-reduced-motion` 时默认暂停，仍可手动开启
- 宽屏与窄屏使用两套锚点布局；无 JS 时画布隐藏，露出「按领域 / 按文章」的完整链接索引

## 交互与性能

- WebGL 背景只在首页加载；`prefers-reduced-motion` 时只画一帧静态画面；页面不可见时自动暂停；DPR 上限 1.75；WebGL 不可用时静默降级为 CSS 光晕背景
- 知识图谱只在 `/knowledge/` 加载，布局在首屏同步算完；3D 渲染限制在 ~60fps、页面不可见或滚出视口时自动暂停，DPR 上限 2；2D/3D 切换用 520ms 的投影过渡
- 所有动画在 `prefers-reduced-motion: reduce` 下关闭；无 JS 时内容默认可见（`.reveal` 只在 `html.js` 下隐藏）
- 卡片光斑、数字滚动均做 IntersectionObserver / rAF 节流
- 不引入任何外部字体、CDN、框架；新增体积只有 CSS 与自托管脚本

## 已知约定

- 资源指纹已开启（`disableFingerprinting = false`）：CSS/JS 文件名带内容哈希，新 HTML 不会配到旧缓存样式。**`.gitattributes` 里的 `docs/** -text` 不能删**——Windows 的 autocrlf 会改写产物换行，导致 SRI 哈希与线上文件不一致、浏览器拒绝加载 CSS。
- 发布产物在 `docs/`，改完后用 `hugo --cleanDestinationDir` 重新构建
- 主题符号、配色源仍然以 `BRAND.md` 为准；`--accent*` 三个值要和品牌色保持一致
