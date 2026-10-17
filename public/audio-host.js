// Register synchronously, before the deferred app starts. Keep only the latest event
// of each kind: the host can emit track metadata just once on wallpaper startup.
(function () {
  var latest = {},
    subscribers = [];
  var bridge = (window.__deepseekAudioHost = {
    audio: false,
    media: false,
    subscribe: function (callback) {
      subscribers.push(callback);
      Object.keys(latest).forEach(function (kind) {
        callback(kind, latest[kind].value, latest[kind].at);
      });
    },
  });
  function publish(kind, value) {
    var at = performance.now();
    latest[kind] = { value: value, at: at };
    subscribers.forEach(function (callback) {
      callback(kind, value, at);
    });
  }
  function register(name, kind) {
    if (typeof window[name] !== 'function') return false;
    try {
      window[name](function (event) {
        publish(kind, event);
      });
      return true;
    } catch (_) {
      return false;
    }
  }
  bridge.audio = register('wallpaperRegisterAudioListener', 'audio');
  bridge.media = register('wallpaperRegisterMediaPropertiesListener', 'properties');
  register('wallpaperRegisterMediaStatusListener', 'status');
  register('wallpaperRegisterMediaPlaybackListener', 'playback');
  register('wallpaperRegisterMediaTimelineListener', 'timeline');
})();
