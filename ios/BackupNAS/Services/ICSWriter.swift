import Foundation

// Modello indipendente da EventKit, così la scrittura iCalendar (RFC 5545) è testabile.

struct ICSRecurrence: Equatable {
    var frequency: String // DAILY, WEEKLY, MONTHLY, YEARLY
    var interval: Int = 1
    var count: Int?
    var until: Date?
    var byDay: [String] = [] // "MO", "1MO", "-1FR"
    var byMonthDay: [Int] = []
    var byMonth: [Int] = []
    var byYearDay: [Int] = []
    var byWeekNo: [Int] = []
    var bySetPos: [Int] = []
}

struct ICSAlarm: Equatable {
    /// Secondi rispetto all'inizio (negativo = prima).
    var relativeOffset: TimeInterval?
    var absoluteDate: Date?
}

struct ICSEvent: Equatable {
    var uid: String
    var summary: String
    var location: String?
    var notes: String?
    var url: String?
    var start: Date
    var end: Date
    var isAllDay: Bool
    var created: Date?
    var lastModified: Date?
    var recurrence: [ICSRecurrence] = []
    /// Per le occorrenze modificate di una serie: data originale dell'occorrenza.
    var recurrenceID: Date?
    var alarms: [ICSAlarm] = []
}

struct ICSTodo: Equatable {
    var uid: String
    var summary: String
    var notes: String?
    var url: String?
    var due: Date?
    var dueIsAllDay: Bool = false
    var isCompleted: Bool
    var completed: Date?
    /// 0 = nessuna, 1 = alta ... 9 = bassa (come EventKit e RFC 5545).
    var priority: Int = 0
    var created: Date?
    var lastModified: Date?
    var recurrence: [ICSRecurrence] = []
    var alarms: [ICSAlarm] = []
}

enum ICSWriter {
    static let productID = "-//BackupNAS//iOS//IT"

    static func calendar(name: String, events: [ICSEvent] = [], todos: [ICSTodo] = [], calendar: Calendar = .current) -> String {
        var lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:\(productID)",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            "X-WR-CALNAME:\(escape(name))",
        ]
        let stamp = utc(Date())
        for event in events {
            lines.append(contentsOf: eventLines(event, stamp: stamp, calendar: calendar))
        }
        for todo in todos {
            lines.append(contentsOf: todoLines(todo, stamp: stamp, calendar: calendar))
        }
        lines.append("END:VCALENDAR")
        return lines.map(fold).joined(separator: "\r\n") + "\r\n"
    }

    static func eventLines(_ event: ICSEvent, stamp: String, calendar: Calendar) -> [String] {
        var lines = ["BEGIN:VEVENT", "UID:\(escape(event.uid))", "DTSTAMP:\(stamp)"]
        if event.isAllDay {
            let startDay = calendar.startOfDay(for: event.start)
            var endDay = calendar.startOfDay(for: event.end)
            // In iCalendar la data di fine di un evento "tutto il giorno" è esclusa.
            if endDay <= startDay || event.end > endDay {
                endDay = calendar.date(byAdding: .day, value: 1, to: endDay) ?? endDay
            }
            if endDay <= startDay {
                endDay = calendar.date(byAdding: .day, value: 1, to: startDay) ?? startDay
            }
            lines.append("DTSTART;VALUE=DATE:\(dateOnly(startDay, calendar: calendar))")
            lines.append("DTEND;VALUE=DATE:\(dateOnly(endDay, calendar: calendar))")
        } else {
            lines.append("DTSTART:\(utc(event.start))")
            lines.append("DTEND:\(utc(max(event.end, event.start)))")
        }
        if let recurrenceID = event.recurrenceID {
            lines.append(event.isAllDay
                ? "RECURRENCE-ID;VALUE=DATE:\(dateOnly(recurrenceID, calendar: calendar))"
                : "RECURRENCE-ID:\(utc(recurrenceID))")
        }
        lines.append("SUMMARY:\(escape(event.summary))")
        if let location = event.location, !location.isEmpty { lines.append("LOCATION:\(escape(location))") }
        if let notes = event.notes, !notes.isEmpty { lines.append("DESCRIPTION:\(escape(notes))") }
        if let url = event.url, !url.isEmpty { lines.append("URL:\(url)") }
        if let created = event.created { lines.append("CREATED:\(utc(created))") }
        if let modified = event.lastModified { lines.append("LAST-MODIFIED:\(utc(modified))") }
        for rule in event.recurrence {
            lines.append("RRULE:\(rrule(rule))")
        }
        for alarm in event.alarms {
            lines.append(contentsOf: alarmLines(alarm, summary: event.summary))
        }
        lines.append("END:VEVENT")
        return lines
    }

    static func todoLines(_ todo: ICSTodo, stamp: String, calendar: Calendar) -> [String] {
        var lines = ["BEGIN:VTODO", "UID:\(escape(todo.uid))", "DTSTAMP:\(stamp)"]
        lines.append("SUMMARY:\(escape(todo.summary))")
        if let notes = todo.notes, !notes.isEmpty { lines.append("DESCRIPTION:\(escape(notes))") }
        if let url = todo.url, !url.isEmpty { lines.append("URL:\(url)") }
        if let due = todo.due {
            lines.append(todo.dueIsAllDay ? "DUE;VALUE=DATE:\(dateOnly(due, calendar: calendar))" : "DUE:\(utc(due))")
        }
        if todo.priority > 0 { lines.append("PRIORITY:\(min(todo.priority, 9))") }
        if todo.isCompleted {
            lines.append("STATUS:COMPLETED")
            if let completed = todo.completed { lines.append("COMPLETED:\(utc(completed))") }
        } else {
            lines.append("STATUS:NEEDS-ACTION")
        }
        if let created = todo.created { lines.append("CREATED:\(utc(created))") }
        if let modified = todo.lastModified { lines.append("LAST-MODIFIED:\(utc(modified))") }
        for rule in todo.recurrence {
            lines.append("RRULE:\(rrule(rule))")
        }
        for alarm in todo.alarms {
            lines.append(contentsOf: alarmLines(alarm, summary: todo.summary))
        }
        lines.append("END:VTODO")
        return lines
    }

    static func alarmLines(_ alarm: ICSAlarm, summary: String) -> [String] {
        let trigger: String
        if let absolute = alarm.absoluteDate {
            trigger = "TRIGGER;VALUE=DATE-TIME:\(utc(absolute))"
        } else {
            trigger = "TRIGGER:\(duration(alarm.relativeOffset ?? 0))"
        }
        return ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:\(escape(summary))", trigger, "END:VALARM"]
    }

    static func rrule(_ rule: ICSRecurrence) -> String {
        var parts = ["FREQ=\(rule.frequency)"]
        if rule.interval > 1 { parts.append("INTERVAL=\(rule.interval)") }
        if let count = rule.count, count > 0 {
            parts.append("COUNT=\(count)")
        } else if let until = rule.until {
            parts.append("UNTIL=\(utc(until))")
        }
        func list(_ name: String, _ values: [Int]) {
            if !values.isEmpty { parts.append("\(name)=" + values.map(String.init).joined(separator: ",")) }
        }
        if !rule.byDay.isEmpty { parts.append("BYDAY=" + rule.byDay.joined(separator: ",")) }
        list("BYMONTHDAY", rule.byMonthDay)
        list("BYMONTH", rule.byMonth)
        list("BYYEARDAY", rule.byYearDay)
        list("BYWEEKNO", rule.byWeekNo)
        list("BYSETPOS", rule.bySetPos)
        return parts.joined(separator: ";")
    }

    /// Durata RFC 5545: -900 -> "-PT15M", 86400 -> "P1D", 0 -> "PT0S".
    static func duration(_ seconds: TimeInterval) -> String {
        let total = Int(seconds.rounded())
        let sign = total < 0 ? "-" : ""
        var remaining = abs(total)
        let days = remaining / 86_400; remaining %= 86_400
        let hours = remaining / 3_600; remaining %= 3_600
        let minutes = remaining / 60
        let secs = remaining % 60
        var result = sign + "P"
        if days > 0 { result += "\(days)D" }
        if hours > 0 || minutes > 0 || secs > 0 || days == 0 {
            result += "T"
            if hours > 0 { result += "\(hours)H" }
            if minutes > 0 { result += "\(minutes)M" }
            if secs > 0 || (hours == 0 && minutes == 0) { result += "\(secs)S" }
        }
        return result
    }

    /// Escape dei valori di testo: \ ; , e a capo.
    static func escape(_ text: String) -> String {
        var result = ""
        for character in text {
            switch character {
            case "\\": result += "\\\\"
            case ";": result += "\\;"
            case ",": result += "\\,"
            case "\r\n", "\n", "\r": result += "\\n"
            default: result.append(character)
            }
        }
        return result
    }

    /// Spezza le righe più lunghe di 75 byte (UTF-8) senza tagliare un carattere a metà.
    static func fold(_ line: String) -> String {
        guard line.utf8.count > 75 else { return line }
        var result = ""
        var currentBytes = 0
        var limit = 75
        for character in line {
            let size = String(character).utf8.count
            if currentBytes + size > limit {
                result += "\r\n "
                currentBytes = 1
                limit = 75
            }
            result.append(character)
            currentBytes += size
        }
        return result
    }

    static func utc(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
        return formatter.string(from: date)
    }

    static func dateOnly(_ date: Date, calendar: Calendar) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyyMMdd"
        return formatter.string(from: date)
    }
}
