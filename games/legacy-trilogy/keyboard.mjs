// EmulatorJS stores logical GBA buttons by RetroPad ID and keyboard keyCode.
const bindings = [
  // Button, keyboard, gamepad, previous keyboard default
  [0, 102, 'BUTTON_2', 88],          // B on Numpad6
  [2, 81, 'SELECT', 86],             // Select on Q
  [3, 69, 'START', 13],              // Start on E
  [4, 87, 'DPAD_UP', 38],            // W
  [5, 83, 'DPAD_DOWN', 40],          // S
  [6, 65, 'DPAD_LEFT', 37],          // A
  [7, 68, 'DPAD_RIGHT', 39],         // D
  [8, 100, 'BUTTON_1', 90],          // A on Numpad4
  [10, 103, 'LEFT_TOP_SHOULDER', 81], // L on Numpad7
  [11, 105, 'RIGHT_TOP_SHOULDER', 69] // R on Numpad9
];

export function trilogyControls(code) {
  const player = {24:{value:49}, 25:{value:50}, 26:{value:51}, 27:{}, 28:{}, 29:{}};
  for (const [id, value, value2] of bindings) player[id] = {value, value2};

  // Older installations can have a saved copy of the emulator's stock layout.
  // Migrate it once per chapter, keeping deliberate remaps and other settings.
  const key = 'ejs-1-gba-Trilogy-' + code + '-settings';
  const migrated = key + '-wasd-v1';
  try {
    if (!localStorage.getItem(migrated)) {
      const saved = JSON.parse(localStorage.getItem(key));
      const controls = saved?.controlSettings?.[0];
      if (controls && bindings.every(([id,,,old]) => controls[id]?.value === old)) {
        for (const [id,value] of bindings) controls[id].value = value;
        localStorage.setItem(key, JSON.stringify(saved));
      }
      localStorage.setItem(migrated, '1');
    }
  } catch { /* The defaults still work when settings storage is unavailable. */ }
  return {0:player, 1:{}, 2:{}, 3:{}};
}
