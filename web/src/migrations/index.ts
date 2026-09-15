import * as migration_20260915_020514_initial from './20260915_020514_initial';
import * as migration_20260915_023701_user_roles_from_plan_5 from './20260915_023701_user_roles_from_plan_5';
import * as migration_20260915_033625_phase2_digital_catalog from './20260915_033625_phase2_digital_catalog';
import * as migration_20260915_062953_phase3_seller_moderation from './20260915_062953_phase3_seller_moderation';
import * as migration_20260915_064708_phase4_payment_wallet from './20260915_064708_phase4_payment_wallet';

export const migrations = [
  {
    up: migration_20260915_020514_initial.up,
    down: migration_20260915_020514_initial.down,
    name: '20260915_020514_initial',
  },
  {
    up: migration_20260915_023701_user_roles_from_plan_5.up,
    down: migration_20260915_023701_user_roles_from_plan_5.down,
    name: '20260915_023701_user_roles_from_plan_5',
  },
  {
    up: migration_20260915_033625_phase2_digital_catalog.up,
    down: migration_20260915_033625_phase2_digital_catalog.down,
    name: '20260915_033625_phase2_digital_catalog',
  },
  {
    up: migration_20260915_062953_phase3_seller_moderation.up,
    down: migration_20260915_062953_phase3_seller_moderation.down,
    name: '20260915_062953_phase3_seller_moderation',
  },
  {
    up: migration_20260915_064708_phase4_payment_wallet.up,
    down: migration_20260915_064708_phase4_payment_wallet.down,
    name: '20260915_064708_phase4_payment_wallet'
  },
];
