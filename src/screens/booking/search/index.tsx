import {
  ScreenHeader,
  Stack,
  Card,
  ListItem,
  Badge,
  Textarea,
  Footer,
  Button,
} from '@/components/screen'
import type { BookingSearchData } from './scenarios'

const recentSearches = [
  { icon: '🔍', label: 'Dermatologist, Berlin Mitte', date: '2 days ago' },
  { icon: '🔍', label: 'General Practitioner, Nearby', date: '1 week ago' },
]

const specialties = [
  'General Practice',
  'Dermatology',
  'Orthopedics',
  'Cardiology',
  'Ophthalmology',
  'Dentistry',
]

export default function BookingSearchScreen({
  data,
  flags,
}: {
  data: BookingSearchData
  flags?: Record<string, boolean>
}) {
  const { fields, reason, canSearch, isSearching } = data

  return (
    <>
      <ScreenHeader
        title="Search for Appointment"
        data-flow-target="ScreenHeader:Search for Appointment"
      />

      <Stack gap="md" className="p-4">
        {flags?.showRecentSearches !== false && (
          <Card className="overflow-hidden p-0">
            <div className="border-b border-cream-300 px-4 py-2">
              <span className="text-xs font-medium text-charcoal-400">Recent Searches</span>
            </div>
            {recentSearches.map((item) => (
              <ListItem
                key={item.label}
                icon={item.icon}
                label={item.label}
                description={item.date}
              />
            ))}
          </Card>
        )}

        {flags?.showSpecialties !== false && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-charcoal-400">Specialties</span>
            <div className="flex flex-wrap gap-2">
              {specialties.map((name) => (
                <Badge key={name}>{name}</Badge>
              ))}
            </div>
          </div>
        )}

        <Card className="overflow-hidden p-0">
          {fields.map((field) => (
            <ListItem
              key={field.label}
              icon={field.icon}
              label={field.label}
              description={field.description}
              selected={field.filled}
              required={field.required}
              data-flow-target={`ListItem:${field.label}`}
            />
          ))}
        </Card>

        <Textarea
          label="Reason for visit"
          placeholder="Describe your symptoms or reason for visit..."
          value={reason}
          maxLength={200}
        />

        <Footer>
          <Button
            data-flow-target="Button:Search"
            variant={canSearch ? 'primary' : 'secondary'}
            size="lg"
            className={canSearch ? 'w-full' : 'w-full opacity-50'}
          >
            {isSearching ? 'Searching...' : 'Search'}
          </Button>
        </Footer>
      </Stack>
    </>
  )
}
