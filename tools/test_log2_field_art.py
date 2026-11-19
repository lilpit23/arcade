"""Reconstruct converted fields and compare their visible pixels to the capture composites."""
import argparse
import base64
import json
import zlib
from pathlib import Path

import numpy as np
from PIL import Image
from import_log1_fields import UPSTREAM


def verify(pack, record, public):
    name = f"log2_{record['map']:03d}"
    manifest = json.loads((pack/'maps'/name/'map.json').read_text())
    with Image.open(pack/'maps/tilesets'/f'{name}.png') as atlas:
        palette = np.array(atlas.getpalette(), dtype=np.uint8).reshape(-1, 3)
        tiles = np.asarray(atlas).reshape(atlas.height//8, 8, atlas.width//8, 8)
        tiles = tiles.transpose(0, 2, 1, 3).reshape(-1, 8, 8)
    tiles = np.concatenate((np.zeros((1, 8, 8), dtype=np.uint8), tiles))
    w, h = manifest['width'], manifest['height']
    visible = np.zeros((h*8, w*8), dtype=np.uint8)
    for layer in manifest['layers']:
        raw = zlib.decompress(base64.b64decode(layer['data']))
        gids = np.frombuffer(raw, dtype='<u4').reshape(h, w)
        indices = tiles[gids].transpose(0, 2, 1, 3).reshape(h*8, w*8)
        np.copyto(visible, indices, where=indices!=0)
    with Image.open(public/record['composite']) as reference:
        actual = palette[visible[:reference.height, :reference.width]]
        if not np.array_equal(actual, np.asarray(reference.convert('RGB'))):
            raise ValueError(f'{name} differs from the original composite')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pack', type=Path)
    parser.add_argument('manifest', type=Path)
    args = parser.parse_args()
    records = json.loads(args.manifest.read_text())['maps']
    by_index = {r['map']: r for r in records}
    for row in records:
        record = dict(by_index[row.get('same_as', row['map'])], map=row['map'])
        verify(args.pack, record, UPSTREAM/'site/public')
    print(f'{len(records)} reconstructed maps match their capture composites pixel for pixel.')


if __name__ == '__main__':
    main()
