using System.Buffers.Text;
using System.Security.Cryptography;

namespace Karamel.Api.Push;

/// <summary>
/// The server's VAPID key pair (RFC 8292): push services check that every message is signed
/// with the private key whose public key the phone subscribed with.
/// </summary>
public static class VapidKeys
{
    /// <summary>A new P-256 key pair, both halves base64url.</summary>
    public static (string PublicKey, string PrivateKey) Generate()
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var parameters = key.ExportParameters(includePrivateParameters: true);
        return (Base64Url.EncodeToString([0x04, .. parameters.Q.X!, .. parameters.Q.Y!]),
            Base64Url.EncodeToString(parameters.D!));
    }

    /// <summary>Why the keys cannot be used, or null when they are a valid, matching pair.</summary>
    public static string? Problem(string publicKey, string privateKey)
    {
        if (string.IsNullOrWhiteSpace(publicKey) || string.IsNullOrWhiteSpace(privateKey))
            return "Push:VapidPublicKey and Push:VapidPrivateKey are required (see server/README.md).";
        byte[] point, secret;
        try
        {
            point = Base64Url.DecodeFromChars(publicKey);
            secret = Base64Url.DecodeFromChars(privateKey);
        }
        catch (FormatException)
        {
            return "The VAPID keys must be base64url.";
        }
        if (point is not [0x04, ..] || point.Length != 65 || secret.Length != 32)
            return "The VAPID public key must be 65 bytes (starting with 0x04) and the private key 32 bytes.";
        try
        {
            // Derive the public key from the private one and compare: a mismatched pair would
            // make every push fail with 403 at the push service.
            using var key = ECDsa.Create(new ECParameters { Curve = ECCurve.NamedCurves.nistP256, D = secret });
            var derived = key.ExportParameters(includePrivateParameters: false).Q;
            return derived.X!.AsSpan().SequenceEqual(point.AsSpan(1, 32)) && derived.Y!.AsSpan().SequenceEqual(point.AsSpan(33, 32))
                ? null
                : "The VAPID public and private keys do not belong together.";
        }
        catch (CryptographicException)
        {
            return "The VAPID private key is not a valid P-256 key.";
        }
    }
}
