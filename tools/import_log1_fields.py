"""Build a Buu's Fury field-art pack from local Legacy of Goku map exports.

Run the upstream graphics extractor first. Example:
  python tools/import_log1_fields.py /tmp/log1-fields --map 0
  buus-fury --mod /tmp/log1-fields --story 91-0

World 91 uses the original map indices. This imports visuals and starting
positions only. Collision, NPC logic and scripted exits require separate ports.
"""
import argparse
import base64
import hashlib
import json
import struct
import sys
import tempfile
import zlib
from pathlib import Path

from PIL import Image, ImageChops

UPSTREAM = Path(__file__).resolve().parents[1] / 'upstream/buus-fury'


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, separators=(',', ':')) + '\n')


def integer_property(name, value):
    return {'name': name, 'type': 'int', 'value': value}


def write_field_art(root, public, name, graphic, width, height):
    directory = root / 'maps' / name
    palette = {}
    tiles = {}
    layers = []
    backdrop = [0, 0, 0]
    coverage = Image.new("L", (width*8, height*8)) if "composite" in graphic else None
    for layer in sorted(graphic['layers'], key=lambda item: (-item['priority'], -item['bg'])):
        with Image.open(public / layer['png']) as source:
            pixels = source.convert('RGBA')
        if 'offset_in_composite' in layer:
            aligned = Image.new('RGBA', (width * 8, height * 8))
            aligned.paste(pixels, tuple(layer['offset_in_composite']))
            pixels = aligned
        if pixels.size != (width * 8, height * 8):
            raise ValueError(f'{name}: unexpected layer dimensions')
        if coverage is not None:
            coverage = ImageChops.lighter(coverage, pixels.getchannel('A'))
        # Index zero is transparent in the engine. Preserve even opaque black.
        indices = bytearray()
        for r, g, b, a in pixels.getdata():
            color = palette.setdefault((r, g, b), len(palette) + 1) if a else 0
            if color > 255:
                raise ValueError(f'{name}: too many opaque palette entries')
            indices.append(color)
        stride = pixels.width
        gids = bytearray()
        for y in range(height):
            for x in range(width):
                offset = y * 8 * stride + x * 8
                tile = b''.join(indices[pos:pos + 8] for pos in range(offset, offset + stride * 8, stride))
                gid = tiles.setdefault(tile, len(tiles) + 1) if any(tile) else 0
                gids.extend(struct.pack('<I', gid))
        bg = layer['bg']
        layers.append(dict(type='tilelayer', name=f'bg{bg}', id=len(layers)+1,
                           width=width, height=height, visible=True, opacity=1,
                           encoding='base64', compression='zlib',
                           data=base64.b64encode(zlib.compress(gids)).decode(),
                           properties=[integer_property('bg', bg), integer_property('priority', layer['priority'])]))
    sheet = Image.new('P', (128, max(1, (len(tiles)+15)//16)*8))
    composite = public / graphic['composite'] if 'composite' in graphic else None
    if composite is not None and composite.is_file():
        with Image.open(composite) as background:
            holes = ImageChops.invert(coverage.crop((0, 0, *background.size)))
            bounds = holes.getbbox()
            if bounds:
                # A bounding box corner can be occupied. Find an actual uncovered pixel.
                y = bounds[1]
                x = holes.crop((0, y, background.width, y+1)).getbbox()[0]
                backdrop = list(background.convert('RGB').getpixel((x, y)))
    sheet.putpalette(backdrop + [v for rgb in palette for v in rgb])
    for tile, gid in tiles.items():
        slot = gid - 1
        sheet.paste(Image.frombytes('P', (8, 8), tile), (slot % 16 * 8, slot // 16 * 8))
    atlas = root / 'maps/tilesets'
    atlas.mkdir(parents=True, exist_ok=True)
    sheet.save(atlas / f'{name}.png', transparency=0)
    write_json(atlas / f'{name}.json', dict(type='tileset', name=name, tilewidth=8, tileheight=8,
               tilecount=len(tiles), columns=16, image=f'{name}.png', imagewidth=128, imageheight=sheet.height))
    write_json(directory / 'map.json', dict(type='map', orientation='orthogonal', width=width, height=height,
               tilewidth=8, tileheight=8, layers=layers, tilesets=[dict(firstgid=1, source=f'../tilesets/{name}.json')],
               properties=[integer_property('world_w_px', width*8), integer_property('world_h_px', height*8),
                           integer_property('camera_max_x', max(0,width*8-240)),
                           integer_property('camera_max_y', max(0,height*8-160))]))


def convert(root, public, record, graphic):
    index = record['index']
    name = f'log1_{index:02d}'
    directory = root / 'maps' / name
    write_field_art(root, public, name, graphic, record['size_tiles']['w'], record['size_tiles']['h'])
    entrance = record['default_entrance']
    write_json(directory / 'objects.json', dict(map=name, start_pos=[entrance['x'], entrance['y']],
                                                map_triggers=[], props=[], areas=[]))
    key = f'91-{index}'
    write_json(root / 'world/areas' / f'{key}.json', dict(key=key, name=record['description'] or name,
                                                          maps=[name], combat=True, objects=[]))


def capture_layers(index, public, graphic):
    from emu_states import log1_warp
    from gba import Rom
    from log1_maps import render_map

    emulator = log1_warp(index)
    try:
        planes, _, _ = render_map(emulator, Rom('log1'), index)
        if set(planes) != {layer['bg'] for layer in graphic['layers']}:
            raise ValueError(f'map {index}: captured background planes differ from reference')
        for layer in graphic['layers']:
            image, info = planes[layer['bg']]
            if info['priority'] != layer['priority']:
                raise ValueError(f'map {index}: unexpected layer priority')
            path = public / layer['png']
            path.parent.mkdir(parents=True, exist_ok=True)
            image.save(path)
    finally:
        emulator.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path, help='new directory for the generated pack')
    source = parser.add_mutually_exclusive_group()
    source.add_argument('--from-rom', action='store_true', help='capture selected maps from roms/log1.gba')
    source.add_argument('--public', type=Path, default=UPSTREAM/'site/public')
    parser.add_argument('--map', type=int, action='append', help='map index (repeatable, default all)')
    args = parser.parse_args()
    data = UPSTREAM/'data/log1'
    records = {m['index']: m for m in json.loads((data/'maps.json').read_text())['maps']}
    graphics = {m['map']: m for m in json.loads((data/'sprites.json').read_text())['maps']}
    if args.output.exists():
        parser.error('output directory already exists')
    try:
        with tempfile.TemporaryDirectory(dir=args.output.parent) as tmp:
            root = Path(tmp)/'pack'
            public = args.public
            if args.from_rom:
                rom = UPSTREAM/'roms/log1.gba'
                if hashlib.sha256(rom.read_bytes()).hexdigest() != '3ba9919e26704b0f5fdc2bfabc7f7a0404c71413761d38abcd94224c3bd4b1b9':
                    raise ValueError('log1.gba differs from the supported USA release')
                sys.path.insert(0, str(UPSTREAM/'tools/extract'))
                public = Path(tmp)/'capture'
            for index in dict.fromkeys(args.map or records):
                if index not in records or index not in graphics:
                    parser.error(f'missing map metadata for {index}')
                if args.from_rom:
                    capture_layers(index, public, graphics[index])
                convert(root, public, records[index], graphics[index])
            write_json(root/'pack.json', dict(id='log1-fields', name='Legacy of Goku fields',
                                               format_version=1, depends=['base']))
            root.rename(args.output)
    except (OSError, ValueError) as error:
        parser.exit(1, f'Field import failed: {error}\n')


if __name__ == '__main__':
    main()
