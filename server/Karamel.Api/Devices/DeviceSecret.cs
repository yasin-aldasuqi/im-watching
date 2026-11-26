using System.Buffers.Text;
using System.Security.Cryptography;

namespace Karamel.Api.Devices;

/// <summary>
/// The secret key a device uses to prove it owns its id: 32 random bytes (256 bits),
/// sent as "Authorization: Bearer &lt;base64url&gt;". Only its SHA-256 hash is stored.
/// </summary>
/// <remarks>
/// A fast hash is enough here, unlike for passwords: 256 random bits cannot be guessed,
/// so a slow hash such as bcrypt would add cost without adding safety.
/// </remarks>
public static class DeviceSecret
{
    public const int Length = 32;

    public static (string Secret, byte[] Hash) Create()
    {
        var bytes = RandomNumberGenerator.GetBytes(Length);
        return (Base64Url.EncodeToString(bytes), SHA256.HashData(bytes));
    }

    /// <summary>The hash of the secret in an Authorization header, or null when it is missing or malformed.</summary>
    public static byte[]? HashFromAuthorizationHeader(string? header)
    {
        const string scheme = "Bearer ";
        if (header is null || !header.StartsWith(scheme, StringComparison.Ordinal)) return null;
        var token = header[scheme.Length..].Trim();
        byte[] bytes;
        try
        {
            bytes = Base64Url.DecodeFromChars(token);
        }
        catch (FormatException)
        {
            return null;
        }
        return bytes.Length == Length ? SHA256.HashData(bytes) : null;
    }

    /// <summary>Compares in constant time, so response timing does not reveal how much of a guess was right.</summary>
    public static bool Matches(byte[] presentedHash, byte[] storedHash) =>
        CryptographicOperations.FixedTimeEquals(presentedHash, storedHash);
}
