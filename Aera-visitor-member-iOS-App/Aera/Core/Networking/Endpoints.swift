import Foundation

// MARK: - AppConfig

enum AppConfig {
    static let defaultBaseURL = URL(string: "https://aera.so")!

    /// UserDefaults-Key zum Überschreiben der Basis-URL
    /// (Debug: „Konto → Entwickler", z. B. `http://localhost:3000`).
    static let baseURLDefaultsKey = "aera.baseURL"

    static var baseURL: URL {
        if let raw = UserDefaults.standard.string(forKey: baseURLDefaultsKey),
           !raw.isEmpty,
           let url = URL(string: raw) {
            return url
        }
        return defaultBaseURL
    }

    /// Basis der Mobile-API: `{APP_URL}/api/mobile/v1`.
    static var apiBaseURL: URL {
        baseURL.appending(path: "api/mobile/v1")
    }
}

// MARK: - Endpoint

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case patch = "PATCH"
}

struct Endpoint {
    let method: HTTPMethod
    /// Relativer Pfad ohne führenden Slash, z. B. `"auth/login"`.
    let path: String
    var query: [URLQueryItem]

    init(_ method: HTTPMethod, _ path: String, query: [URLQueryItem] = []) {
        self.method = method
        self.path = path
        self.query = query
    }

    var url: URL {
        var url = AppConfig.apiBaseURL.appending(path: path)
        if !query.isEmpty {
            url.append(queryItems: query)
        }
        return url
    }
}

// MARK: - Datums-Decoding

/// ISO-8601 mit und ohne Fraktionssekunden.
enum AeraDateParser {
    static let withFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static let standard: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static func date(from string: String) -> Date? {
        withFractionalSeconds.date(from: string) ?? standard.date(from: string)
    }
}

extension JSONDecoder {
    /// Decoder für alle Vertrags-Antworten (camelCase, ISO-8601-Daten).
    static let aera: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            guard let date = AeraDateParser.date(from: raw) else {
                throw DecodingError.dataCorruptedError(
                    in: container,
                    debugDescription: "Ungültiges ISO-8601-Datum: \(raw)"
                )
            }
            return date
        }
        return decoder
    }()
}

// MARK: - Multipart

/// Multipart-Body-Builder (Avatar-Upload).
struct MultipartFormData {
    let boundary = "aera.boundary.\(UUID().uuidString)"
    private var body = Data()

    var contentType: String {
        "multipart/form-data; boundary=\(boundary)"
    }

    mutating func addField(name: String, value: String) {
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(Data("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".utf8))
        body.append(Data("\(value)\r\n".utf8))
    }

    mutating func addFile(name: String, filename: String, mimeType: String, data: Data) {
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(Data("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\n".utf8))
        body.append(Data("Content-Type: \(mimeType)\r\n\r\n".utf8))
        body.append(data)
        body.append(Data("\r\n".utf8))
    }

    func encoded() -> Data {
        var result = body
        result.append(Data("--\(boundary)--\r\n".utf8))
        return result
    }
}
