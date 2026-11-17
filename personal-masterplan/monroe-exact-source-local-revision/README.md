# Monroe — exact-source local revisions

This delivery uses the owner's **parking_options_1-3.pdf** as the image base. It does not use the earlier reconstructed site diagrams. The final three pages retain the original size, orientation, title, dimension legend, buildings, roads, arrows and all pixels outside two declared edit masks.

## Edits

1. **Annex-right bank:** exactly seven 9 x 18 ft bay outlines in each option, with flush paved access. The passing paths use approximately 4.5–4.6 square metres of additional end access within the marked bank, beyond the simple stall/apron rectangle. The affected end planting is converted only within that mask; no new island, curb, sidewalk or decorative vehicle is introduced.
2. **Northwest approach:** a straight 16 ft leg connected to the retained north cross aisle. Only the marked corner is changed. The superseded curved pavement edge is locally restored to the adjacent grass texture; approved neighboring parking/end planting and the existing arrows are independently protected.

All other parking banks and their counts remain the original pixels. No new 3D model is created. The earlier model files are unchanged.

PDF numbering controls: **Option 1 perpendicular connector; Option 2 planted-island connector; Option 3 angled connector**. The hill is right-high/left-low; it does not change these layouts.

## Vehicle check — read the scope

All **21 proposed bay maneuvers** and **3 straight-approach turns** pass the stated nominal test. The vehicle is 4.8 m long and 1.85 m wide, with a 2.8 m wheelbase, 0.9/1.1 m front/rear overhangs and maximum steering of 35 degrees. Tested body clearance is 0.15 m. Each bank is checked with its other six spaces occupied. Entry starts in the proper right-hand travel lane, uses a smooth bounded-curvature setup, and proceeds forward into the bay. Reverse exit follows the checked poses back to the retained aisle. The parking setup uses the opposing half of the two-way aisle, requiring yielding. Straight-approach checks begin in the correct westbound half of the north aisle and end southbound in the 16 ft leg.

The owner explicitly selected the PDF's **22 ft two-way, 16 ft other one-way, 13 ft angled aisles and 9 x 18 ft stalls**. The source is raster concept artwork without a survey scale. Local scales are derived from these owner dimensions on manually traced aisle edges, independently along each axis. Trace uncertainty is approximately +/-2 pixels. Computed clearances and nominal fit are **not independently verified field measurements**; that uncertainty can exceed the tightest margins. These are review-stage tests, not certified construction, grading, swept-path verification for every vehicle class, or validation of all untouched existing parking.

The low-speed planar kinematic model samples the full vehicle body at no more than 0.12 m; steering may change while stopped. Steering-rate limits, slopes, drainage and accessibility are outside this check. Do not treat these plans as surveyed or construction-ready. The original PDF's concept/site-verification footer is retained.

## Evidence

- `Monroe_Exact_Source_Local_Revisions.pdf`: three locally edited original pages.
- `Vehicle_Turning_and_Preservation_Report.pdf`: six-page audit, assumptions, per-bay results, swept-path overlays and limits.
- `images/`: full-resolution revised PNGs.
- `Option_*_Before_After.png`: local comparison crops only, not substitute site plans.
- `Option_*_Vehicle_Path_Overlay.png`: analysis overlays, separate from the unannotated revisions.
- `checks/LOCKED_PIXEL_COMPARISON.json`: **zero changed pixels outside the two masks**, plus zero changes in independently protected neighboring parking/arrow regions. The final PDF was reopened and its embedded images match the revised PNG pixels exactly.
- `checks/vehicle_turning_checks.json`: all source traces, calibration factors, poses, envelopes and per-maneuver results, including checks against the final paving polygon.
- `source/parking_options_1-3_original.pdf`: unmodified input, retained for comparison.

## Reproduce

Install `requirements.txt` in a Python environment, then run:

```
python scripts/rebuild.py --output /path/to/a/new/empty/work-directory
```

This extracts the three original images, reruns the kinematic checks, performs only the declared local edits, checks unchanged pixels and rebuilds the reports. Source traces/calibrations are explicit in the checking script for review. A clean-directory rebuild was tested and reproduced identical revised PNG SHA-256 hashes.

The ZIP, PDFs and sources are published on migration for review. Main is not merged or deployed by this task. 3D modeling remains paused pending review.
