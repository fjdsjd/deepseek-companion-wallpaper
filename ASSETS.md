# 素材范围

本文件区分代码许可与视觉素材，不改变壁纸中的显示文字。

## 角色、背景与预览

`public/assets/background.png`、`public/assets/character/*.png` 和 `public/preview.gif` 是本项目的运行与展示素材，包含根据用户提供的参考进行 AI 辅助制作及后续处理的图像。`docs/previews/` 中的截图和动图是本项目的浏览器实录，适用相同的视觉素材范围。形象与场景受 DeepSeek 同人形象及《流浪地球》数字生命场景启发，并非相关权利方的官方素材包。

上述视觉素材随源码提供，但不适用根目录的 MIT 许可，目前未另行授予开放素材许可。代码许可不授予第三方角色、商标、名称或参考作品的权利。重新发布或商用前，应自行确认所用视觉内容的授权；也可以替换成自己有权使用的素材。

| 文件                                                                  | 用途                           |
| --------------------------------------------------------------------- | ------------------------------ |
| `background.png`                                                      | 暖光书房背景                   |
| `character/idle.png`、`blink.png`                                     | 待机与眨眼；眨眼仅合成眼部区域 |
| `character/petting.png`                                               | 摸头                           |
| `character/pinch_left.png`、`pinch_right.png`                         | 左右捏脸                       |
| `character/annoyed_1.png`～`annoyed_3.png`                            | 前三次捏脸的小情绪面部叠层     |
| `character/crying.png`、`asking_hug.png`、`hugging.png`               | 哭泣、要抱抱与拥抱             |
| `character/study.png`、`study_tired.png`                              | 看书与疲倦                     |
| `character/listening.png`                                             | 听歌                           |
| `character/feeding_base.png`、`feeding_ready.png`、`feeding_chew.png` | 进食底图与面部变化             |
| `character/spoon_loaded.png`、`spoon_empty.png`                       | 独立勺子                       |
| `../preview.gif`                                                      | 工坊和 README 的动态预览       |

表中角色路径均相对于 `public/assets/`。各角色图层使用一致的画布和锚点，替换方式见 [开发说明](docs/DEVELOPMENT.md)。

## 字体

- Barlow Condensed Regular / Medium：Copyright 2017 The Barlow Project Authors，来源信息保留于 [BarlowCondensed-OFL.txt](public/assets/fonts/BarlowCondensed-OFL.txt)。
- Oxanium Variable：Copyright 2019 The Oxanium Project Authors，来源信息保留于 [Oxanium-OFL.txt](public/assets/fonts/Oxanium-OFL.txt)。

字体采用 SIL Open Font License 1.1；完整许可随字体一同分发，未并入代码的 MIT 许可。

## 音乐

本源码包不包含音乐录音。音乐显示和律动使用 Wallpaper Engine 音频/媒体回调，用户自己的播放器负责播放。
