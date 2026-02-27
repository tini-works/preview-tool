/**
 * Generates mock data based on field names and types.
 * Uses heuristics to produce realistic-looking sample data.
 */

const FIELD_HEURISTICS: Record<string, unknown> = {
  // Personal
  name: 'Anna Mueller',
  firstName: 'Anna',
  lastName: 'Mueller',
  fullName: 'Anna Mueller',
  username: 'anna.mueller',
  displayName: 'Anna M.',

  // Contact
  email: 'anna@example.de',
  phone: '+49 30 12345678',
  phoneNumber: '+49 30 12345678',
  mobile: '+49 170 1234567',

  // Address
  address: 'Friedrichstr. 123, 10117 Berlin',
  street: 'Friedrichstr. 123',
  city: 'Berlin',
  zip: '10117',
  zipCode: '10117',
  postalCode: '10117',
  country: 'Germany',
  state: 'Berlin',

  // Financial
  price: 29.99,
  amount: 42.50,
  total: 99.99,
  subtotal: 84.03,
  tax: 15.96,
  discount: 10,
  balance: 1250.00,
  currency: 'EUR',

  // Dates & times
  date: '2026-02-27',
  startDate: '2026-03-01',
  endDate: '2026-03-15',
  createdAt: '2026-02-20T10:30:00Z',
  updatedAt: '2026-02-27T14:00:00Z',
  time: '14:30',
  startTime: '09:00',
  endTime: '17:00',

  // Identification
  id: 'item-001',
  uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  code: 'PRV-2026-001',
  reference: 'REF-001',

  // Status
  status: 'active',

  // Content
  title: 'Sample Title',
  description: 'This is a sample description for preview purposes.',
  label: 'Label',
  note: 'Additional notes go here.',
  notes: 'Additional notes go here.',
  comment: 'Sample comment text.',
  message: 'Hello, this is a sample message.',
  summary: 'Brief summary of the content.',
  content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  text: 'Sample text content.',

  // Media
  url: 'https://example.com',
  imageUrl: 'https://placehold.co/400x300',
  avatarUrl: 'https://placehold.co/100x100',
  thumbnail: 'https://placehold.co/200x200',
  image: 'https://placehold.co/400x300',

  // Counts
  count: 5,
  quantity: 3,
  total_count: 42,
  page: 1,
  pageSize: 10,
  limit: 10,
  offset: 0,

  // Boolean flags
  isActive: true,
  isEnabled: true,
  isVisible: true,
  isLoading: false,
  isError: false,
  isEmpty: false,
  isSelected: false,
  isOpen: false,
  isDone: false,
  completed: false,
  enabled: true,
  visible: true,
  active: true,
}

export function generateMockValue(fieldName: string, fieldType: string): unknown {
  // Check heuristic lookup first
  const heuristic = FIELD_HEURISTICS[fieldName]
  if (heuristic !== undefined) {
    return heuristic
  }

  // Check partial matches (case-insensitive)
  const lowerName = fieldName.toLowerCase()
  for (const [key, value] of Object.entries(FIELD_HEURISTICS)) {
    if (lowerName.includes(key.toLowerCase())) {
      return value
    }
  }

  // Type-based fallback
  switch (fieldType) {
    case 'string':
      return `Sample ${fieldName}`
    case 'number':
      return 42
    case 'boolean':
      return true
    case 'Date':
      return '2026-02-27T10:00:00Z'
    default:
      if (fieldType.endsWith('[]')) {
        return []
      }
      return `Sample ${fieldName}`
  }
}

export function generateMockArray(
  fieldName: string,
  count: number
): unknown[] {
  const items: unknown[] = []
  for (let i = 0; i < count; i++) {
    items.push({
      id: `${fieldName}-${String(i + 1).padStart(3, '0')}`,
      name: `${capitalize(fieldName)} Item ${i + 1}`,
    })
  }
  return items
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
