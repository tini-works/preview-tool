import {
  ScreenHeader,
  Stack,
  RadioCard,
  Card,
  ListItem,
  Button,
  Footer,
} from '@/components/screen'
import type { BookingTypeData } from './scenarios'

export default function BookingTypeScreen({ data }: { data: BookingTypeData }) {
  const { selectedType } = data
  const isSaveEnabled = selectedType === 'acute'

  return (
    <>
      <ScreenHeader
        title="Booking type"
        data-flow-target="ScreenHeader:Booking type"
      />

      <Stack gap="md" className="p-4">
        <p className="text-sm font-medium text-charcoal-400">Select booking type</p>

        <Stack gap="sm">
          <RadioCard
            data-flow-target="RadioCard:Acute"
            selected={selectedType === 'acute'}
          >
            Acute
          </RadioCard>
          <RadioCard
            data-flow-target="RadioCard:Prevention"
            selected={selectedType === 'prevention'}
          >
            Prevention
          </RadioCard>
          <RadioCard
            data-flow-target="RadioCard:Follow-up"
            selected={selectedType === 'follow-up'}
          >
            Follow-up
          </RadioCard>
        </Stack>

        {selectedType === 'prevention' && (
          <Card className="overflow-hidden p-0">
            <ListItem
              icon="🩺"
              label="Specialty & Doctor"
              description="Select..."
              required
              data-flow-target="ListItem:Specialty & Doctor"
            />
            <ListItem icon="📄" label="Referral" description="Optional" />
          </Card>
        )}

        {selectedType === 'follow-up' && (
          <Card className="overflow-hidden p-0">
            <ListItem
              icon="👨‍⚕️"
              label="Doctor"
              description="Select..."
              required
            />
          </Card>
        )}

        <Footer>
          <Button
            data-flow-target="Button:Save"
            variant={isSaveEnabled ? 'primary' : 'secondary'}
            size="lg"
            className={isSaveEnabled ? 'w-full' : 'w-full opacity-50'}
          >
            Save
          </Button>
        </Footer>
      </Stack>
    </>
  )
}
