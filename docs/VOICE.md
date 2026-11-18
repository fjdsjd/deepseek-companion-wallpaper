# 鲸鲸气泡配音

聊天气泡出现时，用肥鱼的 `cute`（可爱）声线读出当前一句。画面里的颜文字、爱心和音符仍保留，语音只读正文。底部短暂的状态字幕不会再读一遍。

配音按 14 种状态分别生成：摸头时轻柔、害羞地撒娇；要抱抱时软糯地央求；前三次捏脸从嘟嘴逐步变得委屈，哭泣时使用哭腔；安抚和拥抱时慢慢放松；看书时轻声嘟囔，吃饭和听歌时开心含笑。声音使用同一套 F6 音色与参考音频，通过 CosyVoice3 的情绪指令和轻微语速调整改变表演。

当前声线采用 `youthful-v3` 离线处理：在无损合成 WAV 上分别调整音高（+2.6 半音）和共鸣（共振峰 +1.2 半音），节奏轻快 3%，让声音向更稚嫩、轻软的方向变化，同时保留各状态的语调。使用 FFmpeg 的 Rubber Band 滤镜分别控制音高和时长，处理后统一音量。播放时使用正常速率；壁纸没有实时变声开销。

设置 → 小声碎碎念中提供「鲸鲸气泡配音」和「说话音量」。默认开启，音量 55%。关闭这轮气泡、切换互动状态、关闭闲聊或关闭配音会停止当前语音；宿主暂停或页面隐藏时暂停，恢复后继续。浏览器阻止自动播放时，首次点击页面后可播放当前仍在显示的句子，不积累待播队列。

## 离线资源

- `src/dialogue-bank.mjs`：画面显示的全部气泡台词。
- `src/voice-direction.json`：各状态的配音语气、语速及 `mastering` 声线参数，仅用于开发时合成和处理。
- `src/voice-manifest.json`：原句到 MP3 的映射、实际时长、发音正文和模型校验信息。
- `public/assets/voice/*.mp3`：24 kHz、单声道、64 kbps 的预生成配音。
- `src/dialogue-voice.mjs`：单个音频播放器，按需加载，替换或关闭时释放旧音频。

壁纸运行时不加载语音模型、不调用服务，也不请求网络。生成音频使用的 Python、CUDA、CosyVoice 和模型权重不进入壁纸发布目录。音频播放期间及结束后的短尾音暂不参与系统音频分析，避免自身说话触发听歌立绘；已有听歌状态在此期间保持。

## 修改台词后重新配音

普通壁纸开发只需 Node.js。只有重新合成语音时才需要单独准备声音生成环境。

1. 按 [Feiyu 声音项目](https://github.com/Esmerubphire/astrbot_plugin_feiyu_voice) 的说明安装 TTS 环境，并下载 [FeiyuVoice-CosyVoice3](https://huggingface.co/Esmerubphire/FeiyuVoice-CosyVoice3) 模型包。使用包内记录的 CosyVoice 源码版本。
2. 运行 `node scripts/voice-catalog.mjs /absolute/path/catalog.json`，导出台词与发音正文。
3. 在 TTS 的独立 Python 环境中运行以下命令，路径替换为自己的实际目录：

```sh
python scripts/generate-voice.py \
  --package /absolute/path/FeiyuVoice-CosyVoice3 \
  --runtime /absolute/path/CosyVoice \
  --catalog /absolute/path/catalog.json \
  --raw /absolute/path/private-voice-wav \
  --output /absolute/path/wallpaper/public/assets/voice \
  --manifest /absolute/path/wallpaper/src/voice-manifest.json
```

生成脚本校验模型和源码版本，同一次运行只加载一次模型，按原句哈希命名音频。原始 WAV 和校验记录放在 `--raw` 指定的开发目录；台词、音色、参考音频、情绪指令、语速和配方版本均一致时才复用缓存，改变情绪后不会误用旧朗读音频。需要 FFmpeg/ffprobe 和可用的 CUDA 环境。输入已规范化为中文正文，合成时采用模型自身的文本处理，跳过会自动下载资源的可选前端。若上游 TTS 安装预设缺少 `pyarrow`，在该独立环境安装 CosyVoice 对应的 `pyarrow==18.1.0`；不要为此升级模型要求的 NumPy。不要把模型环境、原始 WAV 或本地路径配置提交到源码仓库。

4. 检查发音、尾字、音量，再运行 `npm run build`。气泡会按真实音频长度适当延长停留时间。未配音的新句子仍可正常显示文字；发布前应补齐配音并检查覆盖率。

只调整声线时，可修改 `mastering` 并重新导出台词清单，在上述命令后添加 `--remaster-only`。该模式先核对现有无损 WAV、原句和合成配方，然后重新处理音频，不加载 TTS 模型，也不需要 CUDA；FFmpeg 必须包含 `rubberband` 滤镜。缺失缓存或台词、情绪有改动时会明确报错，应先重新合成对应语音。每次都从原始 WAV 开始，避免在旧 MP3 上反复变声；新的处理配方及校验值会写入清单，方便重现和检查。将三个参数设为 `0`、`0`、`1` 可保留原始音高、共鸣与节奏。

## 声音来源与署名

特别感谢 **@莱恩希德公爵** 提供并训练肥鱼音色，项目地址：[Esmerubphire/astrbot_plugin_feiyu_voice](https://github.com/Esmerubphire/astrbot_plugin_feiyu_voice)。模型使用其公开的 FeiyuVoice-CosyVoice3 `cute / F6` 配置，采用 CosyVoice3 生成。本次为说话配音，未进行额外 RVC 转换或训练。

上游模型的原始音频来源署名为 **星落落\_oi**，训练授权范围见其 [COPYRIGHT.md](https://github.com/Esmerubphire/astrbot_plugin_feiyu_voice/blob/main/COPYRIGHT.md)；模型及参考音频的分发说明见 [NOTICE.md](https://huggingface.co/Esmerubphire/FeiyuVoice-CosyVoice3/blob/main/NOTICE.md)。本项目的 MP3 为合成语音，不是真人录音，也不自动套用代码的 MIT 许可。
