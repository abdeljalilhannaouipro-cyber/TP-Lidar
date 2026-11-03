import json
import math
from pathlib import Path
import unittest
import numpy as np
from alignement import ROOT,DEST,inventory,components,optimise,residual,wrap
from registration import rotate,register

class AlignmentTests(unittest.TestCase):
    def test_known_rigid_transform(self):
        rng=np.random.default_rng(14);fixed=rng.uniform([-3,-2],[4,3],(150,2))
        theta=math.radians(37);t=np.array([1.2,-.7]);moving=rotate(fixed-t,-theta)
        (found_angle,found_t,q),_=register(moving,fixed)
        self.assertLess(np.max(np.linalg.norm(rotate(moving,found_angle)+found_t-fixed,axis=1)),1e-6)
        self.assertGreater(min(q[1],q[2]),.99)
    def test_pose_graph_composition_and_loop(self):
        expected={0:np.zeros(3),1:np.array([1.,2.,.2]),2:np.array([3.,-1.,-.4])}
        edges=[]
        for i,j in [(0,1),(1,2),(0,2)]:
            a,b=expected[i],expected[j]
            edges.append(dict(i=i,j=j,theta=wrap(b[2]-a[2]),translation=rotate((b[:2]-a[:2])[None,:],-a[2])[0].tolist(),score=.9,alternative_margin=.2))
        found,_=optimise([0,1,2],edges)
        for node in expected:np.testing.assert_allclose(found[node],expected[node],atol=1e-7)
        for edge in edges:self.assertLess(np.linalg.norm(residual(found,edge)),1e-7)
    def test_separate_components(self):
        groups=components(5,[dict(i=0,j=1),dict(i=1,j=2),dict(i=3,j=4)])
        self.assertEqual(groups,[[0,1,2],[3,4]])
    def test_all_source_inputs(self):
        records,clouds=inventory();self.assertEqual(len(records),17)
        self.assertEqual(sum(r['measurements'] for r in records),7760)
        self.assertEqual(sum(r['valid_points'] for r in records),7745)
        self.assertTrue(all(len(c)>=30 and np.isfinite(c).all() for c in clouds))
    def test_generated_coverage_and_constraints(self):
        result=json.loads((DEST/'alignement.json').read_text())
        indices=[r['index'] for group in result['components'] for r in group['scans']]
        self.assertEqual(sorted(indices),list(range(17)))
        self.assertEqual(len(set(indices)),17)
        self.assertEqual(len(result['pairwise']),136)
        for group in result['components']:
            for row in group['scans']:self.assertTrue(all(math.isfinite(v) for v in row['pose'].values()))
            for loop in group['loop_residuals']:
                self.assertLessEqual(loop['translation_error_m'],.30+1e-9)
                self.assertLessEqual(loop['rotation_error_deg'],8+1e-9)
    def test_exploratory_is_explicit(self):
        result=json.loads((DEST/'alignement.json').read_text())
        self.assertEqual(len(result['exploratory']['scans']),17)
        self.assertIn('Weak/ambiguous',result['exploratory']['warning'])

if __name__=='__main__':unittest.main(verbosity=2)
