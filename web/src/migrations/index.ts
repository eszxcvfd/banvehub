import * as migration_20260915_020514_initial from './20260915_020514_initial';
import * as migration_20260915_023701_user_roles_from_plan_5 from './20260915_023701_user_roles_from_plan_5';
import * as migration_20260915_033625_phase2_digital_catalog from './20260915_033625_phase2_digital_catalog';
import * as migration_20260915_062953_phase3_seller_moderation from './20260915_062953_phase3_seller_moderation';
import * as migration_20260915_064708_phase4_payment_wallet from './20260915_064708_phase4_payment_wallet';
import * as migration_20260915_071500_phase5_purchase_download from './20260915_071500_phase5_purchase_download';
import * as migration_20260915_100000_phase6_seller_revenue from './20260915_100000_phase6_seller_revenue';
import * as migration_20260916_000000_phase6_commission_settings from './20260916_000000_phase6_commission_settings';
import * as migration_20260917_000000_phase7_reviews from './20260917_000000_phase7_reviews';
import * as migration_20260917_010000_phase8_comments from './20260917_010000_phase8_comments';
import * as migration_20260917_052848_phase9_tickets from './20260917_052848_phase9_tickets';
import * as migration_20260918_000000_phase10_moderation_cases from './20260918_000000_phase10_moderation_cases';
import * as migration_20260919_000000_phase11_notifications from './20260919_000000_phase11_notifications';
import * as migration_20260919_120000_phase12_refund_policy from './20260919_120000_phase12_refund_policy';
import * as migration_20260920_160000_phase13_drop_unused_ecommerce_transactions from './20260920_160000_phase13_drop_unused_ecommerce_transactions';
import * as migration_20260921_000000_phase14_address_countries from './20260921_000000_phase14_address_countries';
import * as migration_20260922_000000_phase15_null_invented_spec_versions from './20260922_000000_phase15_null_invented_spec_versions';

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
  {
    up: migration_20260917_010000_phase8_comments.up,
    down: migration_20260917_010000_phase8_comments.down,
    name: '20260917_010000_phase8_comments',
  },
  {
    up: migration_20260917_052848_phase9_tickets.up,
    down: migration_20260917_052848_phase9_tickets.down,
    name: '20260917_052848_phase9_tickets'
  },
  {
    up: migration_20260918_000000_phase10_moderation_cases.up,
    down: migration_20260918_000000_phase10_moderation_cases.down,
    name: '20260918_000000_phase10_moderation_cases',
  },
  {
    up: migration_20260919_000000_phase11_notifications.up,
    down: migration_20260919_000000_phase11_notifications.down,
    name: '20260919_000000_phase11_notifications',
  },
  {
    up: migration_20260919_120000_phase12_refund_policy.up,
    down: migration_20260919_120000_phase12_refund_policy.down,
    name: '20260919_120000_phase12_refund_policy',
  },
  {
    up: migration_20260920_160000_phase13_drop_unused_ecommerce_transactions.up,
    down: migration_20260920_160000_phase13_drop_unused_ecommerce_transactions.down,
    name: '20260920_160000_phase13_drop_unused_ecommerce_transactions',
  },
  {
    up: migration_20260921_000000_phase14_address_countries.up,
    down: migration_20260921_000000_phase14_address_countries.down,
    name: '20260921_000000_phase14_address_countries',
  },
  {
    up: migration_20260922_000000_phase15_null_invented_spec_versions.up,
    down: migration_20260922_000000_phase15_null_invented_spec_versions.down,
    name: '20260922_000000_phase15_null_invented_spec_versions',
  },
];
