## 2026-09-16T13:28:12Z

<USER_REQUEST>
You are the SWE Light Orchestrator (teamwork_preview_swe).

Your working directory is: /home/trung/Documents/2026/project/test-v6/.agents/swe_orchestrator_gen4
The project root is: /home/trung/Documents/2026/project/test-v6
The authoritative request file is: /home/trung/Documents/2026/project/test-v6/.agents/ORIGINAL_REQUEST.md (see the section timestamped ## 2026-09-16T13:27:00Z).

Your objective is to orchestrate the implementation and adversarial review of the end-to-end Storefront Purchase and Download flow for KienTaoHub according to the SWE Light protocol:
1. Run one implementer (teamwork_preview_implementer) on the whole task.
2. Run repeated adversarial reviewer rounds (teamwork_preview_reviewer) carrying a cumulative open-issues ledger.
3. Establish correctness through automated tests, lint, and build.

Task Summary:
Connect the `DigitalProductCTA` component on the product details page (`/products/[slug]`) to the real backend purchase and download APIs, handling entitlement detection, wallet balance debit, free asset downloads, insufficient funds modals, and self-purchase prevention.

Key Requirements:
- R1: DigitalProductCTA & Ownership State Integration (wire into ProductDescription.tsx with real product id and seller info; check entitlement state -> show "Tải xuống ngay" if owned; if user is seller, show author status e.g. "Sản phẩm của bạn" and prevent self-purchase).
- R2: Digital Purchase Flow with Wallet Debit (clicking "Mua ngay" triggers POST /api/v1/orders/purchase with loading state; on success deduct wallet balance, grant entitlement, update button to "Tải xuống ngay", notify user, trigger/offer instant download).
- R3: Free Asset Instant Download (for free products is_free=true or price=0, clicking "Tải xuống ngay" requests token via /api/v1/downloads/token and initiates file download directly without wallet deduction).
- R4: Unauthenticated & Insufficient Balance UX (guests clicking CTA prompted to login or redirected to /login with return URL; if authenticated buyer has insufficient balance INSUFFICIENT_FUNDS, display modal with current balance, required price, shortfall amount, and quick link to /wallet).
- R5: Non-Regression & Repository Quality Gates (existing 28 test files / 419 tests continue to pass; pnpm --prefix web lint exits 0 with 0 errors; pnpm --prefix web build compiles cleanly with exit code 0).

Maintain plan.md, progress.md, and BRIEFING.md in your working directory.
When finished and all acceptance criteria pass, report completion and full test results back to the Sentinel.
</USER_REQUEST>
