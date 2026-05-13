#!/usr/bin/env bash
# Verify that YOLO/NMS can run on Jetson. Returns non-zero when the known
# TorchVision CUDA NMS path is broken and the Ultralytics fallback patch is
# needed.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="${PROJECT_DIR}/venv/bin/python"
[ -x "$PYTHON" ] || PYTHON="${PROJECT_DIR}/venv/bin/python3"

if [ ! -x "$PYTHON" ]; then
    echo "❌ venv python not found"
    exit 2
fi

"$PYTHON" - <<'PY'
import os
import sys

try:
    import torch
except Exception as exc:
    print(f"❌ torch import failed: {exc}")
    raise SystemExit(2)

try:
    import ultralytics  # noqa: F401
except Exception as exc:
    print(f"❌ ultralytics import failed: {exc}")
    raise SystemExit(2)

if not torch.cuda.is_available():
    print("✅ CUDA unavailable; NMS CUDA patch not required in this environment")
    raise SystemExit(0)

try:
    import torchvision.ops
    boxes = torch.tensor(
        [[0.0, 0.0, 10.0, 10.0], [1.0, 1.0, 11.0, 11.0], [40.0, 40.0, 50.0, 50.0]],
        device="cuda",
    )
    scores = torch.tensor([0.9, 0.8, 0.7], device="cuda")
    torchvision.ops.nms(boxes, scores, 0.5)
    print("✅ TorchVision CUDA NMS available")
    raise SystemExit(0)
except Exception as exc:
    nms_error = exc

try:
    import pathlib
    import ultralytics.utils.nms as nms_module
    nms_file = pathlib.Path(nms_module.__file__).resolve()
    nms_text = nms_file.read_text(encoding="utf-8", errors="ignore")
    patched = (
        "PATCHED_FOR_JETSON_NMS" in nms_text
        or 'if False: # "torchvision" in sys.modules:' in nms_text
        or 'if False:  # "torchvision" in sys.modules:' in nms_text
    )
except Exception as exc:
    print(f"❌ could not inspect Ultralytics nms.py: {exc}")
    raise SystemExit(2)

if not patched:
    print(f"❌ TorchVision CUDA NMS unavailable and Jetson patch is missing: {nms_error}")
    raise SystemExit(1)

try:
    from ultralytics.utils.nms import TorchNMS
    boxes = torch.tensor(
        [[0.0, 0.0, 10.0, 10.0], [1.0, 1.0, 11.0, 11.0], [40.0, 40.0, 50.0, 50.0]],
        device="cuda",
    )
    scores = torch.tensor([0.9, 0.8, 0.7], device="cuda")
    TorchNMS.nms(boxes, scores, 0.5)
    print("✅ Jetson NMS patch present and TorchNMS fallback works")
    raise SystemExit(0)
except Exception as exc:
    print(f"❌ NMS fallback failed: {exc}")
    raise SystemExit(1)
PY
