#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/${TLGEN:-make_timeline.py} >/dev/null
python3 scripts/mix.py
# two-pass loudness normalisation to -14 LUFS / -1.5 dBTP (YouTube)
J=$(ffmpeg -hide_banner -i work/mix_pre.wav -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
g(){ echo "$J" | python3 -c "import json,sys;print(json.load(sys.stdin)['$1'])"; }
ffmpeg -y -v error -i work/mix_pre.wav -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(g input_i):measured_TP=$(g input_tp):measured_LRA=$(g input_lra):measured_thresh=$(g input_thresh):offset=$(g target_offset):linear=true,aresample=48000" -ar 48000 work/mix.wav
python3 scripts/${RENDER:-render.py} | ffmpeg -y -v error -f rawvideo -pix_fmt rgb24 -s 1080x1920 -r 30 -i - -i work/mix.wav \
  -map 0:v -map 1:a -c:v libx264 -preset slow -crf 21 -tune grain -maxrate 12M -bufsize 24M -profile:v high -level 4.2 -pix_fmt yuv420p -g 60 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -c:a aac -b:a 256k -ar 48000 -t 60 -movflags +faststart \
  -metadata title="Atatürk'ün Son Sözü" "${OUT:-out.mp4}"
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate -of compact "${OUT:-out.mp4}"
