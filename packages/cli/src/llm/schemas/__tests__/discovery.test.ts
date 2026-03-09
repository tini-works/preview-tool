import { describe, it, expect } from 'vitest'
import { DiscoveryOutputSchema } from '../discovery.js'

describe('DiscoveryOutputSchema', () => {
  it('validates a well-formed discovery response', () => {
    const input = {
      screens: [
        { filePath: 'src/pages/BookingPage.tsx', route: '/booking', screenName: 'Booking Page' },
        { filePath: 'src/pages/LoginPage.tsx', route: '/login', screenName: 'Login Page' },
      ],
    }
    const result = DiscoveryOutputSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects empty screens array', () => {
    const result = DiscoveryOutputSchema.safeParse({ screens: [] })
    expect(result.success).toBe(true)
  })

  it('rejects missing filePath', () => {
    const result = DiscoveryOutputSchema.safeParse({
      screens: [{ route: '/booking', screenName: 'Booking' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing route', () => {
    const result = DiscoveryOutputSchema.safeParse({
      screens: [{ filePath: 'src/pages/Booking.tsx', screenName: 'Booking' }],
    })
    expect(result.success).toBe(false)
  })
})
