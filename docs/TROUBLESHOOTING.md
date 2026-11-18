# 故障排查

## 有背景，人物不显示

请先更新到 1.4.0 或更高版本，重新应用壁纸。完整的构建目录必须包含 `index.html`、`app.js` 和 `assets/character/`；只复制网页入口无法加载人物。

1.4.0 优先使用 CORS 图片加载，适配允许匿名图片访问的沙箱宿主。不支持该访问方式时会再尝试普通图片。若宿主仍禁止图片上传到 WebGL，壁纸自动切换到图片渲染，保留状态切换与互动，局部呼吸、发丝和脸颊网格动画会简化。没有安装额外助手或 GitHub 插件的要求。

若连待机图片都无法解码，画面会显示素材加载错误。请验证订阅资源完整性，或在编辑器重新导入完整构建目录。

## 运行一段时间后人物停住或消失

WebGL 贴图上传、着色器和显存分配失败现在会转入简化显示；图形上下文丢失后不自动刷新页面，以保留学习和互动状态。软件无法恢复操作系统终止的进程，也不能保证规避所有显卡驱动或宿主故障。

反馈时请附上 Wallpaper Engine 版本、Windows 版本、显卡型号、出错前的操作及报错截图。若方便打开网页调试器，以下只读诊断可区分素材加载与 GPU 问题：

```js
window.__deepseek.backend; // webgl-mesh / image-fallback
window.__deepseek.rendererError; // 简化显示的触发原因
window.__deepseek.resources; // 贴图数量、内存估算及解码错误
```

这些诊断不会上传到网络。正常 30 FPS 已足够表现动画；多屏或显卡负载较高时可将壁纸帧率调到 15–24 FPS，关闭不需要的粒子。

## 有频谱，没有歌名

频谱与歌曲名称是两个独立通道。频谱来自系统音频，歌名来自 Windows 媒体会话，经 Wallpaper Engine 转发。

1. 在 Wallpaper Engine 设置中开启媒体集成。
2. 在播放器中开启向系统提供媒体信息的功能（具体名称随播放器版本而异），然后切换一首歌或暂停后继续。
3. 如果 Windows 的系统媒体控件也没有该曲名，壁纸无法自行补出曲名。网易云等播放器是否提供信息取决于其版本与设置。

1.4.0 修复了停止后继续播放、宿主没有重复发送歌曲属性时丢失名称的问题。关闭媒体集成或收到空属性时仍会清除旧名称。

官方接口说明：[Wallpaper Engine Media Integration](https://docs.wallpaperengine.io/en/web/audio/media.html)。

## 气泡没有声音

检查壁纸设置中的配音开关、配音音量，以及 Wallpaper Engine 的音量设置。浏览器预览可能要求先点击页面才能播放声音。关闭气泡、暂停壁纸时，当前配音会停止；不必安装上游音色模型。

## 开发验证

```sh
npm run check
npm run test:browser
npm run test:voice
npm run test:renderer
npm run test:pinch
```

后面四个命令需要安装 `requirements-dev.txt` 和 Playwright Chromium。`test:renderer` 使用软件 WebGL 与注入的故障验证恢复路径，报告写入 `test-results/renderer/`。这不替代 Wallpaper Engine 原生预览及不同硬件上的验证。
