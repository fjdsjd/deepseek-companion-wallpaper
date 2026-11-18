"""Offline authoring only: render a checked Feiyu package with a local CosyVoice runtime.

The wallpaper ships only MP3 files plus a manifest, never this model or Python.
Run with the Python environment installed for the pinned CosyVoice revision.
"""
import argparse
import hashlib
import json
import math
import os
import re
from pathlib import Path
import subprocess
import sys
import time


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(8*1024*1024), b''): digest.update(block)
    return digest.hexdigest()


def recipe_for(catalog, row, selected):
    speed = float(row.get('speed', 1.0))
    assert .8 <= speed <= 1.2, 'Speech rate outside safe authoring range'
    mode = catalog.get('mode', 'zero_shot')
    instruction = row.get('instruction', '')
    if mode != 'zero_shot':
        assert instruction, 'An emotional voice needs a direction'
    recipe = {'mode': mode, 'instruction': instruction, 'speed': speed,
              'reference': selected['reference_sha256'], 'checkpoint': selected['llm_sha256'],
              'revision': catalog.get('directionRevision', 'neutral-v1')}
    digest = hashlib.sha256(json.dumps(recipe, sort_keys=True, ensure_ascii=False).encode('utf8')).hexdigest()
    return recipe, digest


def mastering_for(catalog):
    settings = catalog.get('mastering', {'revision': 'natural-v1', 'pitchSemitones': 0,
                                       'formantSemitones': 0, 'tempo': 1})
    assert isinstance(settings.get('revision'), str) and settings['revision'], 'Missing mastering revision'
    for key, low, high in [('pitchSemitones', -4, 4), ('formantSemitones', -2, 2), ('tempo', .95, 1.08)]:
        value = settings[key]
        assert isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and low <= value <= high, 'Invalid mastering: ' + key
    # This recipe describes offline processing, never browser playbackRate.
    digest = hashlib.sha256(json.dumps({'algorithm': 'independent-pitch-formant-crisp-v1', **settings},
                                       sort_keys=True, ensure_ascii=False).encode('utf8')).hexdigest()
    return settings, digest


def encode_clip(raw, destination, mastering):
    probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams',
                                                '-show_format', '-of', 'json', str(raw)], text=True))
    rate = int(probe['streams'][0]['sample_rate'])
    filters = []
    if mastering['pitchSemitones'] or mastering['formantSemitones'] or mastering['tempo'] != 1:
        shifted_rate = round(rate * 2 ** (mastering['formantSemitones'] / 12))
        formant_ratio = shifted_rate / rate
        pitch_ratio = 2 ** (mastering['pitchSemitones'] / 12) / formant_ratio
        tempo_ratio = mastering['tempo'] / formant_ratio
        # First adjust resonance, then independently correct pitch and duration.
        # Always start from the lossless WAV so repeated edits never stack artifacts.
        filters += [f'asetrate={shifted_rate}', f'aresample={rate}',
                    f'rubberband=pitch={pitch_ratio:.10f}:tempo={tempo_ratio:.10f}:formant=preserved:transients=crisp:pitchq=quality']
    filters += ['loudnorm=I=-19:TP=-2:LRA=11', 'apad=pad_dur=0.08']
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(raw),
                    '-af', ','.join(filters), '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame',
                    '-b:a', '64k', '-map_metadata', '-1', str(destination)], check=True)
    info = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
                                               'format=duration', '-of', 'json', str(destination)], text=True))
    return round(float(info['format']['duration']) * 1000)


def publish_clip(args, manifest, row, raw, recipe_hash, mastering, mastering_hash):
    destination = args.output / (row['id'] + '.mp3')
    duration = encode_clip(raw, destination, mastering)
    manifest['clips'][row['text']] = {'file': 'assets/voice/' + destination.name, 'durationMs': duration,
        'spokenText': row['spokenText'], 'mood': row.get('mood', 'neutral'), 'direction': row.get('instruction', ''),
        'recipeSha256': recipe_hash, 'masteringSha256': mastering_hash}
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', required=True, type=Path)
    parser.add_argument('--runtime', required=True, type=Path)
    parser.add_argument('--catalog', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--raw', required=True, type=Path)
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--limit', type=int)
    parser.add_argument('--remaster-only', action='store_true', help='Re-encode matching lossless cached speech without loading the TTS model or using CUDA')
    parser.add_argument('--seeds', nargs='+', type=int, default=[42,123,2026,77], help='Ordered synthesis attempts for new clips')
    args = parser.parse_args()
    for name in ['package','runtime','catalog','output','raw','manifest']:
        setattr(args,name,getattr(args,name).resolve())
    package, repo = args.package.resolve(), args.runtime.resolve()
    catalog = json.loads(args.catalog.read_text(encoding='utf8'))
    release = json.loads((package/'manifest.json').read_text(encoding='utf-8-sig'))
    checks = json.loads((package/'files_sha256.json').read_text(encoding='utf-8-sig'))
    for name, entry in checks.items():
        file = (package/name).resolve()
        assert file.is_relative_to(package) and sha(file) == entry['sha256'], 'Model package changed: '+name
    actual = subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip()
    assert actual == release['runtime']['commit'], 'CosyVoice revision mismatch'
    args.output.mkdir(parents=True,exist_ok=True)
    args.raw.mkdir(parents=True,exist_ok=True)
    selected = release['styles'][catalog['style']]
    mode = catalog.get('mode', 'zero_shot')
    assert mode in ['zero_shot', 'instruct2', 'directed_zero_shot'], 'Unsupported generation mode'
    mastering, mastering_hash = mastering_for(catalog)
    manifest = {'schema': 1, 'voice': 'feiyu', 'style': catalog['style'],
                'source': 'https://github.com/Esmerubphire/astrbot_plugin_feiyu_voice',
                'checkpointSha256': selected['llm_sha256'], 'clips': {},
                'directionRevision': catalog.get('directionRevision', 'neutral-v1'), 'mode': mode,
                'mastering': mastering, 'masteringSha256': mastering_hash}
    rows = catalog['lines'][:args.limit] if args.limit else catalog['lines']
    if args.remaster_only:
        for index, row in enumerate(rows):
            raw = args.raw / (row['id'] + '.wav')
            metadata = json.loads((args.raw / (row['id'] + '.json')).read_text(encoding='utf8'))
            _, recipe_hash = recipe_for(catalog, row, selected)
            assert metadata.get('spokenText') == row['spokenText'] and metadata.get('recipeSha256') == recipe_hash and metadata.get('rawSha256') == sha(raw), 'Lossless cache does not match: ' + row['id']
            publish_clip(args, manifest, row, raw, recipe_hash, mastering, mastering_hash)
            print(f"[{index + 1}/{len(rows)}] remastered {row['id']} {row['spokenText']}", flush=True)
        print('Completed ' + str(len(manifest['clips'])) + ' clips from verified lossless speech', flush=True)
        return
    os.environ.update(HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',OMP_NUM_THREADS='4')
    sys.path[:0] = [str(repo),str(repo/'third_party/Matcha-TTS')]
    os.chdir(repo)
    import numpy as np
    import soundfile as sf
    import torch
    import onnxruntime as ort
    from cosyvoice.cli.cosyvoice import AutoModel
    from cosyvoice.utils.common import set_all_random_seed
    assert torch.cuda.is_available(), 'CUDA unavailable'
    torch.set_num_threads(4)
    print('Loading Feiyu '+catalog['style']+' on '+torch.cuda.get_device_name(0),flush=True)
    original_session = ort.InferenceSession
    def cpu_session(*a,**kw):
        kw['providers']=['CPUExecutionProvider']
        return original_session(*a,**kw)
    ort.InferenceSession=cpu_session
    # The catalog already contains normalized Chinese. Skip optional external
    # frontends, whose constructors otherwise try to download more resources.
    # CosyVoice3 supports native normalization; do not mutate the installed SDK.
    normalizers={name:sys.modules.get(name) for name in ['ttsfrd','wetext']}
    for name in normalizers:sys.modules[name]=None
    try:
        voice=AutoModel(model_dir=str(package/release['base_model_dir']),fp16=False,load_trt=False,load_vllm=False)
    finally:
        ort.InferenceSession=original_session
        for name,module in normalizers.items():
            if module is None:sys.modules.pop(name,None)
            else:sys.modules[name]=module
    state=torch.load(package/selected['llm_checkpoint'],map_location='cpu',weights_only=True)
    voice.model.llm.load_state_dict(state,strict=True)
    del state
    voice.model.llm.eval()
    # Very short interjections otherwise may end before any audible syllable.
    # CosyVoice3 has several stop token IDs; guard all of them for 0.5 seconds.
    sampler = voice.model.llm.sampling_ids
    minimum_tokens = 0
    def sample_short_text(scores, decoded_tokens, sampling, ignore_eos=True):
        if len(decoded_tokens) < minimum_tokens:
            scores[voice.model.llm.stop_token_ids] = -float('inf')
        return sampler(scores, decoded_tokens, sampling, ignore_eos=ignore_eos)
    voice.model.llm.sampling_ids = sample_short_text
    failures=[]
    for index, row in enumerate(rows):
        started=time.monotonic()
        raw=args.raw/(row['id']+'.wav')
        result=args.raw/(row['id']+'.json')
        recipe, recipe_hash = recipe_for(catalog, row, selected)
        speed, instruction = recipe['speed'], recipe['instruction']
        # Resume only results generated for these exact words and weights.
        valid=False
        if raw.exists() and result.exists():
            old=json.loads(result.read_text())
            valid=old.get('spokenText')==row['spokenText'] and old.get('recipeSha256')==recipe_hash and old.get('rawSha256')==sha(raw)
        if not valid:
            minimum_tokens = 12 if len(re.findall(r'[\u4e00-\u9fff]',row['spokenText'])) <= 2 else 0
            audio=None
            for seed in args.seeds:
                set_all_random_seed(seed)
                try:
                    with torch.inference_mode():
                        reference=str(package/selected['reference_audio'])
                        prompt='You are a helpful assistant. '+instruction+'<|endofprompt|>'
                        if mode=='instruct2':
                            generated=voice.inference_instruct2(row['spokenText'],prompt,reference,stream=False,speed=speed,text_frontend=True)
                        else:
                            prompt=(prompt if mode=='directed_zero_shot' else release['inference']['prompt_prefix'])+selected['reference_text']
                            generated=voice.inference_zero_shot(row['spokenText'],prompt,reference,stream=False,speed=speed,text_frontend=True)
                        chunks=[part['tts_speech'].detach().cpu().numpy()[0] for part in generated]
                except RuntimeError as error:
                    if 'Kernel size' not in str(error):raise
                    print('Retry too-short synthesis '+row['id']+' seed='+str(seed),flush=True)
                    continue
                candidate=np.concatenate(chunks) if chunks else np.zeros(0)
                if len(candidate)>voice.sample_rate*.15 and len(candidate)<voice.sample_rate*22 and np.isfinite(candidate).all() and np.max(abs(candidate))>1e-4:
                    audio=candidate;break
                print('Retry invalid synthesis '+row['id']+' seed='+str(seed),flush=True)
            if audio is None:
                failures.append(row);print('FAILED '+row['id'],flush=True);continue
            sf.write(raw,audio,voice.sample_rate,subtype='FLOAT')
            result.write_text(json.dumps({**row,'checkpointSha256':selected['llm_sha256'],
                'rawSha256':sha(raw),'sampleRate':voice.sample_rate,'seconds':len(audio)/voice.sample_rate,
                'seed':seed,'minimumSpeechTokens':minimum_tokens,'recipe':recipe,'recipeSha256':recipe_hash,
                'elapsed':time.monotonic()-started},ensure_ascii=False,indent=2),encoding='utf8')
        publish_clip(args, manifest, row, raw, recipe_hash, mastering, mastering_hash)
        print(f"[{index+1}/{len(rows)}] {row['id']} {row['spokenText']} ({time.monotonic()-started:.1f}s)",flush=True)
    (args.raw/'failures.json').write_text(json.dumps(failures,ensure_ascii=False,indent=2),encoding='utf8')
    print('Completed '+str(len(manifest['clips']))+' clips; failed '+str(len(failures)),flush=True)
    if failures:raise SystemExit(2)


if __name__=='__main__': main()
