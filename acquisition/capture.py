"""python acquisition/capture.py COM5 --output scans --count 3

Requiert pyserial. Protocole du sketch fourni : BEGIN_SCAN / CSV / END_SCAN.
"""
import argparse
import csv
from datetime import datetime
from pathlib import Path
import time

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('port')
    parser.add_argument('--output', default='scans')
    parser.add_argument('--count', type=int, default=1)
    args = parser.parse_args()
    if args.count < 1: parser.error('--count doit être positif')
    try: import serial
    except ImportError: parser.exit(1, 'Installer pyserial : python -m pip install pyserial\n')
    folder = Path(args.output); folder.mkdir(parents=True, exist_ok=True)
    saved, rows, deadline = 0, None, time.monotonic()+30
    with serial.Serial(args.port, 115200, timeout=1) as port:
        while saved < args.count:
            if time.monotonic() > deadline: raise TimeoutError('Aucun scan complet valide depuis 30 s')
            line = port.readline().decode('ascii', errors='replace').strip()
            if line == 'BEGIN_SCAN': rows = []
            elif line == 'END_SCAN' and rows:
                path = folder/f'scan_{datetime.now():%Y%m%d_%H%M%S_%f}.csv'
                with path.open('x', newline='', encoding='utf-8') as f:
                    writer = csv.writer(f); writer.writerow(['point_index', 'angle_deg', 'dist_mm', 'intensity']); writer.writerows(rows)
                saved += 1; rows = None; deadline = time.monotonic()+30
                print(path)
            elif rows is not None and line and not line.startswith('point_index'):
                fields = line.split(',')
                try:
                    if len(fields) != 4: raise ValueError()
                    int(fields[0]); float(fields[1]); float(fields[2]); int(fields[3])
                    rows.append(fields)
                except ValueError:
                    rows = None  # ignorer le scan corrompu entier

if __name__ == '__main__': main()
