"""Decode/play bundled clips in Chromium; host callbacks are simulated."""
import argparse
import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--build',type=Path,default=ROOT/'dist')
    parser.add_argument('--output',type=Path,default=ROOT/'test-results/browser-voice')
    args=parser.parse_args();args.build=args.build.resolve();args.output.mkdir(parents=True,exist_ok=True)
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self,*args): pass
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(args.build)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    origin=f'http://127.0.0.1:{server.server_port}'
    checks=[];errors=[];requests=[];complete=False
    def check(name,value):
        checks.append({'name':name,'passed':bool(value)})
        assert value,name
        print('PASS '+name,flush=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--autoplay-policy=no-user-gesture-required','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        try:
            page=browser.new_page(viewport={'width':1920,'height':1080})
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('request',lambda r:requests.append(r.url))
            page.add_init_script("""
              Math.random=()=>0.3;
              window.voiceInputs={};
              window.wallpaperRegisterAudioListener=callback=>window.voiceInputs.audio=callback;
            """)
            page.goto(origin+'/?test=1',wait_until='networkidle')
            page.wait_for_function('window.__deepseek?.ready')
            page.locator('#loading').wait_for(state='hidden')
            check('voice defaults on at 55 percent',page.evaluate('window.__deepseek.settings.voiceEnabled && window.__deepseek.settings.voiceVolume===55'))
            page.evaluate('window.__deepseek.advance(4100)')
            page.wait_for_function("window.__deepseek.voice.status==='playing'")
            page.wait_for_function('window.__deepseek.voice.time>.15',timeout=10000)
            snapshot=page.evaluate('window.__deepseek.voice')
            print('Playback snapshot '+json.dumps(snapshot,ensure_ascii=False),flush=True)
            check('real MP3 is decoded and playback advances',snapshot['time']>.1 and snapshot['source'].endswith('.mp3'))
            check('spoken source matches the visible bubble',page.evaluate('window.__deepseek.voice.key.endsWith(document.getElementById("chatterText").textContent)'))
            starts=snapshot['starts']
            page.evaluate('window.wallpaperPropertyListener.applyUserProperties({voicevolume:{value:23}})')
            check('live volume changes without restarting the line',page.evaluate('window.__deepseek.voice.volume===.23') and page.evaluate('window.__deepseek.voice.starts')==starts)
            # Feeding a synthetic loopback signal while actual speech is playing
            # must not replace the idle bubble with a music bubble.
            for _ in range(8):
                page.evaluate('window.voiceInputs.audio(new Array(128).fill(.8))')
                page.wait_for_timeout(65)
            check('own playback cannot trigger a music portrait',not page.evaluate('window.__deepseek.music.listening'))
            page.evaluate('window.wallpaperPropertyListener.setPaused(true)')
            paused=page.evaluate('window.__deepseek.voice.time');page.wait_for_timeout(250)
            check('host pause freezes real audio position',abs(page.evaluate('window.__deepseek.voice.time')-paused)<.03)
            page.evaluate('window.wallpaperPropertyListener.setPaused(false)')
            page.wait_for_timeout(150)
            check('host resume continues playback',page.evaluate('window.__deepseek.voice.time')>paused)
            page.locator('#closeChatter').click()
            check('closing the bubble releases the audio',page.evaluate('!window.__deepseek.voice.active && !window.__deepseek.voice.source'))
            page.locator('#studyButton').click();page.evaluate('window.__deepseek.advance(1400)')
            page.wait_for_function("window.__deepseek.voice.status==='playing'")
            check('study uses its corresponding voice line',page.evaluate("window.__deepseek.voice.key.startsWith('study:')"))
            page.evaluate('window.wallpaperPropertyListener.applyUserProperties({voiceenabled:{value:false}})')
            check('disable mutes immediately without hiding text',page.evaluate("!window.__deepseek.voice.active && !document.getElementById('chatterBubble').hidden"))
            page.locator('#settingsButton').click()
            check('settings contain a voice toggle and slider',page.locator('[data-setting=voiceEnabled]').count()==1 and page.locator('[data-setting=voiceVolume]').count()==1)
            page.locator('[data-setting=voiceEnabled]').check()
            page.locator('[data-setting=voiceVolume]').fill('37')
            page.screenshot(path=str(args.output/'voice-settings.png'))
            page.locator('#closeSettings').click()
            page.reload(wait_until='networkidle');page.wait_for_function('window.__deepseek?.ready')
            check('voice settings survive reload',page.evaluate('window.__deepseek.settings.voiceEnabled && window.__deepseek.settings.voiceVolume===37'))
            page.evaluate('window.__deepseek.advance(4100)')
            page.wait_for_function("window.__deepseek.voice.status==='playing'")
            page.screenshot(path=str(args.output/'voice-idle.png'))
            check('only bundled resources were requested',all(url.startswith(origin+'/') for url in requests))
            check('no page exceptions',not errors)
            page.close()
            file_page=browser.new_page()
            file_page.goto((args.build/'index.html').as_uri()+'?test=1',wait_until='networkidle')
            file_page.wait_for_function('window.__deepseek?.ready')
            file_page.evaluate('window.__deepseek.advance(4100)')
            file_page.wait_for_function("window.__deepseek.voice.status==='playing'")
            file_page.wait_for_function('window.__deepseek.voice.time>.15',timeout=10000)
            check('local file loading also plays bundled voice',file_page.evaluate('window.__deepseek.voice.time')>.05)
            complete=True
        finally:
            browser.close();server.shutdown();server.server_close()
            (args.output/'report.json').write_text(json.dumps({'pass':complete,'checks':checks,'errors':errors,'requests':requests,'evidence':'Actual MP3 playback in Chromium, simulated host pause/audio callbacks; no native Wallpaper Engine assertion'},ensure_ascii=False,indent=2),encoding='utf8')

if __name__=='__main__':main()
