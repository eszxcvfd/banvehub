import * as migration_20260915_020514_initial from './20260915_020514_initial';
import * as migration_20260915_023701_user_roles_from_plan_5 from './20260915_023701_user_roles_from_plan_5';
import * as migration_20260915_033625_phase2_digital_catalog from './20260915_033625_phase2_digital_catalog';
import * as migration_20260915_062953_phase3_seller_moderation from './20260915_062953_phase3_seller_moderation';
import * as migration_20260915_064708_phase4_payment_wallet from './20260915_064708_phase4_payment_wallet';
import * as migration_20260915_071500_phase5_purchase_download from './20260915_071500_phase5_purchase_download';
import * as migration_20260915_100000_phase6_seller_revenue from './20260915_100000_phase6_seller_revenue';
import * as migration_20260916_000000_phase6_commission_settings from './20260916_000000_phase6_commission_settings';
import * as migration_20260917_000000_phase7_reviews from './20260917_000000_phase7_reviews';

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
    name: '20260915_064708_phase4_payment_wallet',
  },
  {
    up: migration_20260915_071500_phase5_purchase_download.up,
    down: migration_20260915_071500_phase5_purchase_download.down,
    name: '20260915_071500_phase5_purchase_download',
  },
  {
    up: migration_20260915_100000_phase6_seller_revenue.up,
    down: migration_20260915_100000_phase6_seller_revenue.down,
    name: '20260915_100000_phase6_seller_revenue',
  },
  {
    up: migration_20260916_000000_phase6_commission_settings.up,
    down: migration_20260916_000000_phase6_commission_settings.down,
    name: '20260916_000000_phase6_commission_settings',
  },
  {
    up: migration_20260917_000000_phase7_reviews.up,
    down: migration_20260917_000000_phase7_reviews.down,
    name: '20260917_000000_phase7_reviews',
  },
];
