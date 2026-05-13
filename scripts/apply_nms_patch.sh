#!/usr/bin/env bash
# Patch Ultralytics to avoid calling torchvision.ops.nms on Jetson wheels where
# the CUDA NMS operator is missing. The patch is idempotent and skipped when the
# native CUDA operator is already available.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="${PROJECT_DIR}/venv/bin/python"
[ -x "$PYTHON" ] || PYTHON="${PROJECT_DIR}/venv/bin/python3"
MARKER="PATCHED_FOR_JETSON_NMS"

if [ ! -x "$PYTHON" ]; then
    echo "❌ venv python not found"
    exit 2
fi

if "$PYTHON" - <<'PY' >/dev/null 2>&1
import torch
import torchvision.ops
boxes = torch.rand(4, 4, device="cuda")
boxes[:, 2:] += boxes[:, :2]
scores = torch.rand(4, device="cuda")
torchvision.ops.nms(boxes, scores, 0.5)
PY
then
    echo "✅ TorchVision CUDA NMS already works; patch skipped"
    exit 0
fi

TARGET="$("$PYTHON" - <<'PY'
import pathlib
import ultralytics.utils.nms as nms
print(pathlib.Path(nms.__file__).resolve())
PY
)"

if [ ! -f "$TARGET" ]; then
    echo "❌ Ultralytics nms.py not found"
    exit 2
fi

if grep -q "$MARKER" "$TARGET"; then
    echo "✅ NMS patch already present: $TARGET"
    exit 0
fi

if grep -q 'if False: # "torchvision" in sys.modules:' "$TARGET" || \
   grep -q 'if False:  # "torchvision" in sys.modules:' "$TARGET"; then
    echo "✅ Existing Jetson NMS patch detected: $TARGET"
    exit 0
fi

if ! grep -q 'if "torchvision" in sys.modules:' "$TARGET"; then
    echo "❌ Expected NMS branch not found in $TARGET"
    exit 2
fi

cp "$TARGET" "${TARGET}.pre-jetson-nms.bak"
sed -i.tmp "s/if \"torchvision\" in sys.modules:/if False:  # ${MARKER}: Jetson torchvision wheel lacks CUDA NMS; use TorchNMS fallback./" "$TARGET"
rm -f "${TARGET}.tmp"
echo "✅ NMS patch applied: $TARGET"
