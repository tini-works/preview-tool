import {
  ScreenHeader,
  Stack,
  Card,
  ListItem,
  Textarea,
  Footer,
  Button,
} from '@/components/screen'
import type { BookingSearchData } from './scenarios'

export default function BookingSearchScreen({ data }: { data: BookingSearchData }) {
  const { fields, reason, canSearch, isSearching } = data

  return (
    <>
      <ScreenHeader
        title="Search for Appointment"
        data-flow-target="ScreenHeader:Search for Appointment"
      />

      <Stack gap="md" className="p-4">
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
