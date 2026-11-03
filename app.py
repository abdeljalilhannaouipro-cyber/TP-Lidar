"""Interface Tkinter : python app.py. Aucune dépendance pip."""
import csv
import hashlib
import json
import math
from pathlib import Path
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from lidar import Pose, Grid, load_scan, extract, update_vector

COLORS = ['#1565c0', '#d84315', '#00875a', '#8e24aa', '#aa6600']

class App:
    def __init__(self, root):
        self.root, self.scans, self.base = root, [], None
        root.title('TP LD06 — nuages, occupation et segments')
        root.geometry('1200x800')
        bar = ttk.Frame(root); bar.pack(fill='x')
        for label, command in [('Charger scans', self.open), ('Charger grille', self.load_grid),
                               ('Exporter cartes', self.export), ('Sauver poses', self.save_poses),
                               ('Charger poses', self.load_poses)]:
            ttk.Button(bar, text=label, command=command).pack(side='left', padx=3, pady=5)
        self.mode = tk.StringVar(value='Points')
        modes = ttk.Combobox(bar, textvariable=self.mode, values=['Points', 'Occupation', 'Segments'], state='readonly', width=12)
        modes.pack(side='left'); modes.bind('<<ComboboxSelected>>', lambda e: self.draw())
        ttk.Label(bar, text='Cellule (m)').pack(side='left')
        self.resolution = tk.StringVar(value='0.10')
        ttk.Entry(bar, textvariable=self.resolution, width=6).pack(side='left')
        ttk.Button(bar, text='Recalculer', command=self.draw).pack(side='left')
        pane = ttk.Frame(root); pane.pack(fill='both', expand=True)
        self.controls = ttk.Frame(pane, width=300); self.controls.pack(side='left', fill='y')
        ttk.Label(self.controls, text='Poses : x/y en mètres, θ en degrés\nModifier puis cliquer Appliquer.').pack(pady=6)
        self.canvas = tk.Canvas(pane, bg='#f1f3f5'); self.canvas.pack(side='right', fill='both', expand=True)
        self.canvas.bind('<Configure>', lambda e: self.draw())
        self.status = tk.StringVar(value='Charger les scans bruts pour commencer.')
        ttk.Label(root, textvariable=self.status).pack(fill='x')

    def open(self):
        for path in filedialog.askopenfilenames(filetypes=[('Scans CSV', '*.csv')]):
            try:
                fingerprint = hashlib.sha256(Path(path).read_bytes()).hexdigest()
                if any(s['hash'] == fingerprint for s in self.scans):
                    messagebox.showinfo('Doublon', f'{Path(path).name} : mesures déjà chargées.'); continue
                points = load_scan(path)
                variables = [tk.StringVar(value='0') for _ in range(3)]
                self.scans.append(dict(path=path, hash=fingerprint, points=points, vars=variables, pose=Pose()))
                frame = ttk.LabelFrame(self.controls, text=Path(path).name); frame.pack(fill='x', padx=5, pady=5)
                for name, var in zip(['x', 'y', 'θ'], variables):
                    row = ttk.Frame(frame); row.pack(fill='x')
                    ttk.Label(row, text=name, width=3).pack(side='left')
                    ttk.Entry(row, textvariable=var, width=16).pack(side='left')
                ttk.Button(frame, text='Appliquer', command=self.draw).pack()
            except (OSError, ValueError) as exc: messagebox.showerror('Import', str(exc))
        self.draw()

    def compute(self):
        resolution = float(self.resolution.get())
        if not math.isfinite(resolution) or not .02 <= resolution <= 1:
            raise ValueError('Résolution attendue entre 0.02 et 1 m')
        self.grid = Grid(resolution)
        if self.base:
            if abs(self.base.resolution-resolution) > 1e-12: raise ValueError('Garder la résolution de la grille chargée')
            self.grid.cells = dict(self.base.cells)
        self.vector, self.clouds = [], []
        for s in self.scans:
            x, y, deg = [float(v.get()) for v in s['vars']]
            if not all(math.isfinite(v) for v in (x, y, deg)): raise ValueError('Pose non finie')
            s['pose'] = Pose(x, y, math.radians(deg))
            cloud = [s['pose'].apply(p) for p in s['points']]
            self.clouds.append(cloud)
            self.grid.update(s['points'], s['pose'])
            self.vector = update_vector(self.vector, extract(cloud))

    def draw(self):
        try: self.compute()
        except (ValueError, OverflowError) as exc:
            self.status.set(str(exc)); return
        canvas = self.canvas; canvas.delete('all')
        allpoints = [p for cloud in self.clouds for p in cloud] + [(s['pose'].x, s['pose'].y) for s in self.scans]
        r = self.grid.resolution
        if self.grid.cells:
            xs, ys = zip(*self.grid.cells)
            allpoints.extend([(min(xs)*r, min(ys)*r), ((max(xs)+1)*r, (max(ys)+1)*r)])
        if not allpoints: return
        xmin, xmax = min(p[0] for p in allpoints)-.4, max(p[0] for p in allpoints)+.4
        ymin, ymax = min(p[1] for p in allpoints)-.4, max(p[1] for p in allpoints)+.4
        scale = max(1., min((canvas.winfo_width()-40)/(xmax-xmin), (canvas.winfo_height()-40)/(ymax-ymin)))
        def screen(p): return (20+(p[0]-xmin)*scale, 20+(ymax-p[1])*scale)
        if self.mode.get() == 'Occupation':
            for cell in self.grid.cells:
                shade = round(255*(1-self.grid.probability(cell))); color = f'#{shade:02x}{shade:02x}{shade:02x}'
                a, b = screen((cell[0]*r, cell[1]*r)), screen(((cell[0]+1)*r, (cell[1]+1)*r))
                canvas.create_rectangle(*a, *b, fill=color, outline='')
        elif self.mode.get() == 'Segments':
            for segment in self.vector: canvas.create_line(*screen(segment.a), *screen(segment.b), fill='#c62828', width=2)
        else:
            for i, cloud in enumerate(self.clouds):
                for point in cloud:
                    x, y = screen(point); canvas.create_oval(x-1.5, y-1.5, x+1.5, y+1.5, fill=COLORS[i%len(COLORS)], outline='')
        for i, s in enumerate(self.scans):
            pose = s['pose']; x, y = screen((pose.x, pose.y))
            canvas.create_oval(x-4, y-4, x+4, y+4, fill=COLORS[i%len(COLORS)])
            canvas.create_line(x, y, *screen(pose.apply((.4, 0))), arrow='last', fill=COLORS[i%len(COLORS)], width=2)
            canvas.create_text(x+8, y+10, text=f'S{i+1}', anchor='w')
        self.status.set(f'{len(self.scans)} scans uniques | {sum(map(len, self.clouds))} points | {len(self.grid.cells)} cellules | {len(self.vector)} segments — gris : inconnu, blanc : libre, noir : occupé')

    def load_grid(self):
        path = filedialog.askopenfilename(filetypes=[('Grille CSV', '*.csv')])
        if not path: return
        try:
            self.base = Grid.load(path); self.resolution.set(str(self.base.resolution)); self.draw()
        except (OSError, ValueError, KeyError) as exc: messagebox.showerror('Grille', str(exc))

    def export(self):
        folder = filedialog.askdirectory()
        if not folder: return
        try:
            self.compute(); folder = Path(folder)
            self.grid.save(folder/'occupation.csv')
            with open(folder/'segments.csv', 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f); writer.writerow(['x1_m', 'y1_m', 'x2_m', 'y2_m'])
                writer.writerows([(*s.a, *s.b) for s in self.vector])
            with open(folder/'points.csv', 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f); writer.writerow(['source_scan', 'x_m', 'y_m'])
                for s, cloud in zip(self.scans, self.clouds): writer.writerows([(Path(s['path']).name, *p) for p in cloud])
            messagebox.showinfo('Export', 'occupation.csv, segments.csv et points.csv enregistrés.')
        except (OSError, ValueError) as exc: messagebox.showerror('Export', str(exc))

    def save_poses(self):
        path = filedialog.asksaveasfilename(defaultextension='.json')
        if not path: return
        try:
            self.compute()
            data = {s['hash']: [float(v.get()) for v in s['vars']] for s in self.scans}
            Path(path).write_text(json.dumps(data, indent=2), encoding='utf-8')
        except (OSError, ValueError) as exc: messagebox.showerror('Poses', str(exc))

    def load_poses(self):
        path = filedialog.askopenfilename(filetypes=[('Poses JSON', '*.json')])
        if not path: return
        try:
            data = json.loads(Path(path).read_text(encoding='utf-8'))
            for s in self.scans:
                if s['hash'] in data:
                    values = data[s['hash']]
                    if len(values) != 3 or not all(math.isfinite(float(v)) for v in values): raise ValueError('Pose invalide')
                    for var, value in zip(s['vars'], values): var.set(str(value))
            self.draw()
        except (OSError, ValueError, TypeError) as exc: messagebox.showerror('Poses', str(exc))

if __name__ == '__main__':
    root = tk.Tk(); App(root); root.mainloop()
