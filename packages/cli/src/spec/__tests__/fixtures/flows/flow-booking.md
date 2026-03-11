---
id: flow-booking
type: flow
title: Booking Flow
steps:
  - screen: scr-home
    entry_state: populated
  - screen: scr-detail
    entry_state: default
branches:
  - at_step: 1
    action: back
    resume_step: 0
---

# Booking Flow
