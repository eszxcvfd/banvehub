import * as migration_20260915_020514_initial from './20260915_020514_initial';

export const migrations = [
  {
    up: migration_20260915_020514_initial.up,
    down: migration_20260915_020514_initial.down,
    name: '20260915_020514_initial'
  },
];
