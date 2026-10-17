# 参与贡献

欢迎改进动画、补充台词、修复屏幕适配或完善测试。先阅读 [README](README.md) 跑起预览；常见改动步骤见 [二次开发指南](docs/CUSTOMIZATION.md)，模块关系见 [开发说明](docs/DEVELOPMENT.md)。

## 开始一个改动

1. 在 GitHub Fork 本仓库，把自己的 Fork 克隆到本地。
2. 创建一个描述改动的分支，例如 `git switch -c fix/cheek-drag`。
3. 执行 `npm ci`，修改 `src/`、`public/` 或配置，不直接编辑生成的 `dist/`。
4. 运行 `npm run format` 和 `npm run check`。涉及交互或布局时，再运行 `npm run test:browser`。
5. 提交代码并向本仓库的 `main` 分支发起 Pull Request。

一个 PR 尽量解决一个问题。说明触发条件、修改前后行为、实际执行的验证；视觉改动附修改前后截图。未在 Wallpaper Engine 中验证的部分请直接写明。

## 保持哪些约定

- 保留按住拖动的触摸输入、左右脸一致的规则，以及暂停后停止活动计时的行为。
- 保留贴图按需加载和回收，避免引入每帧重复 DOM 写入或全量资源预加载。
- 源码采用项目已有的 Prettier 配置。纯数学与状态测试使用 Node 内置测试框架，浏览器回归使用 Python Playwright。
- 不提交 `node_modules/`、`dist/`、`test-results/`、本机配置或凭据。
- 新代码沿用 MIT；新增图片、字体等需说明来源和许可，并更新 `ASSETS.md` 或 `THIRD_PARTY_NOTICES.md`。

## 报告问题

Issue 中请提供浏览器或 Wallpaper Engine 版本、屏幕分辨率、系统缩放、触发步骤和预期行为。有报错时附必要的控制台信息，截图前遮住无关的个人信息。

如果只在桌面出现、浏览器预览正常，也请说明。两种环境的输入和媒体回调不同，这能帮助定位问题。
