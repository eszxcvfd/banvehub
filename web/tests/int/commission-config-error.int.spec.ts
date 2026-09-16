import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { resolveCommissionRate, CommissionConfigurationError } from '@/services/commission'

describe('CommissionConfigurationError & Commission Rate Resolution Error Branches', () => {
  function createMockPayload(overrides?: {
    find?: (...args: unknown[]) => Promise<unknown>
    findGlobal?: (...args: unknown[]) => Promise<unknown>
    collections?: Record<string, unknown>
  }): Payload {
    return {
      find: overrides?.find ?? vi.fn().mockResolvedValue({ docs: [] }),
      findGlobal: overrides?.findGlobal ?? vi.fn(),
      collections: overrides?.collections ?? {},
    } as unknown as Payload
  }

  // Case 1: findGlobal throws/rejects
  describe('Case 1: findGlobal rejection handling', () => {
    it('throws CommissionConfigurationError when findGlobal rejects with an Error', async () => {
      const mockPayload = createMockPayload({
        findGlobal: vi.fn().mockRejectedValue(new Error('Database connection failed')),
      })

      await expect(
        resolveCommissionRate(mockPayload, { sellerId: 1, productId: 10 }),
      ).rejects.toThrow(CommissionConfigurationError)

      await expect(
        resolveCommissionRate(mockPayload, { sellerId: 1, productId: 10 }),
      ).rejects.toThrow('Failed to load global commission_settings: Database connection failed')
    })

    it('throws CommissionConfigurationError when findGlobal rejects with non-Error object', async () => {
      const mockPayload = createMockPayload({
        findGlobal: vi.fn().mockRejectedValue('Fatal network timeout'),
      })

      await expect(
        resolveCommissionRate(mockPayload, { sellerId: 1, productId: 10 }),
      ).rejects.toThrow(CommissionConfigurationError)

      await expect(
        resolveCommissionRate(mockPayload, { sellerId: 1, productId: 10 }),
      ).rejects.toThrow('Failed to load global commission_settings: Fatal network timeout')
    })
  })

  // Case 2: findGlobal returns null or undefined
  describe('Case 2: findGlobal returns null or undefined', () => {
    it('throws CommissionConfigurationError when findGlobal resolves to null', async () => {
      const mockPayload = createMockPayload({
        findGlobal: vi.fn().mockResolvedValue(null),
      })

      await expect(
        resolveCommissionRate(mockPayload, { sellerId: 1, productId: 10 }),
      ).rejects.toThrow(CommissionConfigurationError)

      await expect(
        resolveCommissionRate(mockPayload, { sellerId: 1, productId: 10 }),
      ).rejects.toThrow(
        'Site default commission rate is missing or invalid in commission_settings global',
      )
    })

    it('throws CommissionConfigurationError when findGlobal resolves to undefined', async () => {
      const mockPayload = createMockPayload({
        findGlobal: vi.fn().mockResolvedValue(undefined),
      })

      await expect(
        resolveCommissionRate(mockPayload, { sellerId: 1, productId: 10 }),
      ).rejects.toThrow(CommissionConfigurationError)

      await expect(
        resolveCommissionRate(mockPayload, { sellerId: 1, productId: 10 }),
      ).rejects.toThrow(
        'Site default commission rate is missing or invalid in commission_settings global',
      )
    })
  })

  // Case 3: defaultRate is missing, null, undefined, non-numeric string ('0.30'), or NaN
  describe('Case 3: invalid or missing defaultRate values', () => {
    const invalidRateScenarios = [
      {
        description: 'missing defaultRate property (empty object)',
        payloadValue: {},
      },
      {
        description: 'explicitly null defaultRate',
        payloadValue: { defaultRate: null },
      },
      {
        description: 'explicitly undefined defaultRate',
        payloadValue: { defaultRate: undefined },
      },
      {
        description: 'string representation of number ("0.30")',
        payloadValue: { defaultRate: '0.30' },
      },
      {
        description: 'NaN defaultRate',
        payloadValue: { defaultRate: NaN },
      },
      {
        description: 'boolean defaultRate (false)',
        payloadValue: { defaultRate: false },
      },
    ]

    for (const scenario of invalidRateScenarios) {
      it(`throws CommissionConfigurationError when defaultRate is ${scenario.description}`, async () => {
        const mockPayload = createMockPayload({
          findGlobal: vi.fn().mockResolvedValue(scenario.payloadValue),
        })

        await expect(
          resolveCommissionRate(mockPayload, { sellerId: 1, productId: 10 }),
        ).rejects.toThrow(CommissionConfigurationError)

        await expect(
          resolveCommissionRate(mockPayload, { sellerId: 1, productId: 10 }),
        ).rejects.toThrow(
          'Site default commission rate is missing or invalid in commission_settings global',
        )
      })
    }
  })

  // Case 4: findGlobal returns valid number and no seller override
  describe('Case 4: successful site-default rate resolution', () => {
    it('resolves site default commission rate and formatted policyVersion for 0.30', async () => {
      const mockPayload = createMockPayload({
        findGlobal: vi.fn().mockResolvedValue({ defaultRate: 0.3 }),
      })

      const result = await resolveCommissionRate(mockPayload, {
        sellerId: 1,
        productId: 10,
      })

      expect(result).toEqual({
        commissionRate: 0.3,
        policyVersion: 'site-default-v1-0.30',
        source: 'site_default',
      })
    })

    it('resolves site default commission rate and formatted policyVersion for 0.15', async () => {
      const mockPayload = createMockPayload({
        findGlobal: vi.fn().mockResolvedValue({ defaultRate: 0.15 }),
      })

      const result = await resolveCommissionRate(mockPayload, {
        sellerId: 2,
        productId: 20,
      })

      expect(result).toEqual({
        commissionRate: 0.15,
        policyVersion: 'site-default-v1-0.15',
        source: 'site_default',
      })
    })

    it('resolves site default when seller profile exists but has null commissionRate', async () => {
      const mockPayload = createMockPayload({
        find: vi.fn().mockResolvedValue({
          docs: [{ id: 99, commissionRate: null }],
        }),
        findGlobal: vi.fn().mockResolvedValue({ defaultRate: 0.25 }),
      })

      const result = await resolveCommissionRate(mockPayload, {
        sellerId: 99,
        productId: 10,
      })

      expect(result).toEqual({
        commissionRate: 0.25,
        policyVersion: 'site-default-v1-0.25',
        source: 'site_default',
      })
    })
  })

  // Case 5: Verify error instance properties
  describe('Case 5: CommissionConfigurationError instance properties', () => {
    it('verifies CommissionConfigurationError thrown from resolveCommissionRate has correct properties', async () => {
      const mockPayload = createMockPayload({
        findGlobal: vi.fn().mockRejectedValue(new Error('Underlying service failure')),
      })

      try {
        await resolveCommissionRate(mockPayload, { sellerId: 1, productId: 10 })
        expect.unreachable('Expected resolveCommissionRate to throw')
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(CommissionConfigurationError)
        expect(err).toBeInstanceOf(Error)
        const configError = err as CommissionConfigurationError
        expect(configError.name).toBe('CommissionConfigurationError')
        expect(configError.code).toBe('COMMISSION_CONFIGURATION_ERROR')
        expect(configError.message).toBe(
          'Failed to load global commission_settings: Underlying service failure',
        )
      }
    })

    it('verifies direct instantiation of CommissionConfigurationError', () => {
      const customMsg = 'Explicit configuration error message'
      const error = new CommissionConfigurationError(customMsg)

      expect(error).toBeInstanceOf(CommissionConfigurationError)
      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe('CommissionConfigurationError')
      expect(error.code).toBe('COMMISSION_CONFIGURATION_ERROR')
      expect(error.message).toBe(customMsg)
    })
  })
})
