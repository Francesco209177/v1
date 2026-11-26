import Foundation
@testable import MareaLogic

/// Scrittore PNG minimo (dati non compressi): serve solo alle anteprime su Linux.
enum PNGWriter {
    private static let crcTable: [UInt32] = {
        var table: [UInt32] = [UInt32](repeating: 0, count: 256)
        for n in 0..<256 {
            var c: UInt32 = UInt32(n)
            for _ in 0..<8 {
                c = (c & 1) != 0 ? (0xEDB8_8320 ^ (c >> 1)) : (c >> 1)
            }
            table[n] = c
        }
        return table
    }()

    private static func crc(_ bytes: [UInt8]) -> UInt32 {
        var c: UInt32 = 0xFFFF_FFFF
        for b in bytes { c = crcTable[Int((c ^ UInt32(b)) & 0xFF)] ^ (c >> 8) }
        return c ^ 0xFFFF_FFFF
    }

    private static func be(_ v: UInt32) -> [UInt8] {
        return [UInt8((v >> 24) & 0xFF), UInt8((v >> 16) & 0xFF), UInt8((v >> 8) & 0xFF), UInt8(v & 0xFF)]
    }

    private static func chunk(_ type: String, _ payload: [UInt8]) -> [UInt8] {
        let body: [UInt8] = Array(type.utf8) + payload
        return be(UInt32(payload.count)) + body + be(crc(body))
    }

    static func encode(_ image: PixelBuffer) -> [UInt8] {
        var raw: [UInt8] = []
        raw.reserveCapacity(image.height * (image.width * 4 + 1))
        for y in 0..<image.height {
            raw.append(0)
            let start: Int = y * image.width * 4
            raw.append(contentsOf: image.data[start..<(start + image.width * 4)])
        }
        var zlib: [UInt8] = [0x78, 0x01]
        var offset: Int = 0
        var a: UInt32 = 1
        var b: UInt32 = 0
        for byte in raw {
            a = (a + UInt32(byte)) % 65521
            b = (b + a) % 65521
        }
        if raw.isEmpty { zlib.append(contentsOf: [1, 0, 0, 0xFF, 0xFF]) }
        while offset < raw.count {
            let n: Int = min(65535, raw.count - offset)
            let last: UInt8 = offset + n >= raw.count ? 1 : 0
            zlib.append(last)
            zlib.append(UInt8(n & 0xFF))
            zlib.append(UInt8((n >> 8) & 0xFF))
            zlib.append(UInt8(~n & 0xFF))
            zlib.append(UInt8((~n >> 8) & 0xFF))
            zlib.append(contentsOf: raw[offset..<(offset + n)])
            offset += n
        }
        zlib.append(contentsOf: be((b << 16) | a))
        var out: [UInt8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
        out.append(contentsOf: chunk("IHDR", be(UInt32(image.width)) + be(UInt32(image.height)) + [8, 6, 0, 0, 0]))
        out.append(contentsOf: chunk("IDAT", zlib))
        out.append(contentsOf: chunk("IEND", []))
        return out
    }

    static func write(_ image: PixelBuffer, to path: String) throws {
        let url: URL = URL(fileURLWithPath: path)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(encode(image)).write(to: url)
    }
}
