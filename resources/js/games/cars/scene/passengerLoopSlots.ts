import type { Passenger } from '../gameEngine'
import { feederJoinProgress, passengerGateProgress } from './sceneGeometry'
import type { QueueLayout } from './sceneTypes'

export const PASSENGER_LOOP_ENTRY_RETENTION_SECONDS = 1.2

export interface PassengerLoopSlot {
  entryStartedAt: number | null
  passengerId: string | null
  offset: number
}

export interface PassengerLoopShift {
  previousOffset: number
  startedAt: number
}

export interface PassengerLoopAssignment {
  entryStartedAt: number | null
  passenger: Passenger
  sourcePassengers: Passenger[] | null
  offset: number
  shift: PassengerLoopShift | null
}

export interface PassengerLoopPlan {
  assignments: PassengerLoopAssignment[]
  feederPassengers: Passenger[]
  feederLayoutPassengers: Passenger[]
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

  const shifts = new Map<string, PassengerLoopShift>()
  let writeIndex = 0
  for (let readIndex = 0; readIndex < nextSlots.length; readIndex += 1) {
    const slot = nextSlots[readIndex]
    if (!slot || slot.passengerId === null) {
      continue
    }
    if (writeIndex !== readIndex) {
      const writeSlot = nextSlots[writeIndex]
      if (writeSlot) {
        shifts.set(slot.passengerId, {
          previousOffset: slot.offset,
          startedAt: now,
        })
        writeSlot.passengerId = slot.passengerId
        writeSlot.entryStartedAt = slot.entryStartedAt !== null && slot.entryStartedAt > now
          ? now + timeUntilFeederJoin(phase, writeSlot.offset, layout, speed)
          : slot.entryStartedAt
        slot.passengerId = null
        slot.entryStartedAt = null
      }
    }
    writeIndex += 1
  }

  const occupiedSlotCount = nextSlots.filter((slot) => slot.passengerId !== null).length
  const desiredCapacity = passengers.length > 0 ? Math.max(capacity, occupiedSlotCount) : 0
  while (nextSlots.length > desiredCapacity) {
    const removeIndex = findLastEmptySlotIndex(nextSlots)
    if (removeIndex === -1) {
      break
    }
    nextSlots.splice(removeIndex, 1)
  }

  while (nextSlots.length < desiredCapacity) {
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
      sourcePassengers: slot.entryStartedAt === null ? null : entrySources.get(passenger.id) ?? null,
      offset: slot.offset,
      shift: shifts.get(passenger.id) ?? null,
    })
  }
  const pendingEntryPassengerIds = new Set(
    assignments
      .filter((assignment) => assignment.entryStartedAt !== null)
      .map((assignment) => assignment.passenger.id),
  )
  const pendingEntryPassengers = passengers.filter((passenger) => pendingEntryPassengerIds.has(passenger.id))
  const feederLayoutPassengers = [...pendingEntryPassengers, ...unassignedPassengers]
  const assignmentsWithSources = assignments.map((assignment) => {
    if (assignment.entryStartedAt === null || assignment.sourcePassengers !== null) {
      return assignment
    }

    return {
      ...assignment,
      sourcePassengers: feederLayoutPassengers,
    }
  })

  return {
    assignments: assignmentsWithSources,
    feederPassengers: unassignedPassengers,
    feederLayoutPassengers,
    slots: nextSlots,
  }
}

function findLastEmptySlotIndex(slots: PassengerLoopSlot[]): number {
  for (let i = slots.length - 1; i >= 0; i -= 1) {
    if (slots[i]?.passengerId === null) {
      return i
    }
  }

  return -1
}

function timeUntilFeederJoin(phase: number, offset: number, layout: QueueLayout, speed: number): number {
  const currentProgress = passengerGateProgress(phase, offset, layout)
  const joinProgress = feederJoinProgress(layout)
  const distance = ((joinProgress - currentProgress) + layout.perimeter) % layout.perimeter

  return distance / Math.max(0.001, speed)
}

function entryIsActive(startedAt: number | null, now: number): boolean {
  return startedAt !== null && now - startedAt <= PASSENGER_LOOP_ENTRY_RETENTION_SECONDS
}
