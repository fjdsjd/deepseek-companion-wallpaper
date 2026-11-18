"""Real Chromium GPU failure, sandbox, media and cheek deformation regressions.

Run after npm run build. Fault injection is test-only; no native WE claim.
"""
import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'test-results' / 'renderer'


class Handler(SimpleHTTPRequestHandler):
    cors = True
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript'}

    def log_message(self, *args):
        pass

    def copyfile(self, source, outputfile):
        try:
            super().copyfile(source, outputfile)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass  # Browser cancelled a CORS-rejected image transfer.

    def end_headers(self):
        if self.cors:
            self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def translate_path(self, path):
        if path.startswith('/__source__/'):
            return str(ROOT / 'src' / Path(path).name)
        return super().translate_path(path)

    def do_GET(self):
        if self.path == '/sandbox':
            body = b'<iframe sandbox="allow-scripts" style="width:1260px;height:780px;border:0" src="/?test=1"></iframe>'
        elif self.path == '/rig':
            body = b'<style>body{margin:0;background:#333}#stage{position:relative;width:1000px;height:1000px}canvas,img{position:absolute;width:100%;height:100%}</style><div id="stage"><canvas id="avatar"></canvas><img id="fallback" hidden></div>'
        else:
            return super().do_GET()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()
        self.wfile.write(body)


INIT = """
  window.framesDrawn=0;
  const raf=requestAnimationFrame;
  window.requestAnimationFrame=f=>raf(t=>{window.framesDrawn++;f(t)});
  try {localStorage.setItem('deepseek-room.standalone.settings.v1',JSON.stringify({voiceEnabled:false}));}catch(_){}
"""
FAULTS = {
    'no-webgl': "const g=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){return t==='webgl'?null:g.call(this,t,...a)};",
    'upload-denied': "const u=WebGLRenderingContext.prototype.texImage2D;WebGLRenderingContext.prototype.texImage2D=function(...a){if(a.length===6)throw new DOMException('Injected upload denial','SecurityError');return u.apply(this,a)};",
    'shader-failed': "WebGLRenderingContext.prototype.getShaderParameter=()=>false;WebGLRenderingContext.prototype.getShaderInfoLog=()=>'Injected shader failure';",
    'driver-oom': "WebGLRenderingContext.prototype.getError=()=>1285;",
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    servers = []
    for cors in [True, False]:
        cls = type('CorsHandler', (Handler,), {'cors': cors})
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(cls, directory=str(ROOT / 'dist')))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        servers.append(server)
    origins = [f'http://127.0.0.1:{s.server_port}' for s in servers]
    results = []

    def check(name, passed, **details):
        results.append(dict(name=name, passed=bool(passed), **details))
        print(('PASS ' if passed else 'FAIL ') + name, flush=True)
        assert passed, name

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            for mode in ['normal', 'sandbox-cors', 'sandbox-local', *FAULTS, 'context-loss', 'missing-blink', 'file']:
                page = browser.new_page(viewport={'width': 1280, 'height': 800})
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.add_init_script(INIT + FAULTS.get(mode, ''))
                if mode == 'missing-blink':
                    page.route('**/blink.png', lambda route: route.fulfill(status=404, body='missing'))
                origin = origins[1] if mode == 'sandbox-local' else origins[0]
                url = (ROOT / 'dist/index.html').as_uri() + '?test=1' if mode == 'file' else origin + ('/sandbox' if mode.startswith('sandbox') else '/?test=1')
                page.goto(url, wait_until='networkidle')
                frame = page.frames[1] if mode.startswith('sandbox') else page.main_frame
                frame.wait_for_function('window.__deepseek?.ready')
                frame.locator('#loading').wait_for(state='hidden')
                if mode == 'context-loss':
                    frame.locator('#studyButton').click()
                    frame.evaluate("window.sentinel='still here';window.lostExtension=document.querySelector('#avatar').getContext('webgl').getExtension('WEBGL_lose_context');window.lostExtension.loseContext()")
                    frame.wait_for_function("window.__deepseek.backend==='image-fallback'")
                    frame.evaluate('window.lostExtension.restoreContext()')
                    page.wait_for_timeout(300)
                    check('context loss preserves study without reloading', frame.evaluate("window.sentinel==='still here'&&window.__deepseek.state.state==='study'"))
                    frame.locator('#studyButton').click()
                fallback = mode in FAULTS or mode in ['sandbox-local', 'context-loss', 'file']
                backend = frame.evaluate('window.__deepseek.backend')
                check(mode + ': renderer', backend == ('image-fallback' if fallback else 'webgl-mesh'), backend=backend)
                count = frame.evaluate('window.framesDrawn')
                page.wait_for_timeout(300)
                check(mode + ': animation clock continues', frame.evaluate('window.framesDrawn') > count + 2)
                if fallback:
                    check(mode + ': visible portrait and no GPU textures', frame.locator('#fallback').is_visible() and frame.evaluate('window.__deepseek.resources.textureBytes') == 0)
                frame.locator('#feedButton').click()
                frame.wait_for_function("window.__deepseek.frame.startsWith('feeding_')")
                check(mode + ': feeding remains interactive', frame.evaluate("window.__deepseek.state.state==='feeding'"))
                check(mode + ': no unhandled errors', not errors, errors=errors)
                if mode in ['normal', 'sandbox-local']:
                    page.screenshot(path=str(OUT / (mode + '.png')))
                page.close()

            page = browser.new_page(viewport={'width': 1280, 'height': 800})
            page.add_init_script(INIT + """
              window.mockHost={};
              for(const [api,key] of [['MediaProperties','properties'],['MediaStatus','status'],['MediaPlayback','playback']])
                window['wallpaperRegister'+api+'Listener']=fn=>window.mockHost[key]=fn;
            """)
            page.goto(origins[0] + '/?test=1', wait_until='networkidle')
            page.wait_for_function('window.__deepseek?.ready')
            page.evaluate("mockHost.status({enabled:true});mockHost.properties({title:'550W',artist:'阿鲲'});mockHost.playback({state:'playing'})")
            page.wait_for_function("document.querySelector('#trackTitle').textContent==='550W'")
            page.evaluate("mockHost.playback({state:'stopped'})")
            page.locator('#musicPanel').wait_for(state='hidden')
            page.evaluate("mockHost.playback({state:'playing'})")
            page.locator('#musicPanel').wait_for(state='visible')
            check('media stop/resume restores title without repeated properties', page.locator('#trackTitle').inner_text() == '550W')
            page.close()

            page = browser.new_page(viewport={'width': 1000, 'height': 1000})
            page.goto(origins[0] + '/rig')
            pixel_results = page.evaluate("""async()=>{
              const {AvatarRenderer}=await import('/__source__/renderer.mjs');
              const renderer=new AvatarRenderer(document.querySelector('canvas'),document.querySelector('img'));
              await renderer.load(['idle','blink','pinch_left','pinch_right']);
              await Promise.all(['pinch_left','pinch_right'].map(n=>renderer.cache.request(n)));
              const p={dt:33,motion:0,look:[0,0],head:[0,0],pin:[.431,.521,0,0],hug:0,draggingCheek:true};
              const gl=renderer.gl, capture=()=>{const a=new Uint8Array(1000*1000*4);gl.readPixels(0,0,1000,1000,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;};
              const results=[];
              for(const [side,x,y,dx] of [['left',.431,.521,-.09],['right',.607,.514,.09]]){
                p.side=side;p.pin=[x,y,0,0];
                for(let i=0;i<100;i++)renderer.draw(10000+i*33,'pinching',p);
                const before=capture();p.pin=[x,y,dx,.008];
                for(let i=0;i<100;i++)renderer.draw(20000+i*33,'pinching',p);
                const after=capture();let changed=0,outside=0,hairChanged=0,hairChecked=0;
                for(let i=0;i<before.length;i+=4){
                  const px=(i/4)%1000/1000,py=1-Math.floor(i/4/1000)/1000;
                  const delta=Math.max(...[0,1,2,3].map(c=>Math.abs(before[i+c]-after[i+c])));
                  if(py>.48&&py<.57&&((px>.30&&px<.39)||(px>.65&&px<.75))&&before[i]-before[i+2]<12&&before[i+3]>200){hairChecked++;if(delta>1)hairChanged++;}
                  if(delta===0)continue;
                  changed++;
                  if(px<.26||px>.78||py<.47||py>.63)outside++;
                }
                results.push({side,changed,outside,hairChecked,hairChanged});
                if(side==='left')window.leftPinchPreview=document.querySelector('canvas').toDataURL();
              }
              window.rigRenderer=renderer;return results;
            }""")
            for result in pixel_results:
                check(result['side'] + ': actual GPU cheek pixels move with stationary upper hair and body layers', result['changed'] > 100 and result['outside'] == 0 and result['hairChecked'] > 1000 and result['hairChanged'] == 0, **result)
            page.screenshot(path=str(OUT / 'cheek-rig.png'))
            browser.close()
    finally:
        for server in servers:
            server.shutdown()
        (OUT / 'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf8')


if __name__ == '__main__':
    main()
