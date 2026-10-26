# Crop a region of a capture and scale it up for close inspection: python3 qa/crop.py in.png out.png x y w h [scale]
import sys, subprocess
src, dst, x, y, w, h = sys.argv[1], sys.argv[2], *map(int, sys.argv[3:7])
scale = float(sys.argv[7]) if len(sys.argv) > 7 else 2
subprocess.run(['sips', '-c', str(h), str(w), '--cropOffset', str(y), str(x), src, '--out', dst], check=True, capture_output=True)
subprocess.run(['sips', '-z', str(int(h * scale)), str(int(w * scale)), dst], check=True, capture_output=True)
