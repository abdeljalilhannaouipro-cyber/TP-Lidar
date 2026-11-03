import math
import tempfile
import unittest
from pathlib import Path
from lidar import (EPS, Pose, Segment, Grid, load_scan, angle, close, merge,
                   intersection, cut_longest, extract, update_vector, ray_cells)

class GeometryTests(unittest.TestCase):
    def setUp(self): self.s = Segment((0, 0), (4, 0))
    def test_cut_keeps_longest(self):
        self.assertEqual(cut_longest(self.s, Segment((1, -1), (1, 1))), Segment((1, 0), (4, 0)))
    def test_equal_keeps_first_point(self):
        self.assertEqual(cut_longest(self.s, Segment((2, -1), (2, 1))), Segment((0, 0), (2, 0)))
    def test_near_equal_within_tolerance(self):
        cut = cut_longest(self.s, Segment((2-EPS/4, -1), (2-EPS/4, 1)))
        self.assertEqual(cut.a, self.s.a)
    def test_reversed_segment_first_point(self):
        s = Segment((4, 0), (0, 0))
        self.assertEqual(cut_longest(s, Segment((2, -1), (2, 1))), Segment((4, 0), (2, 0)))
    def test_endpoints_do_not_cut(self):
        for x in (0, 4, EPS/2, 4-EPS/2):
            self.assertEqual(cut_longest(self.s, Segment((x, -1), (x, 1))), self.s)
    def test_intersection_must_be_on_both(self):
        for t in (Segment((1, 1), (1, 2)), Segment((5, -1), (5, 1))):
            self.assertIsNone(intersection(self.s, t))
            self.assertEqual(cut_longest(self.s, t), self.s)
    def test_endpoint_of_cutter_is_allowed(self):
        self.assertEqual(cut_longest(self.s, Segment((1, 0), (1, 2))), Segment((1, 0), (4, 0)))
    def test_collinear_and_parallel_do_not_cut(self):
        for t in (Segment((1, 0), (3, 0)), Segment((1, 1), (3, 1))):
            self.assertIsNone(intersection(self.s, t))
            self.assertEqual(cut_longest(self.s, t), self.s)
    def test_degenerate(self):
        t = Segment((1, 0), (1, 0))
        self.assertEqual(cut_longest(self.s, t), self.s)
        with self.assertRaises(ValueError): angle(self.s, t)
    def test_angle_and_proximity(self):
        self.assertAlmostEqual(angle(self.s, Segment((4, 0), (0, 0))), 0)
        self.assertAlmostEqual(angle(self.s, Segment((2, -1), (2, 1))), math.pi/2)
        self.assertTrue(close(self.s, Segment((4.05, 0), (5, 0))))
        self.assertFalse(close(self.s, Segment((5, 0), (6, 0))))
        self.assertFalse(close(self.s, Segment((0, .5), (4, .5))))
    def test_merge(self):
        s = merge(self.s, Segment((4.05, 0), (5, 0)))
        self.assertAlmostEqual(s.length, 5)
        with self.assertRaises(ValueError): merge(self.s, Segment((8, 0), (9, 0)))
    def test_extract_wall_and_gap(self):
        pts = [(i*.05, 1) for i in range(21)] + [(3+i*.05, 1) for i in range(21)]
        segments = extract(pts)
        self.assertEqual(len(segments), 2)
        self.assertTrue(all(abs(s.length-1) < EPS for s in segments))
    def test_vector_update(self):
        result = update_vector([self.s], [Segment((3, 0), (5, 0))])
        self.assertEqual(len(result), 1)
        self.assertAlmostEqual(result[0].length, 5)

class MappingTests(unittest.TestCase):
    def test_transform(self):
        p = Pose(1, 2, math.pi/2).apply((2, 0))
        self.assertAlmostEqual(p[0], 1); self.assertAlmostEqual(p[1], 4)
    def test_rays_in_all_octants(self):
        for end in [(2, 0), (0, 2), (-2, 0), (0, -2), (2, 2), (-2, 2), (-2, -2), (2, -2), (0, 0), (0, 1)]:
            cells = list(ray_cells((.5, .5), end, 1))
            self.assertEqual(cells[0], (0, 0))
            self.assertEqual(cells[-1], (math.floor(end[0]), math.floor(end[1])))
            self.assertEqual(len(cells), len(set(cells)))
    def test_free_hit_unknown(self):
        grid = Grid(1); grid.update([(2.2, .2)], Pose(.2, .2))
        self.assertLess(grid.probability((1, 0)), .5)
        self.assertGreater(grid.probability((2, 0)), .5)
        self.assertEqual(grid.probability((90, 90)), .5)
    def test_no_overcount_within_scan(self):
        grid = Grid(1); grid.update([(2.2, 0)]*20, Pose())
        self.assertEqual(grid.cells[(2, 0)], .85)
    def test_incremental_clamp_and_roundtrip(self):
        grid = Grid(1)
        for _ in range(50): grid.update([(2.2, 0)], Pose())
        self.assertEqual(grid.cells[(2, 0)], 4)
        self.assertEqual(grid.cells[(1, 0)], -4)
        with tempfile.TemporaryDirectory() as d:
            path = Path(d)/'grid.csv'; grid.save(path)
            restored = Grid.load(path); restored.update([(0, 2.2)], Pose())
            self.assertEqual(restored.cells[(2, 0)], 4)
            self.assertGreater(restored.probability((0, 2)), .5)
    def test_invalid_resolution(self):
        for r in (0, -1, math.nan):
            with self.assertRaises(ValueError): Grid(r)
    def test_real_csv(self):
        path = Path(__file__).parent/'scan_20261102_170547_135900.csv'
        points = load_scan(path)
        self.assertGreater(len(points), 100)
        self.assertAlmostEqual(points[0][0], 6.951*math.cos(math.radians(359.09)))
        self.assertGreater(points[0][1], 0)
        grid = Grid(); grid.update(points, Pose())
        self.assertGreater(len(grid.cells), 100)
        self.assertTrue(extract(points))
    def test_fused_input_rejected(self):
        with self.assertRaises(ValueError): load_scan(Path(__file__).parent/'scans_aligned_3_20261102.csv')

if __name__ == '__main__': unittest.main()
