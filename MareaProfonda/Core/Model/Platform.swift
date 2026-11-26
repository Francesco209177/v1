// Librerie di base per tutta la logica pura: questo è l'unico file che le importa.
//
// Su iPhone è Foundation. Su Android e Linux basta FoundationEssentials (dati, date, JSON, file):
// così l'app Android non deve portarsi dietro Foundation completo con i suoi 35 MB di tabelle ICU.
// `@_exported` rende l'importazione valida per tutti i file del modulo.
#if canImport(FoundationEssentials)
@_exported import FoundationEssentials
#else
@_exported import Foundation
#endif

// Funzioni matematiche del C (sin, cos, pow...) dove Foundation non le porta con sé.
#if canImport(Android)
@_exported import Android
#elseif canImport(Glibc)
@_exported import Glibc
#endif
