using System.Buffers.Binary;
using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Karamel.Api.Tests;

/// <summary>
/// Plays the phone's part of Web Push, written from the RFCs with .NET's own cryptography,
/// independently of the library the server uses: it has its own key pair and auth secret,
/// decrypts messages (RFC 8291 + RFC 8188), and checks VAPID signatures (RFC 8292).
/// </summary>
public sealed class TestBrowser : IDisposable
{
    private readonly ECDiffieHellman _key = ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256);
    private readonly byte[] _authSecret = RandomNumberGenerator.GetBytes(16);

    public string P256dh => Base64Url.EncodeToString(PublicPoint(_key));

    public string Auth => Base64Url.EncodeToString(_authSecret);

    /// <summary>Decrypts an aes128gcm push message body (RFC 8291, section 3.4).</summary>
    public string Decrypt(byte[] body)
    {
        // RFC 8188 header: salt (16) | record size (4) | key id length (1) | key id = sender's public key.
        var salt = body.AsSpan(0, 16).ToArray();
        var recordSize = BinaryPrimitives.ReadUInt32BigEndian(body.AsSpan(16, 4));
        int idLength = body[20];
        var senderPublic = body.AsSpan(21, idLength).ToArray();
        var ciphertext = body.AsSpan(21 + idLength).ToArray();
        if (ciphertext.Length > recordSize) throw new InvalidOperationException("Expected a single record.");

        using var sender = ECDiffieHellman.Create(new ECParameters
        {
            Curve = ECCurve.NamedCurves.nistP256,
            Q = new ECPoint { X = senderPublic[1..33], Y = senderPublic[33..65] },
        });
        var sharedSecret = _key.DeriveRawSecretAgreement(sender.PublicKey);

        // IKM = HKDF(auth secret, ECDH secret, "WebPush: info" || 0 || ua_public || as_public, 32)
        byte[] keyInfo = [.. "WebPush: info\0"u8, .. PublicPoint(_key), .. senderPublic];
        var ikm = HKDF.DeriveKey(HashAlgorithmName.SHA256, sharedSecret, 32, _authSecret, keyInfo);
        var prk = HKDF.Extract(HashAlgorithmName.SHA256, ikm, salt);
        var contentKey = HKDF.Expand(HashAlgorithmName.SHA256, prk, 16, "Content-Encoding: aes128gcm\0"u8.ToArray());
        var nonce = HKDF.Expand(HashAlgorithmName.SHA256, prk, 12, "Content-Encoding: nonce\0"u8.ToArray());

        var plaintext = new byte[ciphertext.Length - 16];
        using var aes = new AesGcm(contentKey, tagSizeInBytes: 16);
        aes.Decrypt(nonce, ciphertext[..^16], ciphertext[^16..], plaintext);

        // The last record ends with the delimiter 0x02, then optional zero padding.
        var end = Array.FindLastIndex(plaintext, b => b != 0);
        if (end < 0 || plaintext[end] != 0x02) throw new InvalidOperationException("Missing the last-record delimiter.");
        return Encoding.UTF8.GetString(plaintext, 0, end);
    }

    /// <summary>
    /// Checks a "vapid t=&lt;JWT&gt;, k=&lt;public key&gt;" Authorization header (RFC 8292):
    /// an ES256 signature that verifies with k. Returns k and the JWT's claims.
    /// </summary>
    public static (string PublicKey, JsonElement Claims) VerifyVapid(string authorization)
    {
        if (!authorization.StartsWith("vapid ", StringComparison.Ordinal))
            throw new InvalidOperationException($"Expected the vapid scheme, got: {authorization}");
        var parameters = authorization["vapid ".Length..]
            .Split(',', StringSplitOptions.TrimEntries)
            .Select(part => part.Split('=', 2))
            .ToDictionary(pair => pair[0], pair => pair[1]);
        var token = parameters["t"].Split('.');
        var header = JsonDocument.Parse(Base64Url.DecodeFromChars(token[0])).RootElement;
        if (header.GetProperty("alg").GetString() != "ES256") throw new InvalidOperationException("Expected ES256.");

        var point = Base64Url.DecodeFromChars(parameters["k"]);
        using var key = ECDsa.Create(new ECParameters
        {
            Curve = ECCurve.NamedCurves.nistP256,
            Q = new ECPoint { X = point[1..33], Y = point[33..65] },
        });
        var signed = Encoding.ASCII.GetBytes($"{token[0]}.{token[1]}");
        if (!key.VerifyData(signed, Base64Url.DecodeFromChars(token[2]), HashAlgorithmName.SHA256))
            throw new InvalidOperationException("The VAPID signature does not verify.");
        return (parameters["k"], JsonDocument.Parse(Base64Url.DecodeFromChars(token[1])).RootElement);
    }

    private static byte[] PublicPoint(ECDiffieHellman key)
    {
        var q = key.ExportParameters(includePrivateParameters: false).Q;
        return [0x04, .. q.X!, .. q.Y!];
    }

    public void Dispose() => _key.Dispose();
}
