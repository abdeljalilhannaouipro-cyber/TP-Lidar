(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LidarCore = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  function table(text) {
    text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const first = text.split('\n').find(line => line.trim() && !line.startsWith('#')) || '';
    const delimiter = first.includes(';') && !first.includes(',') ? ';' : ',';
    const rows = []; let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') { field += '"'; i++; }
        else quoted = !quoted;
      } else if (!quoted && (c === delimiter || c === '\n')) {
        row.push(field); field = '';
        if (c === '\n') { if (row.some(v => v.trim())) rows.push(row); row = []; }
      } else field += c;
    }
    if (quoted) throw new Error('Guillemet CSV non fermé.');
    row.push(field); if (row.some(v => v.trim())) rows.push(row);
    return rows.filter(r => !r[0].trim().startsWith('#'));
  }
  const normalized = name => name.toLowerCase().trim().replace(/\s/g, '');
  function checksum(points) {
    let hash = 2166136261;
    const text = JSON.stringify(points);
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return (hash >>> 0).toString(16);
  }
  function parseScan(text, name, clockwise = true) {
    const rows = table(text); if (rows.length < 2) throw new Error('CSV vide ou sans mesures.');
    const headers = rows.shift().map(normalized);
    if (headers.includes('source_scan')) throw new Error('Charger les scans bruts séparés, pas un CSV fusionné.');
    const find = names => headers.findIndex(h => names.includes(h));
    const ai = find(['angle_deg', 'angle(°)', 'angle', 'angle_deg_ccw']);
    const ri = find(['dist_mm', 'distance(mm)', 'distance_mm', 'distance_m', 'r_m']);
    const xi = find(['x_lib_mm', 'x(mm)', 'x_rel_m']);
    const yi = find(['y_lib_mm', 'y(mm)', 'y_rel_m']);
    if (ai < 0 || ri < 0) throw new Error('Colonnes angle_deg et dist_mm (ou distance_m/r_m) attendues.');
    const metres = ['distance_m', 'r_m'].includes(headers[ri]);
    const hasXY = xi >= 0 && yi >= 0;
    const points = []; let invalid = 0, wraps = 0, previous = null;
    for (let n = 0; n < rows.length; n++) {
      const row = rows[n];
      const number = index => {
        if (row[index] == null || row[index].trim() === '') throw new Error(`Valeur manquante, mesure ${n + 1}.`);
        const value = Number(row[index]);
        if (!Number.isFinite(value)) throw new Error(`Valeur non numérique, mesure ${n + 1}.`);
        return value;
      };
      const angle = number(ai), r = number(ri) * (metres ? 1 : .001);
      if (previous !== null && Math.abs(angle - previous) > 180) wraps++;
      previous = angle;
      if (r <= 0) { invalid++; continue; }
      let x, y;
      if (hasXY) {
        x = number(xi) * (headers[xi] === 'x_rel_m' ? 1 : .001);
        y = number(yi) * (headers[yi] === 'y_rel_m' ? 1 : .001);
      } else {
        const a = angle * Math.PI / 180;
        x = r * Math.cos(a); y = (clockwise ? -1 : 1) * r * Math.sin(a);
      }
      points.push([x, y]);
    }
    if (!points.length) throw new Error('Aucune distance positive exploitable.');
    return { name, points, invalid, wraps, basis: hasXY ? 'XY du CSV' : `Polaires, angles ${clockwise ? 'horaires' : 'antihoraires'}`,
      checksum: checksum(points), pose: { x: 0, y: 0, theta: 0 }, visible: true, opacity: .85 };
  }
  function transform(point, pose) {
    if (![pose.x, pose.y, pose.theta].every(Number.isFinite)) throw new Error('Pose non finie.');
    const a = pose.theta * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [pose.x + c * point[0] - s * point[1], pose.y + s * point[0] + c * point[1]];
  }
  const palette = ['#1669c9', '#df5b16', '#008668', '#aa3691', '#9b7304', '#6b48ce'];
  function color(index) { return palette[index] || `hsl(${(index * 137.508) % 360},65%,38%)`; }
  function csvCell(value) { const s = String(value); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function exportPoints(scans) {
    const rows = [['source_scan', 'point_index', 'local_x_m', 'local_y_m', 'aligned_x_m', 'aligned_y_m']];
    for (const scan of scans.filter(s => s.visible)) scan.points.forEach((p, i) => {
      const q = transform(p, scan.pose); rows.push([scan.name, i, ...p, ...q]);
    });
    return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
  }
  function savePoses(scans) {
    return JSON.stringify({ format: 'tp-lidar-poses-v1', units: 'metres/degrees-counterclockwise', scans: scans.map(s => ({
      name: s.name, checksum: s.checksum, pose: { ...s.pose }, visible: s.visible
    })) }, null, 2);
  }
  function readPoses(text, scans) {
    const data = JSON.parse(text);
    if (data.format !== 'tp-lidar-poses-v1' || !Array.isArray(data.scans)) throw new Error('Fichier de poses non reconnu.');
    const updates = [];
    for (const entry of data.scans) {
      const scan = scans.find(s => s.name === entry.name && s.checksum === entry.checksum);
      if (!scan) continue;
      if (!entry.pose || ![entry.pose.x, entry.pose.y, entry.pose.theta].every(Number.isFinite)) throw new Error(`Pose invalide : ${entry.name}`);
      updates.push({ scan, pose: { ...entry.pose }, visible: entry.visible !== false });
    }
    if (!updates.length) throw new Error('Aucun scan correspondant : charger les mêmes CSV avant les poses.');
    return updates;
  }
  return { table, parseScan, transform, checksum, color, exportPoints, savePoses, readPoses };
});
