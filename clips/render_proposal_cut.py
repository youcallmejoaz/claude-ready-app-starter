"""Renders clips/proposal_cut.mp4 from the Phase 3 clips and a local TTS voice.

Voice: Kokoro (am_michael, fallback am_adam), then Piper (en_US-ryan-high, fallback
en_US-lessac-medium); if neither works the cut is rendered silent. No paid TTS is used.

Usage: python clips/render_proposal_cut.py --kokoro-dir <dir with kokoro-v1.0.onnx and voices-v1.0.bin>
"""
import argparse
import json
import os
import subprocess
import sys

CLIPS = "clips"
WORK = "clips/.work/cut"
FPS = 30

SCENES = [
    {"clips": ["K01_problem"], "text": "You want to build your app with Claude Code. But without a solid foundation, every change is a risk, and Claude cannot see your business data."},
    {"clips": ["C01_signin_dashboard", "C02_sync_now"], "text": "This foundation gives you a real app with Google sign in, and your Google Ads and Analytics numbers synced into your own database every day."},
    {"clips": ["C03_staging_password", "K02_deploy_flow"], "text": "Every change goes to a password protected staging site first. Production only updates when you approve it."},
    {"clips": ["C04_console_best_cpa"], "text": "Now Claude can answer questions about your marketing, like which campaign gets the cheapest conversions, through a private connector."},
    {"clips": ["C05_console_delete_blocked", "C06_audit_row_close"], "text": "And it can only read. Anything that tries to change your data is blocked, and logged."},
    {"clips": ["C07_claude_md_docs"], "text": "Claude Code also gets a project guide, so every session starts knowing how your app works."},
    {"clips": ["K04_offer"], "text": "If you want your app set up like this, reply to this proposal, and we can map it to your stack."},
]
# A clip that is too long first loses up to this much idle time at its start, then its tail.
HEAD_TRIM = {"C01_signin_dashboard": 0.5, "C02_sync_now": 0.8, "C03_staging_password": 0.6}
# How a two-clip scene splits its time (default: by clip length). C02 needs room to show the sync finish.
SHARES = {("C01_signin_dashboard", "C02_sync_now"): [0.33, 0.67]}
CROSSFADE = 0.3
MAX_SPEED = 1.25
UI_SCENES = {1, 2, 3, 4, 5}  # zero-based: scenes 2 to 6 may breathe


def run(args):
    subprocess.run(args, check=True)


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def tts_kokoro(kokoro_dir):
    import soundfile as sf
    from kokoro_onnx import Kokoro

    k = Kokoro(os.path.join(kokoro_dir, "kokoro-v1.0.onnx"), os.path.join(kokoro_dir, "voices-v1.0.bin"))
    voice = "am_michael" if "am_michael" in k.get_voices() else "am_adam"
    for i, s in enumerate(SCENES):
        samples, rate = k.create(s["text"], voice=voice, speed=1.0, lang="en-us")
        sf.write(f"{WORK}/scene{i + 1}.wav", samples, rate)
    return f"Kokoro ({voice})"


def tts_piper():
    for model in ["en_US-ryan-high", "en_US-lessac-medium"]:
        try:
            for i, s in enumerate(SCENES):
                subprocess.run(["piper", "--model", model, "--output_file", f"{WORK}/scene{i + 1}.wav"], input=s["text"], text=True, check=True)
            return f"Piper ({model})"
        except Exception:
            continue
    raise RuntimeError("Piper unavailable")


def fit_clip(name, target, out):
    """Trim, hold the last frame, or speed up (max 1.25x) so the clip lasts exactly `target` seconds."""
    src = f"{CLIPS}/{name}.mp4"
    length = duration(src)
    speed = 1.0
    if length > target:
        speed = min(MAX_SPEED, length / target)
    played = length / speed
    vf = [f"setpts=PTS/{speed:.4f}"]
    ss = 0.0
    if played > target:  # still too long after the allowed speed-up: trim idle start, then the tail
        excess = (played - target) * speed
        ss = min(HEAD_TRIM.get(name, 0.0), excess)
        played = (length - ss) / speed
    vf.append(f"tpad=stop_mode=clone:stop_duration={max(0.0, target - played) + 0.1:.3f}")
    # Slow 5 percent push in on shots longer than 8 seconds.
    if target > 8:
        vf.append(f"scale=w='trunc(1920*(1+0.05*t/{target:.3f})/2)*2':h='trunc(1080*(1+0.05*t/{target:.3f})/2)*2':eval=frame:flags=lanczos,crop=1920:1080")
    vf.append(f"fps={FPS},setsar=1,format=yuv420p")
    run(["ffmpeg", "-y", "-v", "error", "-ss", f"{ss:.3f}", "-i", src, "-t", f"{target:.3f}", "-vf", ",".join(vf), "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "17", out])
    return {"clip": name, "source": round(length, 2), "target": round(target, 2), "speed": round(speed, 3), "trimmed_from_start": round(ss, 2)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kokoro-dir", default=os.environ.get("KOKORO_DIR", ""))
    ap.add_argument("--extra-breath", type=float, default=None, help="seconds added to UI scenes 2 to 6 (max 1.5)")
    a = ap.parse_args()
    os.makedirs(WORK, exist_ok=True)

    engine = None
    try:
        engine = tts_kokoro(a.kokoro_dir)
    except Exception as e:
        print(f"Kokoro failed: {e}", file=sys.stderr)
        try:
            engine = tts_piper()
        except Exception as e2:
            print(f"Piper failed: {e2}", file=sys.stderr)

    voice = [duration(f"{WORK}/scene{i + 1}.wav") if engine else 0 for i in range(len(SCENES))]
    natural = [sum(duration(f"{CLIPS}/{c}.mp4") for c in s["clips"]) for s in SCENES]
    base = [v + 0.5 if engine else n for v, n in zip(voice, natural)]

    # If the cut is short, let UI shots breathe (up to 1.5 s each, never past their own footage).
    breath = a.extra_breath
    if breath is None:
        breath = 0.0
        while sum(base) + breath * len(UI_SCENES) < 64 and breath < 1.5:
            breath = round(breath + 0.1, 2)
    lengths = [b + (min(breath, 1.5) if i in UI_SCENES else 0.0) for i, b in enumerate(base)]

    # A crossfade from a card into UI eats 0.3 s, so the card scene is extended by that much.
    fades = [i for i in range(len(SCENES) - 1) if SCENES[i]["clips"][-1].startswith("K") and SCENES[i + 1]["clips"][0].startswith("C")]
    report = {"engine": engine or "silent", "breath": breath, "scenes": []}
    segs = []
    for i, s in enumerate(SCENES):
        total = lengths[i] + (CROSSFADE if i in fades else 0.0)
        nat = [duration(f"{CLIPS}/{c}.mp4") for c in s["clips"]]
        weights = SHARES.get(tuple(s["clips"]), [n / sum(nat) for n in nat])
        shares = [total * w for w in weights]
        parts = []
        for j, (c, t) in enumerate(zip(s["clips"], shares)):
            out = f"{WORK}/s{i + 1}_{j}.mp4"
            parts.append(fit_clip(c, t, out))
            segs.append((out, t))
        report["scenes"].append({"scene": i + 1, "voice": round(voice[i], 2), "length": round(lengths[i], 2), "parts": parts})

    # Video: hard cuts everywhere except the card-to-UI crossfades.
    inputs, filters = [], []
    for p, _ in segs:
        inputs += ["-i", p]
    # Same timebase on every input, or xfade refuses to join concat output with a raw input.
    filters += [f"[{k}:v]setsar=1,settb=AVTB,setpts=PTS-STARTPTS[i{k}]" for k in range(len(segs))]
    label, t = "[i0]", segs[0][1]
    seg_scene = []
    for i, s in enumerate(SCENES):
        seg_scene += [i] * len(s["clips"])
    for k in range(1, len(segs)):
        prev_scene, this_scene = seg_scene[k - 1], seg_scene[k]
        out = f"[v{k}]"
        if prev_scene != this_scene and prev_scene in fades:
            filters.append(f"{label}[i{k}]xfade=transition=fade:duration={CROSSFADE}:offset={t - CROSSFADE:.3f}{out}")
            t = t - CROSSFADE + segs[k][1]
        else:
            filters.append(f"{label}[i{k}]concat=n=2:v=1:a=0{out}")
            t = t + segs[k][1]
        label = out
    video_len = t

    # Audio: each scene's narration starts with its scene and is padded to the scene length.
    if engine:
        a_in, a_f = [], []
        for i in range(len(SCENES)):
            a_in += ["-i", f"{WORK}/scene{i + 1}.wav"]
            a_f.append(f"[{len(segs) + i}:a]aresample=48000,apad=whole_dur={lengths[i]:.3f}[a{i}]")
        a_f.append("".join(f"[a{i}]" for i in range(len(SCENES))) + f"concat=n={len(SCENES)}:v=0:a=1,highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[aout]")
        maps = ["-map", label, "-map", "[aout]", "-c:a", "aac", "-b:a", "160k", "-ar", "48000"]
    else:
        a_in, a_f, maps = [], [], ["-map", label]
    run(["ffmpeg", "-y", "-v", "error", *inputs, *a_in, "-filter_complex", ";".join(filters + a_f), *maps,
         "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(FPS),
         "-t", f"{video_len:.3f}", "-movflags", "+faststart", f"{CLIPS}/proposal_cut.mp4"])

    # One frame per scene, from the middle of the scene.
    os.makedirs(f"{CLIPS}/proposal_cut_frames", exist_ok=True)
    start = 0.0
    for i, length in enumerate(lengths):
        run(["ffmpeg", "-y", "-v", "error", "-ss", f"{start + length / 2:.2f}", "-i", f"{CLIPS}/proposal_cut.mp4", "-frames:v", "1", f"{CLIPS}/proposal_cut_frames/scene{i + 1}.png"])
        start += length
    report["total"] = round(duration(f"{CLIPS}/proposal_cut.mp4"), 2)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
