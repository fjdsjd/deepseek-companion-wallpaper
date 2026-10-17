"""Real pointer regressions with simulated Wallpaper Engine audio callbacks.

Run after npm run build. No native Wallpaper Engine or audio capture is used.
"""

import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "test-results" / "browser"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    if not (ROOT / "dist" / "index.html").is_file():
        raise SystemExit("Build the wallpaper first: npm run build")
    OUT.mkdir(exist_ok=True, parents=True)
    handler = partial(QuietHandler, directory=str(ROOT / "dist"))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_port}"
    checks, errors, requests = [], [], []
    completed = False

    def check(name, value):
        checks.append({"name": name, "passed": bool(value)})
        assert value, name
        print("PASS", name, flush=True)

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                page = browser.new_page(viewport={"width": 1920, "height": 1080})
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
                page.on("request", lambda request: requests.append(request.url))
                page.add_init_script("""
                  window.mockHost = {};
                  for (const [api, key] of [
                    ['wallpaperRegisterAudioListener', 'audio'],
                    ['wallpaperRegisterMediaPropertiesListener', 'properties'],
                    ['wallpaperRegisterMediaPlaybackListener', 'playback'],
                    ['wallpaperRegisterMediaStatusListener', 'status']
                  ]) window[api] = callback => window.mockHost[key] = callback;
                  window.networkAttempts = [];
                  for (const name of ['fetch', 'EventSource', 'WebSocket', 'XMLHttpRequest']) {
                    window[name] = function () {
                      window.networkAttempts.push(name);
                      throw Error('Unexpected ' + name);
                    };
                  }
                  window.frameRequests = 0;
                  const nativeRAF = window.requestAnimationFrame.bind(window);
                  window.requestAnimationFrame = callback => {
                    window.frameRequests++;
                    return nativeRAF(callback);
                  };
                """)
                page.goto(origin + "/?test=1", wait_until="networkidle")
                page.wait_for_function("window.__deepseek?.ready")
                page.locator("#loading").wait_for(state="hidden")

                def diag(code):
                    return page.evaluate("window.__deepseek." + code)

                def state():
                    return diag("state.state")

                def drag(x, y, dx):
                    rect = page.locator("#character").bounding_box()
                    px, py = rect["x"] + rect["width"] * x, rect["y"] + rect["height"] * y
                    page.mouse.move(px, py)
                    page.mouse.down()
                    page.mouse.move(px + dx, py + 7, steps=14)
                    page.wait_for_timeout(180)

                check("WebGL renderer ready", diag("backend") == "webgl-mesh")
                check("550W panels visible", page.locator("#systemInfo").is_visible() and page.locator("#weatherInfo").is_visible())
                check("authored node and root-site values", page.locator("#cpuName").inner_text() == "i1000-550W" and page.locator("#gpuName").inner_text() == "RTX 50900 Ti" and "128.0 TB" in page.locator("#memoryDetail").inner_text() and "北京基地" in page.locator("#weatherInfo").inner_text())

                page.evaluate("window.wallpaperPropertyListener.applyUserProperties({noderefresh:{value:60}})")
                before = page.locator("#cpuValue").inner_text()
                page.evaluate("window.__deepseek.advance(59000)")
                check("readouts obey refresh interval", page.locator("#cpuValue").inner_text() == before)
                page.evaluate("window.__deepseek.advance(2000)")
                check("readouts advance when due", page.locator("#cpuValue").inner_text() != before)
                page.locator("#settingsButton").click()
                page.locator("[data-setting=showNodeInfo]").uncheck()
                page.locator("[data-setting=showRootEnvironment]").uncheck()
                page.locator("#closeSettings").click()
                check("panel switches work", not page.locator("#systemInfo").is_visible() and not page.locator("#weatherInfo").is_visible())
                before = page.locator("#cpuValue").inner_text()
                page.evaluate("window.__deepseek.advance(120000)")
                check("hidden readouts are not rewritten", page.locator("#cpuValue").inner_text() == before)
                page.reload(wait_until="networkidle")
                page.wait_for_function("window.__deepseek?.ready")
                page.locator("#loading").wait_for(state="hidden")
                check("preferences survive reload", not page.locator("#systemInfo").is_visible() and not page.locator("#weatherInfo").is_visible())
                page.evaluate("window.wallpaperPropertyListener.applyUserProperties({shownodeinfo:{value:true},showrootenvironment:{value:true},noderefresh:{value:5}})")
                check("host properties restore panels", page.locator("#systemInfo").is_visible() and page.locator("#weatherInfo").is_visible())

                drag(.51, .20, 65)
                page.wait_for_function("window.__deepseek.state.state==='petting' && Math.abs(window.__deepseek.renderParams.head[0])>.005")
                check("head follows held drag", state() == "petting" and abs(diag("renderParams.head[0]")) > .005)
                page.screenshot(path=str(OUT / "head-drag.png"))
                page.mouse.up()
                check("head release restores idle", state() == "idle")
                for side, x, dx in [("left", .39, -60), ("right", .64, 60)]:
                    drag(x, .51, dx)
                    check(side + " cheek follows drag", state() == "pinching")
                    page.mouse.up()
                    page.wait_for_timeout(200)
                check("two cheek drags retain mild emotion", diag("state.pinchCount") == 2)
                drag(.51, .20, 65)
                page.mouse.up()
                check("petting clears mild emotion", diag("state.pinchCount") == 0)

                page.locator("#studyButton").click()
                drag(.39, .51, -60)
                page.mouse.up()
                check("cheek release resumes study", state() == "study")
                for _ in range(3):
                    drag(.64, .51, 60)
                    page.mouse.up()
                    page.wait_for_timeout(200)
                check("four cheek drags trigger tears", state() == "crying" and diag("state.hugRequired"))
                page.wait_for_timeout(300)
                page.screenshot(path=str(OUT / "crying.png"))
                drag(.39, .51, -60)
                page.mouse.up()
                check("crying still permits cheek drag", state() == "crying" and diag("state.pinchCount") == 5)
                drag(.51, .20, 65)
                page.mouse.up()
                check("comfort after crying requests hug", state() == "asking_hug")
                page.locator("#hugButton").click()
                check("hug starts", state() == "hugging")
                page.evaluate("window.__deepseek.advance(5000)")
                check("hug clears emotion", state() == "idle" and not diag("state.hugRequired"))

                page.locator("#feedButton").click()
                page.wait_for_timeout(600)
                check("meal animation starts", state() == "feeding" and diag("meal") is not None)
                page.screenshot(path=str(OUT / "feeding.png"))
                page.evaluate("window.__deepseek.advance(11000)")
                page.locator("#studyButton").click()
                check("study starts", state() == "study")
                page.locator("#studyButton").click()

                page.evaluate("window.wallpaperPropertyListener.setPaused(true)")
                page.wait_for_timeout(300)
                frame_requests = page.evaluate("window.frameRequests")
                page.wait_for_timeout(350)
                check("host pause stops animation requests", diag("paused") and page.evaluate("window.frameRequests") == frame_requests)
                page.evaluate("window.wallpaperPropertyListener.setPaused(false)")
                page.wait_for_function("!window.__deepseek.paused")
                page.wait_for_timeout(200)
                check("host resume restarts animation", page.evaluate("window.frameRequests") > frame_requests)

                page.evaluate("window.mockHost.status({enabled:true}); window.mockHost.properties({title:'音乐回调测试',artist:'测试输入',contentType:'music'}); window.mockHost.playback({state:'playing'});")
                page.evaluate("""async () => {
                  for (let i=0; i<30; i++) {
                    window.mockHost.audio(Array(128).fill(i%6<2 ? .45 : .08));
                    await new Promise(resolve => setTimeout(resolve,50));
                  }
                }""")
                check("audio callbacks show music portrait and spectrum", diag("music.listening") and diag("frame") == "listening" and page.locator("#musicPanel").is_visible())
                check("media callback displays title", page.locator("#trackTitle").inner_text() == "音乐回调测试")
                page.screenshot(path=str(OUT / "music.png"))
                page.evaluate("window.mockHost.playback({state:'stopped'})")
                page.wait_for_timeout(1500)

                page.locator("#settingsButton").click()
                page.screenshot(path=str(OUT / "settings.png"))
                page.locator("#resetSettings").click()
                page.locator("#closeSettings").click()
                check("reset restores node panels", diag("settings.showNodeInfo") and diag("settings.showRootEnvironment"))
                for width, height in [(2560, 1600), (1920, 1080), (1366, 768), (1024, 768), (1080, 1920), (390, 844)]:
                    page.set_viewport_size({"width": width, "height": height})
                    page.wait_for_timeout(500)
                    check(f"layout fits {width}x{height}", page.evaluate("document.documentElement.scrollWidth===innerWidth && document.documentElement.scrollHeight===innerHeight"))
                    check(f"panels clear clock at {width}x{height}", page.evaluate("document.querySelector('#infoPanel').getBoundingClientRect().bottom < document.querySelector('#clockPanel').getBoundingClientRect().top"))
                    page.screenshot(path=str(OUT / f"layout-{width}x{height}.png"))
                page.set_viewport_size({"width": 1920, "height": 1080})
                page.wait_for_timeout(5500)
                check("runtime makes no network API calls", not page.evaluate("window.networkAttempts"))
                check("only bundled files requested", all(url.startswith(origin + "/") for url in requests))
                check("browser console has no errors", not errors)
                page.screenshot(path=str(OUT / "idle.png"))
                completed = True
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
        report = {
            "pass": completed,
            "checks": checks,
            "errors": errors,
            "requests": requests,
            "musicEvidence": "Simulated Wallpaper Engine audio and media callbacks, not live system audio",
        }
        (OUT / "browser-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
