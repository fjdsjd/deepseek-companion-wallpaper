# 二次开发指南

这是原生 JavaScript 模块项目，主要开发工具只有 Node.js 和 esbuild。先按照 [README](../README.md#本地开发) 跑起浏览器预览，再从一个小改动开始。修改 `src/`、`public/` 或 `wallpaper.json`，执行 `npm run build` 后刷新页面即可；`dist/` 中的修改会被下次构建覆盖。

## 1. 给鲸鲸加一句台词

打开 [`src/dialogue-bank.mjs`](../src/dialogue-bank.mjs)，找到 `DIALOGUE_BANK.idle`，在数组里追加一个小对话：

```js
['今天也有好好浮上来。', '现在轮到你伸个懒腰啦 (｡･ω･｡)ﾉ'],
```

每项是一轮对话，每个字符串会依次显示。`idle` 对应待机，`study` 对应看书，`listening` 对应听歌，其他状态也各有句库。句子尽量短，避免把可关闭的小气泡写成大段说明。

底部临时字幕和侧栏状态名在 [`wallpaper-app.mjs`](../src/wallpaper-app.mjs) 的 `labels` 对象中；进食阶段字幕还会使用 [`feeding.mjs`](../src/feeding.mjs) 的时间线。修改后执行：

```sh
npm run format
npm test
npm run build
```

打开设置可以把闲聊间隔暂时调小，方便查看新句子。句库会轮换，不保证刚添加的句子立即出现。

## 2. 换背景或人物

背景位于 `public/assets/background.png`。角色和独立勺子位于 `public/assets/character/`，使用 **1254 × 1254 RGBA** 画布。优先沿用文件名和画布大小，保持眼睛、颈部、头发与道具的位置。

这些图并非随意切换的全屏插画：眨眼与小情绪只合成面部，进食时身体、手与碗保持在底图上。因此，替换角色时应同步准备相关表情，而不是只改 `idle.png`。完整文件用途见 [素材表](../ASSETS.md)。

| 新形象出现的问题               | 检查位置                                                         |
| ------------------------------ | ---------------------------------------------------------------- |
| 双眉、表情错位、眨眼时脸部闪边 | `renderer.mjs` 中的 `expressionRegions`、`portrait()` 和局部面罩 |
| 头顶或脸颊点不中               | `wallpaper-app.mjs` 中的 `hitTest()`；先确认图中五官坐标一致     |
| 头身扭动、发丝带着脸走         | `motion.mjs` 的枢轴与位移限制；`respiration.mjs` 的区域权重      |
| 勺子进不到嘴里                 | `feeding.mjs` 的 `SPOON_ANCHOR` 和勺子轨迹                       |

如果改成自己的人物，同时修改 `wallpaper.json` 的标题/描述和 `public/index.html` 的显示名称。重新发布前确认自己有权使用全部素材；代码 MIT 与图像范围分别见 [LICENSE](../LICENSE) 和 [ASSETS.md](../ASSETS.md)。

## 3. 调整现有设置，或增加一个设置

只改默认学习时长时，至少同步以下三处：

1. [`settings.mjs`](../src/settings.mjs) 的 `DEFAULTS.studyMinutes`。
2. [`wallpaper-properties.json`](../src/wallpaper-properties.json) 的 `studyminutes.value`。
3. [`companion.mjs`](../src/companion.mjs) 的 `STUDY_MS`，使独立状态机的默认值也一致。

已有用户的本地设置会优先于新默认值；可以在预览中点“恢复默认设置”验证。若修改状态机默认时长，也需同步对应测试的期望值。

增加一个新配置项时，需要连接完整的读写链路：

| 位置                                     | 要做的事                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `settings.mjs`                           | 在 `DEFAULTS` 声明默认值；为非布尔值补充类型检查和范围限制                |
| `public/index.html`                      | 添加带 `data-setting="yourSetting"` 的输入控件，范围控件可配 `data-value` |
| `wallpaper-app.mjs`                      | 在 `applySettings()` 或绘制逻辑中真正使用该值                             |
| `wallpaper-properties.json`              | 添加 Wallpaper Engine 对应属性，明确 `type`、`text`、`value` 和范围       |
| `wallpaper-app.mjs` 的 `wallpaperUser()` | 将宿主属性名映射到设置键，例如 `yoursetting: 'yourSetting'`               |
| 测试                                     | 验证默认值、错误输入、保存恢复，以及宿主属性更新                          |

不要随意更换 `storage-keys.mjs` 的键名，否则现有用户的偏好会丢失。设置改变不应重启当前学习轮次；当前轮次继续使用开始时的时长。

## 4. 扩展一个互动状态

[`Companion`](../src/companion.mjs) 不依赖 DOM，时间与状态变更回调由构造函数注入。先用状态机测试定义新行为，再接入按钮与渲染。

```js
import { Companion } from '../src/companion.mjs';

let now = 0;
const companion = new Companion(() => now);
companion.startStudy();
now += companion.studyCycleMs;
companion.tick();
console.assert(companion.state === 'study_tired');
```

新增状态时，依次检查：

1. 在 `STATES`、进入/退出方法、`canGesture()` 与 `tick()` 中明确状态转移、可用动作和有效时长。
2. 准备对应贴图，检查 `renderer.mjs` 中的帧选择逻辑和依赖图层。新增状态默认按同名 PNG 加载；纯逻辑状态需要显式映射到已有立绘。
3. 为 `wallpaper-app.mjs` 的 `labels`、`dialogue-bank.mjs` 和 `dialogue.mjs` 的场景选择补齐文案与规则。
4. 若状态会影响音乐、进食或书本，检查 `audio.mjs` 中的 `listeningAllowed()`、状态恢复，以及 `respiration.mjs` 中的道具保护。
5. 最后添加按钮或输入事件，并覆盖暂停、取消拖拽、重复点击、结束后恢复原状态的测试。

计时应使用状态机提供的活动时间；不要另起不受宿主暂停控制的 `setInterval`。参考现有进食逻辑：吃饭会暂停学习有效计时，结束后继续原来的学习状态。

## 5. 调整界面与性能

- 全局颜色、字体和主要 HUD 规则：`public/style.css`。
- 各比例布局补充样式：`public/layout.css`；尺寸计算和气泡位置：`src/screen-layout.mjs`。
- 桌面滚轮可能被宿主拦截，设置面板应保留 `settings-navigation.mjs` 的上下翻页按钮。
- 新图片继续走 `TextureCache` 的按需加载。避免把全部表情常驻 GPU，也不要为每个特效再开一个动画循环。
- 每秒更新的文字走现有时钟/UI 调度，频谱和粒子按开关控制；本地静态资源放到 `public/` 中。

## 6. 验证和提交

```sh
npm run check
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
npm run test:browser
```

Node 测试适合检查状态机和数学规则；浏览器测试使用真实鼠标拖拽，覆盖 16:10、16:9、4:3 和竖屏布局。音乐测试是宿主回调模拟，实际播放器曲名和桌面输入仍需在 Wallpaper Engine 中确认。

浏览器报告与截图位于 `test-results/browser/`，不提交到仓库。提交说明写清改了什么、怎样验证；具体流程见 [CONTRIBUTING.md](../CONTRIBUTING.md)。
