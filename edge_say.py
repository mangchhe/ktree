"""Edge TTS 한 묶음 굽기 — edge-say.mjs 가 부른다 (uvx --from edge-tts python edge_say.py).

stdin : [{"text", "voice", "out"}]   → out 에 mp3 를 쓴다
stdout: [{"ok", "words":[{t,d,w}] (ms), "err"}]

왜 파이썬인가: 2026-10-25 에 Edge 가 토큰(Sec-MS-GEC v2)을 바꿔 node 의 msedge-tts 2.1.0
(최신)가 'Unexpected server response: 200' 으로 전부 막혔다. 파이썬 edge-tts 는 바로 따라간다.
"""
import asyncio, json, shutil, subprocess, sys
import edge_tts

FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"

async def one(it):
    for attempt in range(3):
        try:
            words, audio = [], bytearray()
            c = edge_tts.Communicate(it["text"], it["voice"], boundary="WordBoundary")
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
    print(json.dumps(await asyncio.gather(*map(lim, items))))

asyncio.run(main())
