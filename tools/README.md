# Trilogy port tools

The field importer writes a Buu’s Fury engine content pack from the first game's background layers and entrance coordinates. It can use local PNG exports from the upstream extractor or capture maps from the USA cartridge dump.

## Build the Linux capture backend

Run from the repository root with Python 3, Git and a C compiler available.

```sh
git submodule update --init
python3 -m venv upstream/buus-fury/.venv
. upstream/buus-fury/.venv/bin/activate
python -m pip install cmake ninja capstone numpy pillow
python tools/build_linux_extractor.py
python tools/test_linux_extractor.py
```

## Import field graphics

Place the USA first-game dump at `upstream/buus-fury/roms/log1.gba`. The importer checks its SHA-256 before invoking the emulator.

```sh
python tools/import_log1_fields.py --from-rom --map 0 /tmp/log1-opening
```

Omit `--map 0` to process all first-game map records, or repeat `--map` to select several. Choose a new output directory on each run. When using previously extracted graphics, replace `--from-rom` with `--public PATH`, where PATH contains the upstream `assets/log1/maps` directory.

The generated map for index 0 has engine area key `91-0`. Its original artwork needs local capture verification. Story scripts, collision, actor behavior and chapter transitions are still pending.

## Import Legacy of Goku II field graphics

With the USA revision 0 dump installed at `roms/log2.gba` in the upstream Buu’s Fury checkout, use its graphics extractor to produce the layer PNGs in `site/public`. From the project root, run:

```sh
python tools/import_log2_fields.py /tmp/log2-fields
```

The importer reads the pinned upstream map graphics manifest by default. Pass `--manifest PATH` to use a fresh capture manifest, or `--map INDEX` to convert individual fields. Each map keeps its own background layers, palette, priority and placement within the upstream composite. The result is engine-format map artwork. Original field collision, entrances and scripted objects still require integration.
