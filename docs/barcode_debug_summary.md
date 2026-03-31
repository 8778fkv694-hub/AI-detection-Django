# Barcode/QR Detection Debug Summary (2026-01-26)

## Goal
Identify why the `barcode_label` ROI fails barcode/QR matching while other ROIs succeed.

## What Was Verified
- Backend barcode detection is enabled and runs in batch mode.
- `barcode_label` ROI **does trigger** barcode detection but returns **0 results**.
- QR codes are detected in other ROIs (`water_efficiency_label`, `service_label`).

## Key Logs (Latest Run)
From `/tmp/django_barcode_test.log`:

- Incoming barcode configs:
  - `service_label`: expected `http` (contains)
  - `barcode_label`: expected `10` (contains)

- Trigger decisions:
  - `barcode_label` => `should_run_barcode=True`
  - `water_efficiency_label` => `should_run_barcode=True`
  - `service_label` => `should_run_barcode=True`
  - Others => `should_run_barcode=False`

- Detection results:
  - `barcode_label`: `count=0, codes=[]`
  - `water_efficiency_label`: 1 QR code
    - `http://wl.bbqk.com/0ahkb/0.html`
  - `service_label`: 1 QR code
    - `https://wechat.fotile.com/x?model=YCZ-JT1600-01-X20.i`

## Conclusion
The barcode detection **is running** on `barcode_label` but **does not detect any code** there. This is not a configuration/trigger issue; it is an image/ROI/quality issue for that ROI.

## Likely Causes
1) `barcode_label` ROI does not fully cover the barcode area (too small / misaligned).
2) Barcode is too small or low-contrast in that ROI.
3) The expected text `10` is not representative of the actual barcode data.

## Recommended Next Steps
1) **Enlarge/adjust the ROI** so the barcode area is fully covered.
2) **Add preprocessing** for barcode ROI before detection:
   - grayscale, contrast, denoise, sharpen, or upscaling.
3) **Use full barcode content** as `expectedText` (not a short substring like `10`).

## Optional Engineering Follow-Up
- Add image preprocessing for `barcode_label` ROI in backend before ZBar decode.
- Log barcode ROI image size and quality metrics to correlate with failures.

