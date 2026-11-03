"""Rigid 2-D registration of today's real scans. NumPy only; originals untouched."""
import csv
import json
import math
from pathlib import Path
import numpy as np

RES, SIZE = .15, 256

def rotate(points, angle):
    c, s = math.cos(angle), math.sin(angle)
    return points @ np.array([[c, s], [-s, c]])

def downsample(points, size=.08):
    _, indices = np.unique(np.floor(points/size).astype(int), axis=0, return_index=True)
    return points[np.sort(indices)]

def raster(points):
    indices = np.rint(points/RES).astype(int)+SIZE//2
    valid = np.all((indices >= 0)&(indices < SIZE), axis=1)
    result = np.zeros((SIZE, SIZE))
    result[indices[valid, 1], indices[valid, 0]] = 1
    return result

def nearest(a, b):
    # Chunked Euclidean nearest neighbours; no external spatial-index dependency.
    indices, distances = [], []
    for start in range(0, len(a), 128):
        d = np.sum((a[start:start+128, None, :]-b[None, :, :])**2, axis=2)
        index = d.argmin(axis=1)
        indices.append(index); distances.append(d[np.arange(len(index)), index])
    return np.concatenate(indices), np.sqrt(np.concatenate(distances))

def quality(a, b):
    _, d1 = nearest(a, b)
    _, d2 = nearest(b, a)
    f1, f2 = float(np.mean(d1 < .20)), float(np.mean(d2 < .20))
    inliers = np.concatenate([d1[d1 < .20], d2[d2 < .20]])
    rmse = float(np.sqrt(np.mean(inliers**2))) if len(inliers) else 1.
    # Both directions matter: matching one short wall is insufficient.
    score = 2*f1*f2/max(f1+f2, 1e-9) - .35*rmse
    return score, f1, f2, rmse

def refine(moving, fixed, theta, translation):
    translation = np.array(translation, dtype=float)
    previous = math.inf
    for iteration in range(45):
        transformed = rotate(moving, theta)+translation
        indices, d = nearest(transformed, fixed)
        gate = .45 if iteration < 8 else .25
        keep = d < gate
        if keep.sum() < 15: break
        # Discard the worst 15% of accepted matches to resist moving objects.
        keep &= d <= np.quantile(d[keep], .85)
        a, b = transformed[keep], fixed[indices[keep]]
        ca, cb = a.mean(axis=0), b.mean(axis=0)
        u, _, vt = np.linalg.svd((a-ca).T @ (b-cb))
        matrix = vt.T @ u.T
        if np.linalg.det(matrix) < 0:
            vt[-1] *= -1; matrix = vt.T @ u.T
        delta = cb-matrix@ca
        translation = matrix@translation+delta
        theta += math.atan2(matrix[1, 0], matrix[0, 0])
        error = float(np.mean(d[keep]**2))
        if abs(previous-error) < 1e-10: break
        previous = error
    return theta, translation, quality(rotate(moving, theta)+translation, fixed)

def register(moving, fixed):
    base = raster(fixed)
    # Blur by neighbouring cells for coarse matching without connecting points.
    smooth = base.copy()
    for dy, dx in [(-1,0),(1,0),(0,-1),(0,1)]:
        smooth += .5*np.roll(base, (dy,dx), axis=(0,1))
    spectrum = np.fft.rfft2(smooth)
    candidates = []
    shifts = np.arange(SIZE); shifts = np.where(shifts <= SIZE//2, shifts, shifts-SIZE)
    allowed = (abs(shifts[:, None]*RES) <= 14)&(abs(shifts[None, :]*RES) <= 14)
    for degree in range(0, 360, 3):
        theta = math.radians(degree)
        image = raster(rotate(moving, theta))
        correlation = np.fft.irfft2(spectrum*np.conj(np.fft.rfft2(image)), s=base.shape)
        correlation[~allowed] = -1
        for _ in range(2):
            iy, ix = np.unravel_index(correlation.argmax(), correlation.shape)
            value = correlation[iy, ix]/max(1, min(image.sum(), base.sum()))
            candidates.append((value, theta, np.array([shifts[ix], shifts[iy]])*RES))
            for dy in range(-3,4):
                for dx in range(-3,4): correlation[(iy+dy)%SIZE, (ix+dx)%SIZE] = -1
    candidates.sort(key=lambda x:x[0], reverse=True)
    selected = []
    for candidate in candidates:
        if all(abs(math.atan2(math.sin(candidate[1]-s[1]), math.cos(candidate[1]-s[1]))) > math.radians(8)
               or np.linalg.norm(candidate[2]-s[2]) > .7 for s in selected):
            selected.append(candidate)
        if len(selected) >= 12: break
    solutions = [refine(moving, fixed, theta, shift) for _, theta, shift in selected]
    solutions.sort(key=lambda x:x[2][0], reverse=True)
    best = solutions[0]
    alternative = next((s for s in solutions[1:] if
        np.linalg.norm(s[1]-best[1]) > .4 or abs(math.atan2(math.sin(s[0]-best[0]), math.cos(s[0]-best[0]))) > math.radians(5)), None)
    return best, (alternative[2][0] if alternative else None)