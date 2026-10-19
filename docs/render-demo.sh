#!/usr/bin/env bash
# Renders docs/demo.gif: records docs/demo.tape with VHS, then adds eased zooms
# on the two moments that matter (status after setup, doctor catching drift).
#   brew install vhs            # also installs ffmpeg and ttyd
#   npm run build && docs/render-demo.sh
# The zoom windows below follow the Sleep timings in demo.tape; adjust both together.
set -euo pipefail
cd "$(dirname "$0")/.."

raw=/tmp/perezdev-demo.mp4
vhs docs/demo.tape

# Each zoom: start, end (seconds), strength, and the point to zoom on (in 1280x800 frame pixels).
# Easing: smoothstep over 0.7s in and out.
A="1.4:16.0:19.2:470:240"    # perezdev status after init
B="1.4:25.0:33.0:470:370"    # doctor: modified -> repaired -> healthy

ease() { # ease <start> <end> → expression for 0..1 with eased ramps
  echo "(st(9,clip(min((it-$1)/0.7,($2-it)/0.7),0,1));ld(9)*ld(9)*(3-2*ld(9)))"
}
IFS=: read -r za a1 a2 ax ay <<<"$A"
IFS=: read -r zb b1 b2 bx by <<<"$B"
ea=$(ease "$a1" "$a2")
eb=$(ease "$b1" "$b2")

# Work at 2x so the moving crop lands on sub-pixels (no jitter), then scale back down.
zoom="1+($za-1)*$ea+($zb-1)*$eb"
cx="2*(640+($ax-640)*$ea+($bx-640)*$eb)"
cy="2*(400+($ay-400)*$ea+($by-400)*$eb)"
filter="scale=2560:1600:flags=lanczos,zoompan=z='$zoom':x='clip($cx-iw/zoom/2,0,iw-iw/zoom)':y='clip($cy-ih/zoom/2,0,ih-ih/zoom)':d=1:s=1280x800:fps=25"

ffmpeg -v error -y -i "$raw" -vf "$filter" -c:v libx264 -crf 12 -pix_fmt yuv420p /tmp/perezdev-demo-zoomed.mp4
ffmpeg -v error -y -i /tmp/perezdev-demo-zoomed.mp4 \
  -vf "fps=20,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff:max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  -loop 0 docs/demo.gif
echo "wrote docs/demo.gif ($(du -h docs/demo.gif | cut -f1))"
