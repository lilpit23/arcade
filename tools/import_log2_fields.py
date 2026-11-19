"""Convert locally captured LoG II background layers into Buu's Fury engine map art."""
import argparse
import json
import tempfile
from pathlib import Path

from import_log1_fields import UPSTREAM, write_field_art, write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--public', type=Path, default=UPSTREAM/'site/public')
    parser.add_argument('--manifest', type=Path, default=UPSTREAM/'data/log2/sprites.json')
    parser.add_argument('--map', type=int, action='append', help='convert specific captured map indices')
    args = parser.parse_args()
    if args.output.exists():
        parser.error('choose a new output directory')
    records = json.loads(args.manifest.read_text())['maps']
    with tempfile.TemporaryDirectory(dir=args.output.parent) as tmp:
        pack = Path(tmp)/'pack'
        graphics = {record['map']: record for record in records}
        selected = list(dict.fromkeys(args.map)) if args.map else list(graphics)
        if set(selected) - graphics.keys():
            parser.error('a requested map has no captured background')
        for index in selected:
            record = graphics[index]
            source = graphics[record.get('same_as', record['map'])]
            w, h = source['size']
            name = f"log2_{record['map']:03d}"
            write_field_art(pack, args.public, name, source, (w+7)//8, (h+7)//8)
        write_json(pack/'pack.json', dict(id='log2-fields', name='Legacy of Goku II fields',
                                         format_version=1, depends=['base']))
        pack.rename(args.output)
    print(f'Converted {len(selected)} maps.')


if __name__ == '__main__':
    main()
