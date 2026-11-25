import EventKit
import Foundation

/// Esporta calendari e promemoria in file .ics (uno per calendario / elenco).
enum CalendarExporter {
    struct ExportedFile {
        var fileName: String
        var data: Data
        var itemCount: Int
    }

    // MARK: - Permessi

    static func requestEventAccess(_ store: EKEventStore) async throws {
        let granted: Bool
        if #available(iOS 17.0, *) {
            granted = try await store.requestFullAccessToEvents()
        } else {
            granted = try await store.requestAccess(to: .event)
        }
        if !granted { throw BackupError.permissionDenied("i Calendari") }
    }

    static func requestReminderAccess(_ store: EKEventStore) async throws {
        let granted: Bool
        if #available(iOS 17.0, *) {
            granted = try await store.requestFullAccessToReminders()
        } else {
            granted = try await store.requestAccess(to: .reminder)
        }
        if !granted { throw BackupError.permissionDenied("i Promemoria") }
    }

    // MARK: - Calendari

    /// Legge gli eventi dal 2000 a oggi + 2 anni (in finestre da 4 anni, limite di EventKit).
    static func exportEvents(store: EKEventStore, now: Date = Date()) -> [ExportedFile] {
        let calendar = Calendar.current
        let calendars = store.calendars(for: .event)
        guard !calendars.isEmpty else { return [] }
        var eventsByCalendar: [String: [ICSEvent]] = [:]
        var seenKeys = Set<String>()

        var windowStart = calendar.date(from: DateComponents(year: 2000, month: 1, day: 1)) ?? now
        let finalEnd = calendar.date(byAdding: .year, value: 2, to: now) ?? now
        while windowStart < finalEnd {
            let windowEnd = min(calendar.date(byAdding: .day, value: 4 * 365, to: windowStart) ?? finalEnd, finalEnd)
            let predicate = store.predicateForEvents(withStart: windowStart, end: windowEnd, calendars: calendars)
            let events = store.events(matching: predicate).sorted { $0.startDate < $1.startDate }
            for event in events {
                let uid = event.calendarItemExternalIdentifier ?? event.calendarItemIdentifier
                let isSeriesOccurrence = event.hasRecurrenceRules && !event.isDetached
                let key: String
                if isSeriesOccurrence {
                    key = "series|\(uid)" // la serie si scrive una volta sola, con la sua RRULE
                } else if event.isDetached {
                    key = "detached|\(uid)|\(event.occurrenceDate?.timeIntervalSince1970 ?? event.startDate.timeIntervalSince1970)"
                } else {
                    key = "single|\(uid)|\(event.startDate.timeIntervalSince1970)"
                }
                guard seenKeys.insert(key).inserted else { continue }
                let item = makeEvent(event, uid: uid)
                eventsByCalendar[event.calendar.calendarIdentifier, default: []].append(item)
            }
            windowStart = windowEnd
        }

        return uniqueNames(calendars.compactMap { cal in
            guard let events = eventsByCalendar[cal.calendarIdentifier], !events.isEmpty else { return nil }
            let text = ICSWriter.calendar(name: cal.title, events: events)
            return ExportedFile(fileName: fileName(for: cal), data: Data(text.utf8), itemCount: events.count)
        })
    }

    private static func makeEvent(_ event: EKEvent, uid: String) -> ICSEvent {
        ICSEvent(
            uid: uid,
            summary: event.title ?? "",
            location: event.location,
            notes: event.notes,
            url: event.url?.absoluteString,
            start: event.startDate,
            end: event.endDate,
            isAllDay: event.isAllDay,
            created: event.creationDate,
            lastModified: event.lastModifiedDate,
            recurrence: event.isDetached ? [] : (event.recurrenceRules ?? []).map(makeRecurrence),
            recurrenceID: event.isDetached ? event.occurrenceDate : nil,
            alarms: (event.alarms ?? []).map(makeAlarm)
        )
    }

    // MARK: - Promemoria

    static func exportReminders(store: EKEventStore) async -> [ExportedFile] {
        let lists = store.calendars(for: .reminder)
        guard !lists.isEmpty else { return [] }
        let predicate = store.predicateForReminders(in: lists)
        let reminders: [EKReminder] = await withCheckedContinuation { continuation in
            store.fetchReminders(matching: predicate) { result in
                continuation.resume(returning: result ?? [])
            }
        }
        var byList: [String: [ICSTodo]] = [:]
        for reminder in reminders {
            byList[reminder.calendar.calendarIdentifier, default: []].append(makeTodo(reminder))
        }
        return uniqueNames(lists.compactMap { list in
            guard let todos = byList[list.calendarIdentifier], !todos.isEmpty else { return nil }
            let text = ICSWriter.calendar(name: list.title, todos: todos)
            return ExportedFile(fileName: fileName(for: list), data: Data(text.utf8), itemCount: todos.count)
        })
    }

    private static func makeTodo(_ reminder: EKReminder) -> ICSTodo {
        var due: Date?
        var dueIsAllDay = false
        if let components = reminder.dueDateComponents {
            var calendar = Calendar.current
            if let timeZone = components.timeZone { calendar.timeZone = timeZone }
            due = calendar.date(from: components)
            dueIsAllDay = components.hour == nil
        }
        return ICSTodo(
            uid: reminder.calendarItemExternalIdentifier ?? reminder.calendarItemIdentifier,
            summary: reminder.title ?? "",
            notes: reminder.notes,
            url: reminder.url?.absoluteString,
            due: due,
            dueIsAllDay: dueIsAllDay,
            isCompleted: reminder.isCompleted,
            completed: reminder.completionDate,
            priority: reminder.priority,
            created: reminder.creationDate,
            lastModified: reminder.lastModifiedDate,
            recurrence: (reminder.recurrenceRules ?? []).map(makeRecurrence),
            alarms: (reminder.alarms ?? []).map(makeAlarm)
        )
    }

    // MARK: - Conversioni EventKit -> modello ICS

    private static func makeRecurrence(_ rule: EKRecurrenceRule) -> ICSRecurrence {
        let frequency: String
        switch rule.frequency {
        case .daily: frequency = "DAILY"
        case .weekly: frequency = "WEEKLY"
        case .monthly: frequency = "MONTHLY"
        case .yearly: frequency = "YEARLY"
        @unknown default: frequency = "DAILY"
        }
        var recurrence = ICSRecurrence(frequency: frequency, interval: max(rule.interval, 1))
        if let end = rule.recurrenceEnd {
            if end.occurrenceCount > 0 {
                recurrence.count = end.occurrenceCount
            } else {
                recurrence.until = end.endDate
            }
        }
        recurrence.byDay = (rule.daysOfTheWeek ?? []).map { day in
            let code = weekdayCode(day.dayOfTheWeek)
            return day.weekNumber == 0 ? code : "\(day.weekNumber)\(code)"
        }
        recurrence.byMonthDay = (rule.daysOfTheMonth ?? []).map(\.intValue)
        recurrence.byMonth = (rule.monthsOfTheYear ?? []).map(\.intValue)
        recurrence.byYearDay = (rule.daysOfTheYear ?? []).map(\.intValue)
        recurrence.byWeekNo = (rule.weeksOfTheYear ?? []).map(\.intValue)
        recurrence.bySetPos = (rule.setPositions ?? []).map(\.intValue)
        return recurrence
    }

    static func weekdayCode(_ weekday: EKWeekday) -> String {
        switch weekday {
        case .sunday: return "SU"
        case .monday: return "MO"
        case .tuesday: return "TU"
        case .wednesday: return "WE"
        case .thursday: return "TH"
        case .friday: return "FR"
        case .saturday: return "SA"
        @unknown default: return "MO"
        }
    }

    private static func makeAlarm(_ alarm: EKAlarm) -> ICSAlarm {
        ICSAlarm(relativeOffset: alarm.absoluteDate == nil ? alarm.relativeOffset : nil, absoluteDate: alarm.absoluteDate)
    }

    /// Due calendari con lo stesso nome non devono sovrascriversi: "Casa.ics", "Casa 2.ics".
    private static func uniqueNames(_ files: [ExportedFile]) -> [ExportedFile] {
        var used = Set<String>()
        return files.map { file in
            var file = file
            let base = (file.fileName as NSString).deletingPathExtension
            var candidate = file.fileName
            var counter = 2
            while used.contains(candidate.lowercased()) {
                candidate = "\(base) \(counter).ics"
                counter += 1
            }
            used.insert(candidate.lowercased())
            file.fileName = candidate
            return file
        }
    }

    private static func fileName(for calendar: EKCalendar) -> String {
        let source = calendar.source?.title ?? ""
        let base = source.isEmpty ? calendar.title : "\(calendar.title) (\(source))"
        return PathUtils.sanitize(base) + ".ics"
    }
}
