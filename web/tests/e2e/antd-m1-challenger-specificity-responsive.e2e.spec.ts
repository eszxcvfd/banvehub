import { test, expect } from '@playwright/test'

const baseURL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'

test.describe('M1 Challenger 2: CSS Specificity, Focus States, Responsive Viewports & Edge URLs', () => {
  // ==========================================================================
  // 1. Tailwind CSS v4 vs Ant Design Specificity & Focus States
  // ==========================================================================
  test.describe('1. Tailwind CSS v4 vs Ant Design Interaction', () => {
    test('Tailwind base preflight resets do NOT override Ant Design button/input padding, borders, or border-radius', async ({
      page,
    }) => {
      await page.goto(baseURL, { waitUntil: 'networkidle' })

      // Check compiled stylesheet cascade: verify Tailwind preflight is inside @layer base
      const layerCheck = await page.evaluate(() => {
        let hasBaseLayer = false
        let hasFocusVisibleInBase = false

        for (const sheet of Array.from(document.styleSheets)) {
          try {
            for (const rule of Array.from(sheet.cssRules)) {
              if (rule instanceof CSSLayerBlockRule && rule.name === 'base') {
                hasBaseLayer = true
                for (const subRule of Array.from(rule.cssRules)) {
                  if (subRule.cssText.includes(':focus-visible')) {
                    hasFocusVisibleInBase = true
                  }
                }
              }
            }
          } catch {
            // Cross-origin sheets or opaque rules
          }
        }

        return { hasBaseLayer, hasFocusVisibleInBase }
      })

      expect(layerCheck.hasBaseLayer).toBe(true)
      expect(layerCheck.hasFocusVisibleInBase).toBe(true)

      // Inject Ant Design button & input CSS rules and DOM elements to test real browser cascade
      await page.evaluate(() => {
        const style = document.createElement('style')
        style.id = 'antd-challenger-test-styles'
        style.textContent = `
          .ant-btn {
            outline: none;
            position: relative;
            display: inline-flex;
            gap: 8px;
            align-items: center;
            justify-content: center;
            font-weight: 400;
            white-space: nowrap;
            text-align: center;
            background-image: none;
            background-color: transparent;
            border: 1px solid transparent;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.645, 0.045, 0.355, 1);
            user-select: none;
            touch-action: manipulation;
            line-height: 1.5714285714285714;
            color: rgba(0, 0, 0, 0.88);
            font-size: 14px;
            height: 32px;
            padding: 4px 15px;
            border-radius: 6px;
          }
          .ant-btn-default {
            background-color: #ffffff;
            border-color: #d9d9d9;
            box-shadow: 0 2px 0 rgba(0, 0, 0, 0.02);
          }
          .ant-btn-primary {
            color: #fff;
            background-color: #1677ff;
            box-shadow: 0 2px 0 rgba(5, 145, 255, 0.1);
          }
          .ant-btn:focus-visible {
            outline: 3px solid #91caff;
            outline-offset: 1px;
            transition: outline-offset 0s, outline 0s;
          }
          .ant-input {
            box-sizing: border-box;
            margin: 0;
            padding: 4px 11px;
            color: rgba(0, 0, 0, 0.88);
            font-size: 14px;
            line-height: 1.5714285714285714;
            background-color: #ffffff;
            background-image: none;
            border-width: 1px;
            border-style: solid;
            border-color: #d9d9d9;
            border-radius: 6px;
            transition: all 0.2s;
          }
          .ant-input:focus {
            border-color: #1677ff;
            box-shadow: 0 0 0 2px rgba(5, 145, 255, 0.1);
            outline: 0;
          }
        `
        document.head.appendChild(style)

        const container = document.createElement('div')
        container.id = 'antd-challenger-elements'
        container.innerHTML = `
          <button id="test-default-btn" class="ant-btn ant-btn-default"><span>Default Button</span></button>
          <button id="test-primary-btn" class="ant-btn ant-btn-primary"><span>Primary Button</span></button>
          <input id="test-input" class="ant-input" placeholder="Input test" />
        `
        document.body.appendChild(container)
      })

      // Verify computed styles
      const computed = await page.evaluate(() => {
        const defBtn = document.getElementById('test-default-btn')!
        const priBtn = document.getElementById('test-primary-btn')!
        const input = document.getElementById('test-input')!

        const defCs = window.getComputedStyle(defBtn)
        const priCs = window.getComputedStyle(priBtn)
        const inCs = window.getComputedStyle(input)

        return {
          defaultBtn: {
            paddingLeft: defCs.paddingLeft,
            paddingRight: defCs.paddingRight,
            borderTopWidth: defCs.borderTopWidth,
            borderTopStyle: defCs.borderTopStyle,
            borderRadius: defCs.borderRadius,
            backgroundColor: defCs.backgroundColor,
          },
          primaryBtn: {
            paddingLeft: priCs.paddingLeft,
            paddingRight: priCs.paddingRight,
            borderRadius: priCs.borderRadius,
            backgroundColor: priCs.backgroundColor,
          },
          input: {
            paddingTop: inCs.paddingTop,
            paddingLeft: inCs.paddingLeft,
            borderTopWidth: inCs.borderTopWidth,
            borderTopStyle: inCs.borderTopStyle,
            borderRadius: inCs.borderRadius,
          },
        }
      })

      // Default Button
      expect(computed.defaultBtn.paddingLeft).toBe('15px')
      expect(computed.defaultBtn.paddingRight).toBe('15px')
      expect(computed.defaultBtn.borderTopWidth).toBe('1px')
      expect(computed.defaultBtn.borderTopStyle).toBe('solid')
      expect(computed.defaultBtn.borderRadius).toBe('6px')

      // Primary Button
      expect(computed.primaryBtn.paddingLeft).toBe('15px')
      expect(computed.primaryBtn.paddingRight).toBe('15px')
      expect(computed.primaryBtn.borderRadius).toBe('6px')
      expect(computed.primaryBtn.backgroundColor).toBe('rgb(22, 119, 255)')

      // Input
      expect(computed.input.paddingTop).toBe('4px')
      expect(computed.input.paddingLeft).toBe('11px')
      expect(computed.input.borderTopWidth).toBe('1px')
      expect(computed.input.borderTopStyle).toBe('solid')
      expect(computed.input.borderRadius).toBe('6px')
    })

    test('Focus states on interactive elements: verify single clean focus outline with NO double focus ring', async ({
      page,
    }) => {
      await page.goto(baseURL, { waitUntil: 'networkidle' })

      await page.evaluate(() => {
        const style = document.createElement('style')
        style.id = 'antd-focus-test-styles'
        style.textContent = `
          .ant-btn {
            padding: 4px 15px;
            border-radius: 6px;
            border: 1px solid #d9d9d9;
            background-color: #fff;
          }
          .ant-btn:focus-visible {
            outline: 3px solid #91caff;
            outline-offset: 1px;
          }
          .ant-input {
            padding: 4px 11px;
            border: 1px solid #d9d9d9;
            border-radius: 6px;
          }
          .ant-input:focus {
            border-color: #1677ff;
            box-shadow: 0 0 0 2px rgba(5, 145, 255, 0.1);
            outline: 0;
          }
        `
        document.head.appendChild(style)

        const container = document.createElement('div')
        container.id = 'antd-focus-test-container'
        container.innerHTML = `
          <button id="focus-btn-1" class="ant-btn"><span>Btn 1</span></button>
          <button id="focus-btn-2" class="ant-btn"><span>Btn 2</span></button>
          <input id="focus-input-1" class="ant-input" />
        `
        document.body.appendChild(container)
      })

      // Use Tab navigation to trigger browser :focus-visible
      const btn1 = page.locator('#focus-btn-1')
      await btn1.press('Tab') // moves to focus-btn-2 with :focus-visible

      const btn2Focus = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement
        const cs = window.getComputedStyle(active)
        return {
          id: active.id,
          matchesFocusVisible: active.matches(':focus-visible'),
          outlineWidth: cs.outlineWidth,
          outlineStyle: cs.outlineStyle,
          outlineColor: cs.outlineColor,
          outlineOffset: cs.outlineOffset,
          boxShadow: cs.boxShadow,
        }
      })

      expect(btn2Focus.id).toBe('focus-btn-2')
      expect(btn2Focus.matchesFocusVisible).toBe(true)
      // Ant Design single 3px outline
      expect(btn2Focus.outlineWidth).toBe('3px')
      expect(btn2Focus.outlineStyle).toBe('solid')
      expect(btn2Focus.outlineColor).toBe('rgb(145, 202, 255)')
      expect(btn2Focus.outlineOffset).toBe('1px')

      // Verify NO double focus ring (Tailwind neutral-400 ring is NOT active in boxShadow)
      expect(btn2Focus.boxShadow).not.toContain('rgba(163, 163, 163')
      expect(btn2Focus.boxShadow).not.toContain('rgb(163, 163, 163')
      expect(btn2Focus.boxShadow).not.toContain('0 0 0 calc(2px')

      // Move Tab to input
      await page.keyboard.press('Tab')
      const inputFocus = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement
        const cs = window.getComputedStyle(active)
        return {
          id: active.id,
          matchesFocusVisible: active.matches(':focus-visible'),
          outlineStyle: cs.outlineStyle,
          borderColor: cs.borderTopColor,
          boxShadow: cs.boxShadow,
        }
      })

      expect(inputFocus.id).toBe('focus-input-1')
      expect(inputFocus.matchesFocusVisible).toBe(true)
      expect(inputFocus.outlineStyle).toBe('none')
      expect(inputFocus.borderColor).toBe('rgb(22, 119, 255)')
      expect(inputFocus.boxShadow).toContain('rgba(5, 145, 255, 0.1)')
    })
  })

  // ==========================================================================
  // 2. Responsive Viewports: Desktop (1280px), Tablet (768px), Mobile (375px)
  // ==========================================================================
  test.describe('2. Responsive Viewports', () => {
    const viewports = [
      { name: 'Desktop', width: 1280, height: 800 },
      { name: 'Tablet', width: 768, height: 1024 },
      { name: 'Mobile', width: 375, height: 667 },
    ]

    for (const vp of viewports) {
      test(`Storefront rendering at ${vp.name} (${vp.width}px): zero viewport overflow and zero CSS errors`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height })

        const consoleErrors: string[] = []
        page.on('console', (msg) => {
          if (msg.type() === 'error') consoleErrors.push(msg.text())
        })

        for (const route of ['/', '/shop', '/login']) {
          const response = await page.goto(`${baseURL}${route}`, { waitUntil: 'networkidle' })
          expect(response?.status()).toBe(200)

          const overflow = await page.evaluate(() => {
            return {
              docWidth: document.documentElement.scrollWidth,
              winWidth: window.innerWidth,
              bodyWidth: document.body.scrollWidth,
              hasAntdRegistry: !!document.querySelector('style#antd-cssinjs'),
            }
          })

          expect(
            overflow.docWidth,
            `Route ${route} at ${vp.width}px must not horizontally overflow`,
          ).toBeLessThanOrEqual(vp.width)
          expect(overflow.hasAntdRegistry).toBe(true)
        }

        // Verify zero CSS parsing / stylesheet errors
        const cssErrors = consoleErrors.filter((e) =>
          /css|stylesheet|antd-cssinjs|parse/i.test(e),
        )
        expect(cssErrors).toHaveLength(0)
      })
    }
  })

  // ==========================================================================
  // 3. Edge Case URLs
  // ==========================================================================
  test.describe('3. Edge Case URLs', () => {
    test('/shop route: status 200 and Ant Design registry active', async ({ request }) => {
      const res = await request.get(`${baseURL}/shop`)
      expect(res.status()).toBe(200)
      const html = await res.text()
      expect(html).toContain('id="antd-cssinjs"')
    })

    test('/login route: status 200 and Ant Design registry active', async ({ request }) => {
      const res = await request.get(`${baseURL}/login`)
      expect(res.status()).toBe(200)
      const html = await res.text()
      expect(html).toContain('id="antd-cssinjs"')
    })

    test('/admin route: status 200 and ZERO Ant Design leakage (complete isolation)', async ({
      request,
    }) => {
      const res = await request.get(`${baseURL}/admin`)
      expect(res.status()).toBe(200)
      const html = await res.text()
      expect(html).not.toContain('id="antd-cssinjs"')
      expect(html).not.toContain('ant-btn')
      expect(html).not.toContain('ant-input')
      expect(html).not.toContain('ant-menu')
    })

    test('/api/users/me route: status 200 and valid JSON unauthenticated response', async ({
      request,
    }) => {
      const res = await request.get(`${baseURL}/api/users/me`)
      expect(res.status()).toBe(200)
      const headers = res.headers()
      expect(headers['content-type']).toContain('application/json')
      const json = await res.json()
      expect(json).toHaveProperty('user')
      expect(json.user).toBeNull()
    })
  })
})
