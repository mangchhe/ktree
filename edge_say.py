"""Edge TTS 한 묶음 굽기 — edge-say.mjs 가 부른다 (uvx --from edge-tts python edge_say.py).

stdin : [{"text", "voice", "out"}]   → out 에 mp3 를 쓴다
stdout: [{"ok", "words":[{t,d,w}] (ms), "err"}]

왜 파이썬인가: 2026-10-25 에 Edge 가 토큰(Sec-MS-GEC v2)을 바꿔 node 의 msedge-tts 2.1.0
(최신)가 'Unexpected server response: 200' 으로 전부 막혔다. 파이썬 edge-tts 는 바로 따라간다.
"""
import asyncio, json, os, re, shutil, subprocess, sys, time
import edge_tts

FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"

# EDGE_VERIFY=1 이면 구운 걸 whisper 로 다시 받아 적어 원문과 맞춰 본다 (밤 보급이 켠다).
# 왜: 2026-10-26 다국어 음성이 "Hi, welcome." 을 러시아어로 읽었는데, 파일은 멀쩡히 생겨서
# 아무 점검에도 안 걸렸다. ponytail: 받아쓰기라 '다른 언어로 읽음·뭉개짐'은 잡지만
# 억양만 어색한 건(프랑스식 urgent) 못 잡는다.
WHISPER = shutil.which("whisper-cli")
MODEL = os.path.expanduser("~/.cache/whisper/ggml-small.bin")
VLOG = os.path.expanduser("~/Library/Logs/ktree-tts-verify.log")
words_of = lambda t: re.findall(r"[a-z0-9']+", t.lower().replace("’", "'"))

def missing(text, heard):
    got = set(words_of(heard))
    return [w for w in words_of(text) if w not in got]

# 받아쓰기도 가끔 한 단어는 틀린다 — 두 단어 이상 빠지면(한 단어짜리는 그 하나가) 경고
bad = lambda text, heard: len(missing(text, heard)) >= min(2, len(words_of(text)))

def verify(text, path):
    wav = path + ".wav"
    subprocess.run([FFMPEG, "-loglevel", "error", "-y", "-i", path, "-ar", "16000", "-ac", "1", wav], check=True)
    heard = subprocess.run([WHISPER, "-m", MODEL, "-l", "en", "-nt", "-np", "-f", wav],
                           capture_output=True, text=True).stdout.strip()
    os.remove(wav)
    if bad(text, heard):
        line = f"{time.strftime('%Y-%m-%d %H:%M')} ⚠ 음성이 원문과 다름: {text!r} → 들린 것 {heard!r}"
        print(line, file=sys.stderr)
        with open(VLOG, "a") as f: f.write(line + "\n")

async def one(it):
    for attempt in range(3):
        try:
            words, audio = [], bytearray()
            # 🔴 Multilingual 음성은 언어를 글자로 추측한다 — 파이썬 edge-tts 로 바꾼 뒤
            # "Hi, welcome." 이 러시아어("Балкума")로 읽혔다. 같은 사람의 영어 전용 음성으로 고정한다.
            voice = re.sub(r"^(en-[A-Z]{2}-\w+?)MultilingualNeural$", r"\1Neural", it["voice"])
            c = edge_tts.Communicate(it["text"], voice, boundary="WordBoundary")
            async for ch in c.stream():
                if ch["type"] == "audio":
                    audio += ch["data"]
                elif ch["type"] == "WordBoundary":
                    words.append({"t": round(ch["offset"] / 1e4), "d": round(ch["duration"] / 1e4), "w": ch["text"]})
            if len(audio) < 500:
                raise RuntimeError("오디오가 비정상적으로 작다")
            # 🔴 96kbps 로 다시 굽는다. 파이썬 edge-tts 는 48kbps 고정인데, 앱(어휘 훑기 통짜 트랙)과
            # eng-gen 은 **바이트 = 시간** 을 96kbps 로 계산한다. 섞이면 하이라이트가 2배로 밀린다.
            # xing·id3 를 빼야 이어 붙였을 때 중간에 머리 프레임이 안 낀다.
            subprocess.run([FFMPEG, "-loglevel", "error", "-y", "-f", "mp3", "-i", "pipe:0",
                            "-ar", "24000", "-ac", "1", "-b:a", "96k", "-write_xing", "0",
                            "-id3v2_version", "0", it["out"]], input=bytes(audio), check=True)
            return {"ok": True, "words": words}
        except Exception as e:  # 429·끊김은 잠깐 쉬고 다시
            err = str(e)
            await asyncio.sleep(2 * (attempt + 1))
    return {"ok": False, "err": err}

async def main():
    items = json.load(sys.stdin)
    sem = asyncio.Semaphore(4)
    async def lim(it):
        async with sem:
            return await one(it)
    res = await asyncio.gather(*map(lim, items))
    if os.environ.get("EDGE_VERIFY") and WHISPER and os.path.exists(MODEL):
        for it, r in zip(items, res):
            if r["ok"] and re.search(r"[A-Za-z]", it["text"]) and it["voice"].startswith("en-"):
                verify(it["text"], it["out"])
    print(json.dumps(res))

if sys.argv[1:] == ["--selftest"]:
    assert not bad("Hi, welcome.", "Hi, welcome.")
    assert bad("Hi, welcome. Can I have your name and driver's license?", "Балкума. Can I have your name and driver's license?")
    assert bad("urgent", "Ujong.")
    assert not bad("I don't know Minsu", "I don’t know Minsoo.")   # 한 단어 오타는 봐준다
    print("ok"); sys.exit()

asyncio.run(main())
