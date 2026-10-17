# 开发说明

## 入口与模块

`public/index.html` 提供静态界面和宿主属性回调的早期队列。构建将 `src/wallpaper-app.mjs` 及其本地导入打包到 `dist/app.js`。`public/audio-host.js` 注册宿主音频/媒体回调，由应用消费。

| 模块                                           | 负责内容                            |
| ---------------------------------------------- | ----------------------------------- |
| `companion.mjs`                                | 互动状态机与学习、进食、拥抱计时    |
| `wallpaper-app.mjs`                            | DOM、输入事件、宿主回调、各模块调度 |
| `renderer.mjs`                                 | WebGL 网格、局部表情合成与图片降级  |
| `motion.mjs`、`respiration.mjs`                | 头身运动限制、胸口呼吸、发丝权重    |
| `texture-cache.mjs`                            | 按需加载、纹理驻留、闲置回收        |
| `feeding.mjs`、`meal-effects.mjs`              | 勺子轨迹、咀嚼与进食漫画符号        |
| `audio.mjs`、`music-view.mjs`                  | 频谱分析、媒体信息、听歌姿态与符号  |
| `dialogue-bank.mjs`、`dialogue.mjs`            | 本地句库、轮换、显示时间与关闭行为  |
| `settings.mjs`、`storage-keys.mjs`             | 设置归一化与稳定的本地存储键        |
| `screen-layout.mjs`、`settings-navigation.mjs` | 屏幕适配与设置翻页按钮              |
| `550w-telemetry.mjs`                           | 场景中的节点和环境读数              |
| `frame-loop.mjs`、`dom-update.mjs`             | 帧调度与避免重复 DOM 更新           |

## 修改互动时要保留的规则

状态机使用注入的“活动时间”。宿主暂停、页面隐藏后，学习、吃饭和拥抱不会在后台悄悄结束。测试通过注入时间验证，正常运行没有加速计时。

一次有效捏脸在松开时计数，单纯按下或取消拖动不计数。前三次松开后回到原来的陪伴状态，短暂显示对应小情绪；第四次哭泣。哭过以后需要完成摸头与拥抱才能清除委屈。左右脸共用规则，形变锚点跟随按下的位置。

Wallpaper Engine 的鼠标事件与普通浏览器可能不同。输入同时兼容 pointer 和 mouse 流，以明确的松开事件结束宿主鼠标手势；不要仅依据 `buttons === 0` 或鼠标的 `lostpointercapture` 结束拖拽。相关注释保留在入口模块。

学习时长设置在下一轮生效。进食期间暂停学习的有效计时，进食完成恢复原先状态。

## 更换角色图

角色图层是 1254 × 1254 的 RGBA PNG，勺子也使用相同画布以对齐坐标。坐标以画布左上角为原点、宽高归一化到 0–1。

- 新图的头部、眼睛、颈部、肩部和道具尽量与当前锚点对齐。
- 眨眼只替换眼部，进食只变化眼部和嘴部。底图的身体、手与碗保持一致。
- 小情绪图只覆盖面部及眉毛区域；若换图后出现双眉，检查 `renderer.mjs` 的 `expressionRegions`。
- 捏脸位移由局部网格实现，不需要把整张图镜像。头身摆动受 `motion.mjs` 的限制。
- `respiration.mjs` 根据画布区域计算胸口和发丝的权重，同时保护书本、手、碗等道具。

修改句子可编辑 `dialogue-bank.mjs`。底部短字幕及状态说明在 `wallpaper-app.mjs` 的 `labels` 中。

## 构建与验证

`npm run check` 是基础检查。`npm run test:browser` 另外覆盖真实鼠标拖拽、表情状态、吃饭、看书、音频回调、设置保存、暂停和多比例布局，报告位于 `test-results/browser/`。

`/?test=1` 会开放 `window.__deepseek.advance(ms)`，供回归测试跳过等待。普通入口仅提供只读诊断状态。请勿用模拟音频结果代替 Wallpaper Engine 中的真实播放器测试。

`dist/integrity.json` 记录构建文件的 SHA-256 和字节数；不含时间戳，相同源码和依赖可以比较重建结果。源码目录、原始贴图和构建目录不要混用，所有定制修改都应先写入 `src/`、`public/` 或根目录的配置文件。

提交前应检查新图片尺寸、资源请求、控制台错误和互动连贯性。需要发布到工坊时，再到 Wallpaper Engine 编辑器内预览和提交。
