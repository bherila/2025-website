import type { Passenger } from '../gameEngine'
import { feederJoinProgress, passengerGateProgress } from './sceneGeometry'
import type { QueueLayout } from './sceneTypes'

const COMPLETED_ENTRY_RETENTION_SECONDS = 1.2

export interface PassengerLoopSlot {
  entryStartedAt: number | null
  passengerId: string | null
  offset: number
}

export interface PassengerLoopAssignment {
  entryStartedAt: number | null
  passenger: Passenger
  sourcePassengers: Passenger[] | null
  offset: number
}

export interface PassengerLoopPlan {
  assignments: PassengerLoopAssignment[]
  feederPassengers: Passenger[]
  slots: PassengerLoopSlot[]
}

export function planPassengerLoopSlots({
  capacity,
  layout,
  now,
  passengers,
  phase,
  slots,
  spacing,
  speed,
}: {
  capacity: number
  layout: QueueLayout
  now: number
  passengers: Passenger[]
  phase: number
  slots: PassengerLoopSlot[]
  spacing: number
  speed: number
}): PassengerLoopPlan {
  const passengerById = new Map(passengers.map((passenger) => [passenger.id, passenger]))
  const initialFill = slots.length === 0
  const nextSlots = slots.map((slot) => {
    if (!slot.passengerId || !passengerById.has(slot.passengerId)) {
      return {
        ...slot,
        entryStartedAt: null,
        passengerId: null,
      }
    }

    return {
      ...slot,
      entryStartedAt: entryIsActive(slot.entryStartedAt, now) ? slot.entryStartedAt : null,
    }
  })
  const targetCapacity = passengers.length > 0 ? Math.max(capacity, nextSlots.length) : nextSlots.length

  while (nextSlots.length < targetCapacity) {
    const previousSlot = nextSlots[nextSlots.length - 1]
    nextSlots.push({
      entryStartedAt: null,
      passengerId: null,
      offset: previousSlot ? previousSlot.offset - spacing : -spacing,
    })
  }

  const assignedPassengerIds = new Set(
    nextSlots
      .map((slot) => slot.passengerId)
      .filter((passengerId): passengerId is string => passengerId !== null),
  )
  const unassignedPassengers = passengers.filter((passenger) => !assignedPassengerIds.has(passenger.id))
  const entrySources = new Map<string, Passenger[]>()
  for (const slot of nextSlots) {
    if (slot.passengerId || unassignedPassengers.length === 0) {
      continue
    }

    const nextPassenger = unassignedPassengers[0]
    if (!nextPassenger) {
      continue
    }

    const sourcePassengers = [...unassignedPassengers]
    slot.passengerId = nextPassenger.id
    slot.entryStartedAt = initialFill
      ? null
      : now + timeUntilFeederJoin(phase, slot.offset, layout, speed)
    assignedPassengerIds.add(nextPassenger.id)
    unassignedPassengers.shift()

    if (slot.entryStartedAt !== null) {
      entrySources.set(nextPassenger.id, sourcePassengers)
    }
  }

  const assignments: PassengerLoopAssignment[] = []
  for (const slot of nextSlots) {
    if (!slot.passengerId) {
      continue
    }

    const passenger = passengerById.get(slot.passengerId)
    if (!passenger) {
      continue
    }

    assignments.push({
      entryStartedAt: slot.entryStartedAt,
      passenger,
      sourcePassengers: slot.entryStartedAt === null
        ? null
        : entrySources.get(passenger.id) ?? [passenger, ...unassignedPassengers],
      offset: slot.offset,
    })
  }

  return {
    assignments,
    feederPassengers: unassignedPassengers,
    slots: nextSlots,
  }
}

function timeUntilFeederJoin(phase: number, offset: number, layout: QueueLayout, speed: number): number {
  const currentProgress = passengerGateProgress(phase, offset, layout)
  const joinProgress = feederJoinProgress(layout)
  const distance = ((joinProgress - currentProgress) + layout.perimeter) % layout.perimeter

  return distance / Math.max(0.001, speed)
}

function entryIsActive(startedAt: number | null, now: number): boolean {
  return startedAt !== null && now - startedAt <= COMPLETED_ENTRY_RETENTION_SECONDS
}
