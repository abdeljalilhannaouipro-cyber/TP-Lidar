# Alignment of six real LD06 captures — 3 November 2026

This is an automatic, provisional alignment, not a surveyed ground-truth map.
All six captures requested by the user are included, including repeated attempts.
The first capture (11:27:00) defines the fixed reference frame.
Original CSV files are unchanged.

## Deliverables

- `aligned_scans.png`: overlay with one colour per source and estimated sensor poses.
- `scans_aligned.csv`: all 3,845 measurements, local coordinates and transformed
  Cartesian coordinates in metres. Four zero-distance measurements are retained
  with `valid=0` and empty aligned coordinates; the plot contains 3,841 points.
- `poses.csv`: transformations for each scan.
- `poses_and_quality.json`: complete estimated poses, pairwise overlap metrics,
  competing-solution scores and selected registration links.

## Method

Use the recorded Cartesian columns, converting millimetres to metres. Search
rotations at 3-degree intervals and translations through raster FFT correlation
(15 cm cells). Keep multiple distinct initial candidates. Refine them using
trimmed nearest-neighbour rigid ICP. Only rotation and translation are allowed:
there is no scale adjustment, wall snapping or manual deletion of valid points.

A temporary 8 cm voxel sample is used for registration so dense captures do not
dominate. All original valid points are transformed for the final export.
Score each pair using bidirectional fractions of nearest neighbours within
20 cm, with an inlier RMSE penalty. Select a maximum-quality spanning tree and
compose its transformations with the first capture fixed. This is not a global
pose-graph optimisation and has no measured pose constraints.

For local point (x,y), a row of `poses.csv` applies:

```text
X = cos(theta) x - sin(theta) y + x_m
Y = sin(theta) x + cos(theta) y + y_m
```

Angles in `theta_deg` are counterclockwise Cartesian pose rotations. No further
LD06 polar-angle inversion should be applied to the recorded Cartesian columns.

## Estimated poses

| Capture | x (m) | y (m) | Rotation (degrees) |
|---|---:|---:|---:|
| 11:27:00 | 0.000 | 0.000 | 0.000 |
| 11:28:33 | -1.980 | -0.795 | 99.181 |
| 11:34:56 | -0.523 | -0.107 | -0.453 |
| 11:37:14 | -0.754 | 0.054 | -74.277 |
| 11:39:03 | -0.698 | 0.088 | -75.058 |
| 11:42:51 | -3.802 | 2.161 | 7.313 |

These are estimates, not manually measured robot positions.

## Reliability and limitations

The 11:37/11:39 pair has about 94%/92% bidirectional overlap within 20 cm and
5.1 cm inlier RMSE. The 11:28/11:42 pair has about 77%/78% overlap and 6.4 cm
inlier RMSE. These two pairwise alignments have strong support.

Other selected links have lower overlap (roughly 34–57% depending on direction).
In particular the 11:28/11:34 pair has a competing distinct solution with nearly
the same score (0.407 versus 0.413). Therefore alignment of all six into one map
is not uniquely established by the data. Inspect common fixed corners and walls,
and compare the estimated rotations with the actual sensor movements before
using the merged data as a final map. Moving people, occlusions and repeated
parallel walls can produce mismatches. Low inlier RMSE describes matched points
only, not all points and not absolute map accuracy.

The 11:37 and 11:42 captures contain more points than the usual 457-point exports.
They are retained as received; their validity as individual physical revolutions
has not been established from sensor timestamps. This can also affect matching.

## Checks performed

- Known synthetic rigid transform recovered with maximum point error below 1e-6 m.
- Export row count equals the combined source row count: 3,845.
- Four invalid zero-distance rows preserved and excluded from registration/plot.
- Matching scores and alternative solutions exported without hiding weak links.

No files have been pushed to GitHub as part of this alignment step.
