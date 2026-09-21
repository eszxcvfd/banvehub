# 0017 No Loyalty-Points Promise Without a Ledger

Date: 2026-09-21

## Status

Accepted

## Context

The owner asked on 2026-09-21 about a "chương trình xu/loyalty" whose copy promises points while the
schema stores none. The premise was accurate, and the two surfaces are on record as **D36** and
**D43** of `docs/plans/completed/ui-api-integration.md`:

- D36 — `/wallet` rendered a card reading "**Điểm thưởng tích lũy 484 điểm**" under the label
  "**Tích lũy 1% mỗi đơn hàng**", where the figure was `Math.floor(totalSpent / 10000)` computed in
  the browser from one page of the ledger, the unit came from nowhere, and the stated 1% contradicted
  the formula (1 point per 10,000₫).
- D43 — `/login` (`LoginBanner.tsx:36-37`) promised "Tích xu thưởng & Quyền lợi thành viên — Tích lũy
  điểm thưởng và hoàn xu trên mỗi đơn hàng. Quy đổi giảm giá linh hoạt…" while no points, rewards,
  tiers or redemption exist anywhere in the schema.

Both were removed in the increment delivered as commit `7cd3397` (2026-09-21). Measured on the
settled tree that day, with the expressions recorded so the search can be repeated:

- `grep -rniE "tích điểm|điểm thưởng|nhận xu|tích xu|loyalty|reward point" web/src` → **0 display
  strings**. The only match in the whole application is a comment at
  `web/src/components/wallet/WalletClient.tsx:152`: *"No loyalty derivation: the schema stores no
  points/rewards, so nothing may display a points figure."* — the reason the card was removed, left in
  place on purpose.
- The same terms searched in `pg_dump --data-only` of the development database → **0 rows**.
- The only balance this application stores is money: `wallets.balance` with paired `wallet_ledger`
  rows (decision 0002). No column anywhere holds a points balance, an accrual rule, a tier, or a
  redemption.

So the promise is gone and the schema is still empty — the two now agree. This record keeps it that
way deliberately, because the fabrications were cheap to write and would be cheap to write again.

## Decision

1. No surface may display a points, coin ("xu"), tier or reward figure unless a record holds it. A
   loyalty number is data first and copy second — never copy first.
2. A loyalty programme is **out of P0**. If it is wanted, it arrives as its own increment: a points
   ledger with an accrual rule (what earns, at what rate, on which event), a redemption rule, an
   expiry rule, and a money-path review under decision 0002 if points can convert into wallet balance.
   It needs its own decision record before implementation.
3. The comment at `WalletClient.tsx:152` is the enforcement point of this decision and must survive
   refactors of the wallet page; deleting the comment without implementing the ledger is how the
   fabricated figure arrived the first time.
4. Wallet copy describes only what the wallet does: top-up through the SePay rail (decision 0004),
   balance, and spending at checkout.

## Alternatives Considered

1. **Implement a minimal points ledger now.** Rejected: no source asks for one, no accrual rule has
   been accepted, and a points economy that accrues without a redemption rule is a liability dressed
   as a feature.
2. **Remove the wallet-page comment and leave the code as is.** Rejected: the comment is the only
   thing stopping the next agent from re-deriving a "points" figure from the wallet balance.
3. **Reword the promise as "sắp ra mắt".** Rejected: a roadmap claim is still a claim, and `PLAN.md`
   §26 — the scope of record — contains no loyalty item.

## Consequences

Positive:

- Storefront copy and schema agree: no promise, no data, no discrepancy for a future audit to find.
- If the programme is built later, it starts from a decision instead of from a UI figure.

Tradeoffs:

- A capability some marketplaces advertise is simply absent. That is a scope statement the owner can
  change at any time by requesting the increment in clause 2.

## Verification

- The two search expressions above, run against `web/src` and a fresh `pg_dump --data-only`, with the
  match count recorded (0 is a result, and it is the result here).
- A rendered check of `/wallet` and `/login` (the two surfaces D36 and D43 named) confirming no
  points, coin or tier figure appears.
