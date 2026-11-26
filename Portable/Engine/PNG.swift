/// Scrittore PNG minimo per le istantanee della prova automatica e degli strumenti.
/// La compressione è un deflate a codici fissi che cerca solo ripetizioni a distanza 1 e 3:
/// poco codice, e sulla pixel art ingrandita riduce i file di decine di volte.
enum PNG {
    private static let lengthBase: [Int] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
    private static let lengthExtra: [Int] = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]

    private struct BitWriter {
        var bytes: [UInt8] = []
        var acc: UInt32 = 0
        var count: UInt32 = 0

        /// Bit dal meno significativo (campi numerici del deflate).
        mutating func put(_ value: UInt32, _ bits: UInt32) {
            acc |= value << count
            count += bits
            while count >= 8 {
                bytes.append(UInt8(acc & 0xFF))
                acc >>= 8
                count -= 8
            }
        }

        /// Codice di Huffman: va scritto dal bit più significativo.
        mutating func code(_ value: UInt32, _ bits: UInt32) {
            var reversed: UInt32 = 0
            var i: UInt32 = 0
            while i < bits {
                reversed = (reversed << 1) | ((value >> i) & 1)
                i += 1
            }
            put(reversed, bits)
        }

        mutating func symbol(_ s: Int) {
            if s < 144 {
                code(UInt32(0x30 + s), 8)
            } else if s < 256 {
                code(UInt32(0x190 + s - 144), 9)
            } else if s < 280 {
                code(UInt32(s - 256), 7)
            } else {
                code(UInt32(0xC0 + s - 280), 8)
            }
        }

        mutating func finish() {
            if count > 0 {
                bytes.append(UInt8(acc & 0xFF))
                acc = 0
                count = 0
            }
        }
    }

    /// Flusso zlib con un solo blocco a codici fissi.
    private static func deflate(_ raw: [UInt8]) -> [UInt8] {
        var w: BitWriter = BitWriter()
        w.bytes.reserveCapacity(raw.count / 8 + 64)
        w.bytes.append(0x78)
        w.bytes.append(0x01)
        w.put(1, 1)
        w.put(1, 2)
        let n: Int = raw.count
        var i: Int = 0
        while i < n {
            var best: Int = 0
            var bestDistance: Int = 0
            for distance in [1, 3] where i >= distance {
                var length: Int = 0
                let limit: Int = min(258, n - i)
                while length < limit && raw[i + length] == raw[i + length - distance] { length += 1 }
                if length > best {
                    best = length
                    bestDistance = distance
                }
            }
            if best >= 3 {
                var index: Int = lengthBase.count - 1
                while lengthBase[index] > best { index -= 1 }
                w.symbol(257 + index)
                if lengthExtra[index] > 0 { w.put(UInt32(best - lengthBase[index]), UInt32(lengthExtra[index])) }
                w.code(UInt32(bestDistance - 1), 5)
                i += best
            } else {
                w.symbol(Int(raw[i]))
                i += 1
            }
        }
        w.symbol(256)
        w.finish()
        var a: UInt32 = 1
        var b: UInt32 = 0
        var k: Int = 0
        while k < n {
            let end: Int = min(n, k + 3800)
            while k < end {
                a += UInt32(raw[k])
                b += a
                k += 1
            }
            a %= 65_521
            b %= 65_521
        }
        var out: [UInt8] = w.bytes
        appendBE((b << 16) | a, to: &out)
        return out
    }

    private static let crcTable: [UInt32] = {
        var table: [UInt32] = [UInt32](repeating: 0, count: 256)
        var n: Int = 0
        while n < 256 {
            var c: UInt32 = UInt32(n)
            var k: Int = 0
            while k < 8 {
                c = (c & 1) != 0 ? (0xEDB8_8320 ^ (c >> 1)) : (c >> 1)
                k += 1
            }
            table[n] = c
            n += 1
        }
        return table
    }()

    private static func appendBE(_ v: UInt32, to out: inout [UInt8]) {
        out.append(UInt8((v >> 24) & 0xFF))
        out.append(UInt8((v >> 16) & 0xFF))
        out.append(UInt8((v >> 8) & 0xFF))
        out.append(UInt8(v & 0xFF))
    }

    private static func appendChunk(_ type: String, _ payload: [UInt8], to out: inout [UInt8]) {
        appendBE(UInt32(payload.count), to: &out)
        var c: UInt32 = 0xFFFF_FFFF
        for b in type.utf8 {
            out.append(b)
            c = crcTable[Int((c ^ UInt32(b)) & 0xFF)] ^ (c >> 8)
        }
        for b in payload { c = crcTable[Int((c ^ UInt32(b)) & 0xFF)] ^ (c >> 8) }
        out.append(contentsOf: payload)
        appendBE(c ^ 0xFFFF_FFFF, to: &out)
    }

    /// Codifica un'immagine opaca: `rgb` contiene 3 byte per pixel, riga per riga dall'alto.
    static func encode(width: Int, height: Int, rgb: [UInt8]) -> [UInt8] {
        var out: [UInt8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
        var header: [UInt8] = []
        appendBE(UInt32(width), to: &header)
        appendBE(UInt32(height), to: &header)
        header.append(contentsOf: [8, 2, 0, 0, 0])
        appendChunk("IHDR", header, to: &out)

        // Righe con il byte di filtro (0 = nessuno).
        let rowBytes: Int = width * 3 + 1
        var raw: [UInt8] = [UInt8](repeating: 0, count: rowBytes * height)
        var y: Int = 0
        while y < height {
            var x: Int = 0
            let dst: Int = y * rowBytes + 1
            let src: Int = y * width * 3
            while x < width * 3 {
                raw[dst + x] = rgb[src + x]
                x += 1
            }
            y += 1
        }
        // Filtro "Up": ogni riga meno quella sopra. La pixel art ingrandita ha righe ripetute, che diventano zeri.
        y = height - 1
        while y > 0 {
            let row: Int = y * rowBytes
            raw[row] = 2
            var x: Int = 1
            while x < rowBytes {
                raw[row + x] = raw[row + x] &- raw[row - rowBytes + x]
                x += 1
            }
            y -= 1
        }
        let z: [UInt8] = deflate(raw)
        appendChunk("IDAT", z, to: &out)
        appendChunk("IEND", [], to: &out)
        return out
    }
}
