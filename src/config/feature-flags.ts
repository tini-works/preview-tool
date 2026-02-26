import type { FlagDefinition } from '@/screens/types'

export const featureFlagConfig: Record<string, Record<string, FlagDefinition>> = {
  '/booking/search': {
    showRecentSearches: { label: 'Recent Searches', default: true },
    showSpecialties: { label: 'Specialties Filter', default: true },
  },
  '/booking/appointments': {
    showPastAppointments: { label: 'Past Appointments', default: true },
  },
  '/booking/doctor': {
    showFavorites: { label: 'Favorite Doctors', default: true },
  },
  '/booking/location': {
    showCurrentLocation: { label: 'Use Current Location', default: true },
    showRecentLocations: { label: 'Recent Locations', default: true },
  },
  '/booking/patient': {
    showInsurance: { label: 'Insurance Selection', default: true },
  },
  '/booking/time-slots': {
    showLegend: { label: 'Slot Legend', default: true },
  },
  '/prescription/confirmation': {
    showInsurance: { label: 'Insurance Section', default: true },
    showConsent: { label: 'Consent Checkbox', default: true },
  },
  '/prescription/list': {
    showSelectAll: { label: 'Select All', default: true },
    showStatusBadges: { label: 'Status Badges', default: true },
  },
  '/prescription/location': {
    showDeliveryNote: { label: 'Delivery Note', default: true },
    showMap: { label: 'Map View', default: true },
  },
  '/profile': {
    showInsurance: { label: 'Insurance Section', default: true },
    showFamilyMembers: { label: 'Family Members', default: true },
  },
}
