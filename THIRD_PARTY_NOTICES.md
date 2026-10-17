# 第三方组件

代码依赖仅用于构建和测试，浏览器运行代码不加载远程库或 CDN。

| 组件              | 版本     | 用途                      | 许可 / 说明                                |
| ----------------- | -------- | ------------------------- | ------------------------------------------ |
| esbuild           | 0.25.12  | 将本地模块打包为 `app.js` | MIT；许可由安装包提供                      |
| Prettier          | 3.6.2    | 开发时代码格式化          | MIT；许可由安装包提供                      |
| Python Playwright | 1.58.0   | 可选浏览器回归            | Apache-2.0；浏览器另行下载并遵守其许可     |
| Barlow Condensed  | 随包字体 | HUD 字体                  | SIL Open Font License 1.1，见随包 OFL 文本 |
| Oxanium           | 随包字体 | 时钟数字                  | SIL Open Font License 1.1，见随包 OFL 文本 |

`node_modules`、Python 环境和浏览器二进制不随源码分发。PNG / GIF 的范围见 [ASSETS.md](ASSETS.md)。本项目也不附带 Wallpaper Engine 软件或任何 SDK 二进制。
