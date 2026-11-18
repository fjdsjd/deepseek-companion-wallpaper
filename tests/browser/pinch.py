"""Real held mouse drags, reversal and release with the original local mesh."""
import json
import threading
from functools import partial
from http.server import ThreadingHTTPServer
from renderer import Handler, ROOT
from playwright.sync_api import sync_playwright

OUT = ROOT / 'test-results' / 'pinch'
OUT.mkdir(parents=True, exist_ok=True)
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT / 'dist')))
threading.Thread(target=server.serve_forever, daemon=True).start()
checks, errors = [], []


def check(name, value):
    checks.append({'name': name, 'passed': bool(value)})
    print(('PASS ' if value else 'FAIL ') + name, flush=True)
    assert value, name


try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 1600, 'height': 1000})
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{server.server_port}/?test=1', wait_until='networkidle')
        page.wait_for_function('window.__deepseek?.ready')
        page.locator('#loading').wait_for(state='hidden')
        page.evaluate('window.wallpaperPropertyListener.applyUserProperties({motion:{value:0},mousetracking:{value:false},voiceenabled:{value:false},showchatter:{value:false}})')
        rect = page.locator('#character').bounding_box()
        for side, x, sign in [('left', .39, -1), ('right', .64, 1)]:
            px, py = rect['x'] + rect['width'] * x, rect['y'] + rect['height'] * .52
            page.mouse.move(px, py)
            page.mouse.down()
            page.wait_for_function("window.__deepseek.state.state==='pinching'")
            page.wait_for_timeout(450)
            page.screenshot(path=str(OUT / (side + '-before.png')))
            for amount in [.03, .06, .09]:
                page.mouse.move(px + sign * rect['width'] * amount, py + 8, steps=8)
                page.wait_for_timeout(240)
                pin = page.evaluate('window.__deepseek.renderParams.pin[2]')
                check(f'{side}: follows held drag {amount}', sign * pin > amount * .65)
            check(side + ': held drag stays active', page.evaluate("window.__deepseek.state.state==='pinching'&&window.__deepseek.drag.kind==='cheek'"))
            page.screenshot(path=str(OUT / (side + '-held.png')))
            page.mouse.move(px + sign * rect['width'] * .025, py - 9, steps=14)
            page.wait_for_timeout(350)
            check(side + ': reverses while held', abs(page.evaluate('window.__deepseek.renderParams.pin[2]')) < .035)
            page.mouse.up()
            page.wait_for_function('Math.abs(window.__deepseek.renderParams.pin[2])+Math.abs(window.__deepseek.renderParams.pin[3])<.001')
            check(side + ': releases and settles', page.evaluate("window.__deepseek.state.state==='idle'&&window.__deepseek.drag===null"))
            page.screenshot(path=str(OUT / (side + '-released.png')))
        check('both drags counted once', page.evaluate('window.__deepseek.state.pinchCount') == 2)
        check('no unhandled errors', not errors)
        browser.close()
finally:
    server.shutdown()
    (OUT / 'results.json').write_text(json.dumps({'checks': checks, 'errors': errors}, ensure_ascii=False, indent=2), encoding='utf8')
